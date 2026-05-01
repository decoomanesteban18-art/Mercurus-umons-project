/**
 * FINANCES MERCURUS
 * Source : /api/demandes/archivees/{username}
 * Affiche uniquement les demandes Acceptées / Remboursées, séparées en :
 *   - Gains    : l'utilisateur est transporteur (quelqu'un a utilisé son camion)
 *   - Dépenses : l'utilisateur est expéditeur   (il a payé un transporteur)
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

        // On garde uniquement les demandes Acceptées ou Remboursées où l'utilisateur est impliqué
        const archivees = data.archivees || [];
        toutesLesMissions = archivees.filter(d =>
            (d.donnees.statut === "Acceptée" || d.donnees.statut === "Remboursée") &&
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

function categoriser(mission, username) {
    if (mission.transporteur === username && mission.expediteur !== username) return 'gain';
    if (mission.expediteur === username && mission.transporteur !== username) return 'depense';
    if (mission.transporteur === username && mission.expediteur === username) return 'gain';
    return null;
}

function mettreAJourKPI(missions, username) {
    // KPI : uniquement les missions Acceptées (pas les Remboursées, car l'argent est rendu)
    const actives  = missions.filter(m => m.donnees.statut === "Acceptée");
    const gains    = actives.filter(m => categoriser(m, username) === 'gain');
    const depenses = actives.filter(m => categoriser(m, username) === 'depense');

    const totalGains    = gains.reduce((s, m) => s + parseFloat(m.donnees.prix_fixe || 0), 0);
    const totalDepenses = depenses.reduce((s, m) => s + parseFloat(m.donnees.prix_fixe || 0), 0);
    const soldeNet      = totalGains - totalDepenses;
    const distTotale    = gains.reduce((s, m) => s + parseFloat(m.donnees.distance_km || 0), 0);

    setKPI("kpi-gain",      totalGains.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-depense",   totalDepenses.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-solde",     (soldeNet >= 0 ? "+" : "") + soldeNet.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + " €");
    setKPI("kpi-distance",  Math.round(distTotale) + " km");

    const soldeEl = document.getElementById("kpi-solde");
    if (soldeEl) {
        soldeEl.style.color = soldeNet >= 0 ? "#27ae60" : "#e74c3c";
    }
}

function setKPI(id, valeur) {
    const el = document.getElementById(id);
    if (el) el.textContent = valeur;
}

function afficherTableau(missions, username) {
    const tbody = document.getElementById("tableau-body");
    if (!tbody) return;

    const user = username || localStorage.getItem("currentUser");

    let filtered;
    if (filtreActif === 'gains') {
        filtered = missions.filter(m => categoriser(m, user) === 'gain');
    } else if (filtreActif === 'depenses') {
        filtered = missions.filter(m => categoriser(m, user) === 'depense');
    } else {
        filtered = missions;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr><td colspan="8">
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucune mission à afficher.</p>
                </div>
            </td></tr>`;
        return;
    }

    const sorted = [...filtered].sort((a, b) =>
        new Date(b.donnees.date_demande_envoi || 0) - new Date(a.donnees.date_demande_envoi || 0)
    );

    tbody.innerHTML = sorted.map(d => {
        const donnees    = d.donnees;
        const type       = categoriser(d, user);
        const isGain     = type === 'gain';
        const estRemboursee = donnees.statut === "Remboursée";
        const refCourt   = donnees.id_demande?.split('-')[1] || donnees.id_demande || '—';
        const prix       = parseFloat(donnees.prix_fixe || 0);
        const date       = donnees.date
            ? new Date(donnees.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
        const partenaire = isGain ? d.expediteur : d.transporteur;

        // Bouton remboursement : uniquement si c'est un gain non encore remboursé
        const boutonRembourser = (isGain && !estRemboursee)
            ? `<button class="btn-rembourser" onclick="ouvrirModaleRemboursement('${donnees.id_demande}', '${partenaire || ''}', ${prix.toFixed(2)})">
                    <i class="fa-solid fa-rotate-left"></i> Rembourser
               </button>`
            : '';

        return `
        <tr class="${estRemboursee ? 'row-remboursee' : ''}">
            <td>
                <span class="badge ${estRemboursee ? 'remboursee' : (isGain ? 'gain' : 'depense')}">
                    <i class="fa-solid fa-${estRemboursee ? 'rotate-left' : (isGain ? 'arrow-trend-up' : 'arrow-trend-down')}"></i>
                    ${estRemboursee ? 'Remboursé' : (isGain ? 'Gain' : 'Dépense')}
                </span>
            </td>
            <td><span class="ref-code">#${refCourt}</span></td>
            <td>
                <div class="route-cell">
                    <strong>${donnees.ville_depart || '—'}</strong>
                    <i class="fa-solid fa-arrow-right route-arrow"></i>
                    <strong>${donnees.ville_destination || '—'}</strong>
                </div>
            </td>
            <td style="color:#718096;">${partenaire || '—'}</td>
            <td style="color:#718096;">${date}</td>
            <td style="color:#718096;">${donnees.distance_km ? Math.round(donnees.distance_km) + ' km' : '—'}</td>
            <td class="${estRemboursee ? 'amount-zero' : (isGain ? 'amount-positive' : 'amount-negative')}">
                ${estRemboursee ? '±' : (isGain ? '+' : '-')}${prix.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                ${estRemboursee ? '<span class="remboursee-tag">remboursé</span>' : ''}
            </td>
            <td>${boutonRembourser}</td>
        </tr>`;
    }).join('');
}

function filtrer(filtre, el) {
    filtreActif = filtre;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    afficherTableau(toutesLesMissions);
}

// ===== MODALE DE REMBOURSEMENT =====

function ouvrirModaleRemboursement(idDemande, expediteur, montant) {
    document.getElementById('modale-id-demande').textContent = '#' + (idDemande?.split('-')[1] || idDemande);
    document.getElementById('modale-expediteur').textContent = expediteur || '—';
    document.getElementById('modale-montant').textContent    = montant.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €';

    // Stocker l'id pour la confirmation
    document.getElementById('btn-confirmer-remboursement').dataset.idDemande = idDemande;

    document.getElementById('modale-remboursement').classList.add('active');
}

function fermerModale() {
    document.getElementById('modale-remboursement').classList.remove('active');
    reinitialiserModale();
}

function reinitialiserModale() {
    document.getElementById('modale-erreur').textContent = '';
    const btn = document.getElementById('btn-confirmer-remboursement');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Confirmer le remboursement';
}

async function confirmerRemboursement() {
    const btn        = document.getElementById('btn-confirmer-remboursement');
    const idDemande  = btn.dataset.idDemande;
    const erreurEl   = document.getElementById('modale-erreur');

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Traitement…';
    erreurEl.textContent = '';

    try {
        const res = await fetch(`/api/demandes/rembourser/${idDemande}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUsername })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'Erreur serveur');
        }

        // Mise à jour locale sans rechargement complet
        toutesLesMissions = toutesLesMissions.map(m => {
            if (m.donnees.id_demande === idDemande) {
                return { ...m, donnees: { ...m.donnees, statut: 'Remboursée' } };
            }
            return m;
        });

        fermerModale();
        mettreAJourKPI(toutesLesMissions, currentUsername);
        afficherTableau(toutesLesMissions, currentUsername);

        afficherNotification('Remboursement effectué. Les capacités de l\'offre ont été restituées.', 'success');

    } catch (err) {
        erreurEl.textContent = err.message;
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Confirmer le remboursement';
    }
}

// Fermer la modale en cliquant sur l'overlay
document.addEventListener('click', function(e) {
    if (e.target.id === 'modale-remboursement') fermerModale();
});

// ===== NOTIFICATION TOAST =====
function afficherNotification(message, type = 'success') {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        document.body.appendChild(toast);
    }
    toast.className = `toast toast-${type} toast-visible`;
    toast.innerHTML = `<i class="fa-solid fa-${type === 'success' ? 'circle-check' : 'triangle-exclamation'}"></i> ${message}`;
    setTimeout(() => toast.classList.remove('toast-visible'), 4000);
}

// ===== LOADING SKELETONS =====
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