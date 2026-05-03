/**
 * FINANCES MERCURUS
 * Source : /api/demandes/archivees/{username}
 *
 * Cas spécial : si transporteur === expéditeur (auto-demande),
 * la mission apparaît en DEUX lignes : un gain ET une dépense.
 */

let toutesLesMissions = [];
let filtreActif = 'tous';
let currentUsername = null;

document.addEventListener("DOMContentLoaded", initialiserFinances);

async function initialiserFinances() {
    currentUsername = localStorage.getItem("currentUser");
    if (!currentUsername) return;

    afficherSkeletons();

    try {
        const res = await fetch(`/api/demandes/archivees/${currentUsername}`);
        if (!res.ok) throw new Error("Erreur API");
        const data = await res.json();

        const archivees = data.archivees || [];
        const STATUTS_VALIDES = [
            "Acceptée",
            "Remboursée",
            "Remboursement demandé par transporteur",
            "Remboursement demandé par expéditeur"
        ];
        toutesLesMissions = archivees.filter(d =>
            STATUTS_VALIDES.includes(d.donnees.statut) &&
            (d.transporteur === currentUsername || d.expediteur === currentUsername)
        );

        mettreAJourKPI(toutesLesMissions, currentUsername);
        afficherTableau(toutesLesMissions, currentUsername);

    } catch (err) {
        console.error("Erreur finances :", err);
        document.getElementById("tableau-body").innerHTML = `
            <tr><td colspan="8" style="text-align:center; padding:40px; color:#e74c3c;">
                <i class="fa-solid fa-triangle-exclamation"></i> Impossible de charger les données.
            </td></tr>`;
    }
}

/* ===== EXPANSION DES MISSIONS =====
 * Transforme chaque mission en 1 ou 2 "lignes virtuelles" :
 *   - Mission normale  → 1 ligne  (_forceType: 'gain' ou 'depense')
 *   - Auto-demande     → 2 lignes (_forceType: 'gain' + _forceType: 'depense')
 */
function expanderMissions(missions, username) {
    const lignes = [];
    for (const m of missions) {
        const estTransporteur = m.transporteur === username;
        const estExpediteur   = m.expediteur   === username;
        if (estTransporteur && estExpediteur) {
            lignes.push({ ...m, _forceType: 'gain' });
            lignes.push({ ...m, _forceType: 'depense' });
        } else if (estTransporteur) {
            lignes.push({ ...m, _forceType: 'gain' });
        } else if (estExpediteur) {
            lignes.push({ ...m, _forceType: 'depense' });
        }
    }
    return lignes;
}

/* ===== KPI ===== */
function mettreAJourKPI(missions, username) {
    const actives = missions.filter(m => m.donnees.statut === "Acceptée");

    let totalGains = 0, totalDepenses = 0, distTotale = 0;
    for (const m of actives) {
        const prix = parseFloat(m.donnees.prix_fixe || 0);
        const dist = parseFloat(m.donnees.distance_km || 0);
        if (m.transporteur === username) { totalGains    += prix; distTotale += dist; }
        if (m.expediteur   === username) { totalDepenses += prix; }
        // Auto-demande : les deux branches s'appliquent → solde = 0 (correct)
    }

    const soldeNet = totalGains - totalDepenses;

    setKPI("kpi-gain",     totalGains.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-depense",  totalDepenses.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-solde",    (soldeNet >= 0 ? "+" : "") + soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-distance", Math.round(distTotale) + " km");

    const soldeEl = document.getElementById("kpi-solde");
    if (soldeEl) soldeEl.style.color = soldeNet >= 0 ? "#27ae60" : "#e74c3c";
}

function setKPI(id, valeur) {
    const el = document.getElementById(id);
    if (el) el.textContent = valeur;
}

/* ===== STATUT DE REMBOURSEMENT =====
 * Adapté au rôle forcé (_forceType) de la ligne virtuelle.
 */
function getStatutRemboursement(ligne) {
    const statut = ligne.donnees.statut;
    const type   = ligne._forceType;

    if (statut === "Remboursée") return { type: 'remboursee' };

    if (statut === "Remboursement demandé par transporteur") {
        if (type === 'gain')    return { type: 'en_attente_moi' };   // vue transporteur : c'est moi qui ai demandé
        if (type === 'depense') return { type: 'en_attente_autre' }; // vue expéditeur : l'autre a demandé
    }

    if (statut === "Remboursement demandé par expéditeur") {
        if (type === 'depense') return { type: 'en_attente_moi' };   // vue expéditeur : c'est moi qui ai demandé
        if (type === 'gain')    return { type: 'en_attente_autre' }; // vue transporteur : l'autre a demandé
    }

    return { type: 'normal' };
}

/* ===== TABLEAU ===== */
function afficherTableau(missions, username) {
    const tbody = document.getElementById("tableau-body");
    if (!tbody) return;

    const user = username || localStorage.getItem("currentUser");

    let lignes = expanderMissions(missions, user);

    if (filtreActif === 'gains')    lignes = lignes.filter(l => l._forceType === 'gain');
    if (filtreActif === 'depenses') lignes = lignes.filter(l => l._forceType === 'depense');

    if (lignes.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucune mission à afficher.</p>
                </div>
            </td></tr>`;
        return;
    }

    // Tri par date décroissante, gains avant dépenses à date égale
    lignes.sort((a, b) => {
        const diff = new Date(b.donnees.date_demande_envoi || 0) - new Date(a.donnees.date_demande_envoi || 0);
        return diff !== 0 ? diff : (a._forceType === 'gain' ? -1 : 1);
    });

    tbody.innerHTML = lignes.map(l => construireLigne(l, user)).join('');
}

function construireLigne(ligne, user) {
    const donnees       = ligne.donnees;
    const isGain        = ligne._forceType === 'gain';
    const statutRemb    = getStatutRemboursement(ligne);
    const estRemboursee = statutRemb.type === 'remboursee';
    const estAutoDemande = ligne.transporteur === ligne.expediteur;

    const refCourt  = donnees.id_demande?.split('-')[1] || donnees.id_demande || '—';
    const prix      = parseFloat(donnees.prix_fixe || 0);
    const date      = donnees.date
        ? new Date(donnees.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '—';

    const partenaireAffiche = estAutoDemande
        ? 'Vous-même'
        : ((isGain ? ligne.expediteur : ligne.transporteur) || '—');

    // -- Badge --
    let badgeHtml;
    if (estRemboursee) {
        badgeHtml = `<span class="badge remboursee"><i class="fa-solid fa-rotate-left"></i> Remboursé</span>`;
    } else if (statutRemb.type === 'en_attente_moi') {
        badgeHtml = `<span class="badge remb-attente"><i class="fa-solid fa-clock"></i> Remb. demandé</span>`;
    } else if (statutRemb.type === 'en_attente_autre') {
        badgeHtml = `<span class="badge remb-attente-autre"><i class="fa-solid fa-bell"></i> Remb. reçu</span>`;
    } else {
        badgeHtml = `<span class="badge ${isGain ? 'gain' : 'depense'}">
            <i class="fa-solid fa-${isGain ? 'arrow-trend-up' : 'arrow-trend-down'}"></i>
            ${isGain ? 'Gain' : 'Dépense'}
        </span>`;
    }

    // -- Montant --
    const montantClass  = estRemboursee ? 'amount-zero' : (isGain ? 'amount-positive' : 'amount-negative');
    const montantPrefix = estRemboursee ? '±' : (isGain ? '+' : '-');
    const montantHtml   = `
        <span class="${montantClass}">
            ${montantPrefix}${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
            ${estRemboursee ? '<span class="remboursee-tag">remboursé</span>' : ''}
        </span>`;

    // -- Action --
    // Pas de workflow remboursement pour les auto-demandes (même personne des deux côtés)
    let actionHtml = '';
    if (!estRemboursee && !estAutoDemande) {
        const role = isGain ? 'transporteur' : 'expéditeur';
        if (statutRemb.type === 'normal') {
            actionHtml = `
                <button class="btn-rembourser"
                    onclick="ouvrirModaleDemandeRemboursement('${donnees.id_demande}', '${partenaireAffiche}', ${prix.toFixed(2)}, '${role}')">
                    <i class="fa-solid fa-rotate-left"></i> Rembourser
                </button>`;
        } else if (statutRemb.type === 'en_attente_moi') {
            actionHtml = `
                <span class="badge-attente-label">
                    <i class="fa-solid fa-hourglass-half"></i> En attente de réponse
                </span>`;
        } else if (statutRemb.type === 'en_attente_autre') {
            actionHtml = `
                <div class="action-remb-group">
                    <button class="btn-accepter-remb"
                        onclick="ouvrirModaleReponse('${donnees.id_demande}', '${partenaireAffiche}', ${prix.toFixed(2)}, 'accepter')">
                        <i class="fa-solid fa-check"></i> Accepter
                    </button>
                    <button class="btn-refuser-remb"
                        onclick="ouvrirModaleReponse('${donnees.id_demande}', '${partenaireAffiche}', ${prix.toFixed(2)}, 'refuser')">
                        <i class="fa-solid fa-xmark"></i> Refuser
                    </button>
                </div>`;
        }
    }

    const rowClass = estRemboursee ? 'row-remboursee'
                   : statutRemb.type === 'en_attente_autre' ? 'row-attente-autre'
                   : '';

    return `
    <tr class="${rowClass}">
        <td>${badgeHtml}</td>
        <td><span class="ref-code">#${refCourt}</span></td>
        <td>
            <div class="route-cell">
                <strong>${donnees.ville_depart || '—'}</strong>
                <i class="fa-solid fa-arrow-right route-arrow"></i>
                <strong>${donnees.ville_destination || '—'}</strong>
            </div>
        </td>
        <td style="color:#718096;">${partenaireAffiche}</td>
        <td style="color:#718096;">${date}</td>
        <td style="color:#718096;">${donnees.distance_km ? Math.round(donnees.distance_km) + ' km' : '—'}</td>
        <td>${montantHtml}</td>
        <td>${actionHtml}</td>
    </tr>`;
}

function filtrer(filtre, el) {
    filtreActif = filtre;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    afficherTableau(toutesLesMissions, currentUsername);
}


/* ===================================================
   MODALE 1 : DEMANDER UN REMBOURSEMENT
   =================================================== */

function ouvrirModaleDemandeRemboursement(idDemande, partenaire, montant, role) {
    document.getElementById('modale-demande-id').textContent         = '#' + (idDemande?.split('-')[1] || idDemande);
    document.getElementById('modale-demande-partenaire').textContent = partenaire || '—';
    document.getElementById('modale-demande-montant').textContent    = montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

    const btn = document.getElementById('btn-confirmer-demande');
    btn.dataset.idDemande = idDemande;
    btn.dataset.role      = role;

    document.getElementById('modale-demande-erreur').textContent = '';
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer la demande';

    document.getElementById('modale-demande-remboursement').classList.add('active');
}

function fermerModaleDemande() {
    document.getElementById('modale-demande-remboursement').classList.remove('active');
}

async function confirmerDemandeRemboursement() {
    const btn       = document.getElementById('btn-confirmer-demande');
    const idDemande = btn.dataset.idDemande;
    const role      = btn.dataset.role;
    const erreurEl  = document.getElementById('modale-demande-erreur');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Envoi…';
    erreurEl.textContent = '';

    try {
        const res = await fetch(`/api/demandes/demander-remboursement/${idDemande}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername, role })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erreur serveur');
        }

        const nouveauStatut = role === 'transporteur'
            ? 'Remboursement demandé par transporteur'
            : 'Remboursement demandé par expéditeur';

        toutesLesMissions = toutesLesMissions.map(m =>
            m.donnees.id_demande === idDemande
                ? { ...m, donnees: { ...m.donnees, statut: nouveauStatut } }
                : m
        );

        fermerModaleDemande();
        mettreAJourKPI(toutesLesMissions, currentUsername);
        afficherTableau(toutesLesMissions, currentUsername);
        afficherNotification('Demande de remboursement envoyée. En attente de réponse.', 'success');

    } catch (err) {
        erreurEl.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoyer la demande';
    }
}


/* ===================================================
   MODALE 2 : RÉPONDRE À UNE DEMANDE (Accepter / Refuser)
   =================================================== */

function ouvrirModaleReponse(idDemande, partenaire, montant, action) {
    document.getElementById('modale-reponse-id').textContent         = '#' + (idDemande?.split('-')[1] || idDemande);
    document.getElementById('modale-reponse-partenaire').textContent = partenaire || '—';
    document.getElementById('modale-reponse-montant').textContent    = montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

    const btn     = document.getElementById('btn-confirmer-reponse');
    const iconEl  = document.getElementById('modale-reponse-icon-wrapper');
    const titreEl = document.getElementById('modale-reponse-titre');
    const descEl  = document.getElementById('modale-reponse-description');

    btn.dataset.idDemande = idDemande;
    btn.dataset.action    = action;

    if (action === 'accepter') {
        iconEl.className    = 'modale-icon-wrapper green';
        iconEl.innerHTML    = '<i class="fa-solid fa-check"></i>';
        titreEl.textContent = 'Accepter le remboursement ?';
        descEl.innerHTML    = 'Vous acceptez la demande de remboursement. Le montant sera restitué et les capacités de l\'offre remises à jour. Cette action est <strong>irréversible</strong>.';
        btn.className       = 'btn-confirmer-accepter';
        btn.innerHTML       = '<i class="fa-solid fa-check"></i> Confirmer l\'acceptation';
    } else {
        iconEl.className    = 'modale-icon-wrapper orange';
        iconEl.innerHTML    = '<i class="fa-solid fa-xmark"></i>';
        titreEl.textContent = 'Refuser le remboursement ?';
        descEl.innerHTML    = 'Vous refusez la demande de remboursement. La mission restera au statut <strong>Acceptée</strong>.';
        btn.className       = 'btn-confirmer-refuser';
        btn.innerHTML       = '<i class="fa-solid fa-xmark"></i> Confirmer le refus';
    }

    document.getElementById('modale-reponse-erreur').textContent = '';
    btn.disabled = false;

    document.getElementById('modale-reponse-remboursement').classList.add('active');
}

function fermerModaleReponse() {
    document.getElementById('modale-reponse-remboursement').classList.remove('active');
}

async function confirmerReponseRemboursement() {
    const btn       = document.getElementById('btn-confirmer-reponse');
    const idDemande = btn.dataset.idDemande;
    const action    = btn.dataset.action;
    const erreurEl  = document.getElementById('modale-reponse-erreur');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement…';
    erreurEl.textContent = '';

    const endpoint = action === 'accepter'
        ? `/api/demandes/accepter-remboursement/${idDemande}`
        : `/api/demandes/refuser-remboursement/${idDemande}`;

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erreur serveur');
        }

        const nouveauStatut = action === 'accepter' ? 'Remboursée' : 'Acceptée';
        toutesLesMissions = toutesLesMissions.map(m =>
            m.donnees.id_demande === idDemande
                ? { ...m, donnees: { ...m.donnees, statut: nouveauStatut } }
                : m
        );

        fermerModaleReponse();
        mettreAJourKPI(toutesLesMissions, currentUsername);
        afficherTableau(toutesLesMissions, currentUsername);
        afficherNotification(
            action === 'accepter'
                ? 'Remboursement accepté. Les capacités ont été restituées.'
                : 'Demande de remboursement refusée.',
            action === 'accepter' ? 'success' : 'info'
        );

    } catch (err) {
        erreurEl.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = action === 'accepter'
            ? '<i class="fa-solid fa-check"></i> Confirmer l\'acceptation'
            : '<i class="fa-solid fa-xmark"></i> Confirmer le refus';
    }
}


/* ===== FERMER LES MODALES EN CLIQUANT SUR L'OVERLAY ===== */
document.addEventListener('click', function(e) {
    if (e.target.id === 'modale-demande-remboursement') fermerModaleDemande();
    if (e.target.id === 'modale-reponse-remboursement') fermerModaleReponse();
});


/* ===== TOAST ===== */
function afficherNotification(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }
    const icons = { success: 'circle-check', error: 'triangle-exclamation', info: 'circle-info' };
    toast.className = `toast toast-${type} toast-visible`;
    toast.innerHTML = `<i class="fa-solid fa-${icons[type] || 'circle-check'}"></i> ${message}`;
    setTimeout(() => toast.classList.remove('toast-visible'), 4500);
}


/* ===== SKELETONS ===== */
function afficherSkeletons() {
    const tbody = document.getElementById("tableau-body");
    if (tbody) {
        tbody.innerHTML = Array(4).fill(`
            <tr>${Array(8).fill('<td><div class="skeleton"></div></td>').join('')}</tr>
        `).join('');
    }
    ['kpi-gain', 'kpi-depense', 'kpi-solde', 'kpi-distance'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="skeleton" style="width:80px;height:22px;display:inline-block;"></div>';
    });
}
