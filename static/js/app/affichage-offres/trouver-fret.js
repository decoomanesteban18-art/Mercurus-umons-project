/**
 * MERCURUS - Logique Marketplace & Réservation
 * Aligné sur le nouveau modèle : capacites_par_etape, date unique, tarif_euro_m3_km
 */

let marketCache = [];
let currentOffreAction = null;

document.addEventListener('DOMContentLoaded', () => {
    chargerMarket();

    const formReservation = document.getElementById('form-reservation');
    if (formReservation) {
        formReservation.onsubmit = async (e) => {
            e.preventDefault();
            const off = currentOffreAction;
            if (!off) return;

            const currentUser = localStorage.getItem("currentUser") || "Anonyme";

            // Validation ordre des arrêts
            const idxDep = parseInt(document.getElementById('req-arret-depart').value);
            const idxArr = parseInt(document.getElementById('req-arret-arrivee').value);
            const errEl  = document.getElementById('req-arret-error');

            if (idxDep >= idxArr) {
                if (errEl) errEl.style.display = 'block';
                document.getElementById('req-arret-depart').style.borderColor = '#ef4444';
                document.getElementById('req-arret-arrivee').style.borderColor = '#ef4444';
                return;
            }
            if (errEl) errEl.style.display = 'none';

            const etapes   = off.capacites_par_etape || [];
            const arretDep = etapes[idxDep] || {};
            const arretArr = etapes[idxArr] || {};

            const poids = parseFloat(document.getElementById('req-poids').value);
            const long  = parseFloat(document.getElementById('req-longueur').value);
            const larg  = parseFloat(document.getElementById('req-largeur').value);
            const haut  = parseFloat(document.getElementById('req-hauteur').value);

            const volume     = long * larg * haut;
            // prix indicatif au submit — le serveur recalcule avec la distance exacte
            const prixCalcule = ((off.tarif_euro_m3_km || 0) * volume).toFixed(2);

            const payload = {
                expediteur:   currentUser,
                transporteur: off.proprietaire,
                id_offre:     off.id,
                donnees: {
                    id_demande:        `REQ-${Date.now()}`,
                    statut:            "En attente",
                    ville_depart:      arretDep.ville || '',
                    heure_depart:      arretDep.heure || '',
                    ville_destination: arretArr.ville || '',
                    heure_arrivee:     arretArr.heure || '',
                    date:              off.date,
                    type_marchandise:  off.type_marchandise || 'Palette',
                    poids_kg:          poids,
                    longueur:          long,
                    largeur:           larg,
                    hauteur:           haut,
                    prix_fixe:         parseFloat(document.getElementById('req-prix').value) || parseFloat(prixCalcule),
                    commentaire:       document.getElementById('req-commentaire').value.trim() || '',
                    date_demande_envoi: new Date().toISOString()
                }
            };

            try {
                const res = await fetch('/api/demandes/creer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    window.fermerModalForm();
                    const modalSuccess = document.getElementById('modal-success');
                    if (modalSuccess) modalSuccess.style.display = 'flex';
                    chargerMarket();
                } else {
                    console.error("Erreur lors de la création.");
                }
            } catch (err) {
                alert("❌ Problème de connexion.");
            }
        };
    }

    // Recalcul du prix suggéré en temps réel
    ['req-poids', 'req-longueur', 'req-largeur', 'req-hauteur'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', recalculerPrix);
    });
});

/* --------------------------------------------------------------------------
   MODAL SUCCÈS
   -------------------------------------------------------------------------- */
window.fermerModalSucces = function() {
    const m = document.getElementById('modal-success');
    if (m) m.style.display = 'none';
};

/* --------------------------------------------------------------------------
   CHARGEMENT DU MARKET
   -------------------------------------------------------------------------- */
async function chargerMarket() {
    const listContainer = document.getElementById('bulk-list');
    if (!listContainer) return;

    listContainer.innerHTML = `<div class="loader">Chargement...</div>`;

    try {
        const response = await fetch('/api/market/all');
        const toutesLesOffres = await response.json();

        marketCache = toutesLesOffres.filter(off =>
            off.statut === 'Publiée' || off.statut === 'Planifiée' || off.statut === 'Acceptée'
        );

        if (marketCache.length === 0) {
            listContainer.innerHTML = `<p class="empty-msg">Aucune offre disponible.</p>`;
            return;
        }

        listContainer.innerHTML = '';
        marketCache.forEach(off => listContainer.appendChild(creerLigneBandeAnnonce(off)));

    } catch (error) {
        listContainer.innerHTML = `<p class="error-msg">Erreur serveur.</p>`;
    }
}

/* --------------------------------------------------------------------------
   CARTE MINI (LISTE)
   -------------------------------------------------------------------------- */
function creerLigneBandeAnnonce(off) {
    const div = document.createElement('div');
    div.className = 'fret-mini-card';

    const etapes = off.capacites_par_etape || [];

    // ─── Itinéraire : départ + étapes intermédiaires + destination ───
    const villeDepart      = off.depart      || etapes[0]?.ville || '?';
    const villeDestination = off.destination || etapes[etapes.length - 1]?.ville || '?';
    const heureDepart      = etapes[0]?.heure || '';
    const heureArrivee     = etapes[etapes.length - 1]?.heure || '';
    const etapesInter      = (off.etapes || []);   // noms des villes intermédiaires

    // Construire les points intermédiaires pour la mini-carte
    const etapesHtml = etapesInter.map(v => `
        <div class="route-connector"></div>
        <div class="route-step route-step-via">
            <i class="fa-solid fa-circle" style="color:#cbd5e1; font-size:0.5rem;"></i>
            <span class="city-name city-via">${v}</span>
        </div>
    `).join('');

    // ─── Capacité maximale disponible sur le trajet complet ───
    const chargeMax = etapes.length
        ? Math.max(...etapes.map(e => e.charge_disponible ?? Infinity))
        : null;
    const chargeAff = (chargeMax !== null && chargeMax !== Infinity)
        ? `${chargeMax.toLocaleString('fr-FR')} kg`
        : '—';

    // ─── Tarif : reformulé pour un client non-technique ───
    const tarifAff = off.tarif_euro_m3_km
        ? `${off.tarif_euro_m3_km} € / km`
        : 'Tarif sur demande';

    // ─── Date de validité de l'offre ───
    const expireAff = off.expire_date
        ? `Réservez avant le ${formaterDateComplete(off.expire_date)}${off.expire_heure ? ' à ' + off.expire_heure : ''}`
        : '';

    div.innerHTML = `
        <div class="fret-col-type">
            <span class="badge-type">${(off.type_marchandise || 'Palette').toUpperCase()}</span>
            <span class="marchandise-label">
                <i class="fa-solid fa-truck-fast"></i>
                <strong>@${off.proprietaire}</strong>
            </span>
            <div class="fret-capacite-badge" title="Poids maximal accepté sur ce trajet">
                <i class="fa-solid fa-weight-hanging"></i> jusqu'à ${chargeAff}
            </div>
        </div>
        <div class="fret-col-route">
            <div class="route-step">
                <i class="fa-solid fa-circle-dot" style="color: #2563eb;"></i>
                <div>
                    <span class="city-name">${villeDepart}</span>
                    ${heureDepart ? `<span class="city-heure">départ ${heureDepart}</span>` : ''}
                </div>
            </div>
            ${etapesHtml}
            <div class="route-connector"></div>
            <div class="route-step">
                <i class="fa-solid fa-location-dot" style="color: #ef4444;"></i>
                <div>
                    <span class="city-name">${villeDestination}</span>
                    ${heureArrivee ? `<span class="city-heure">arrivée ${heureArrivee}</span>` : ''}
                </div>
            </div>
        </div>
        <div class="fret-col-date">
            <div class="time-block">
                <small><i class="fa-regular fa-calendar"></i> Date du trajet</small>
                <span>${formaterDateComplete(off.date)}</span>
            </div>
            <div class="time-block">
                <small><i class="fa-solid fa-tag" style="color:#2563eb;"></i> Tarification</small>
                <span class="tarif-label">${tarifAff}</span>
            </div>
            ${expireAff ? `
            <div class="time-block expire-block">
                <small><i class="fa-solid fa-clock" style="color:#f59e0b;"></i> Limite de réservation</small>
                <span>${expireAff}</span>
            </div>` : ''}
        </div>
        <div class="fret-col-action">
            <button class="btn-secondary" onclick="voirDetails('${off.proprietaire}', '${off.id}')">
                <i class="fa-solid fa-circle-info"></i> Voir le détail
            </button>
            <button class="btn-primary" onclick="emettreDemande('${off.proprietaire}', '${off.id}')">
                <i class="fa-solid fa-handshake"></i> Réserver
            </button>
        </div>
    `;
    return div;
}

/* --------------------------------------------------------------------------
   MODAL DÉTAILS
   -------------------------------------------------------------------------- */
window.voirDetails = function(proprietaire, id) {
    const modal   = document.getElementById('modal-details');
    const content = document.getElementById('modal-body-content');
    if (!modal || !content) return;

    const off = marketCache.find(o => String(o.id) === String(id) && o.proprietaire === proprietaire);
    if (!off) return;

    modal.classList.add('active');

    const etapes = off.capacites_par_etape || [];

    // ─── Tarif : explication claire pour le client ───
    const tarifAff = off.tarif_euro_m3_km
        ? `${off.tarif_euro_m3_km} € par km parcouru`
        : 'Tarif sur demande';

    // ─── Timeline avec libellés humains ───
    const timelineHtml = etapes.map((e, idx) => {
        const isFirst = idx === 0;
        const isLast  = idx === etapes.length - 1;
        const cls     = isFirst ? 'origin' : isLast ? 'destination' : '';

        let labelHtml;
        if (isFirst)      labelHtml = '<span class="label-small">📍 Point de départ</span>';
        else if (isLast)  labelHtml = '<span class="label-small">🏁 Destination finale</span>';
        else              labelHtml = `<span class="label-small">🔄 Arrêt intermédiaire ${idx}</span>`;

        // Libellés capacités lisibles
        const chargeKg   = e.charge_disponible ?? null;
        const chargeAff  = chargeKg !== null ? `${chargeKg.toLocaleString('fr-FR')} kg disponibles` : '—';
        const longVal    = e.longueur != null ? parseFloat(e.longueur) : null;
        const dimAff     = longVal === 0
            ? '<span style="color:#ef4444;font-weight:600;">Rempli</span>'
            : (longVal !== null && e.largeur != null && e.hauteur != null)
                ? `${parseFloat(longVal.toFixed(2))} m × ${parseFloat(e.largeur.toFixed(2))} m × ${parseFloat(e.hauteur.toFixed(2))} m (L×l×H)`
                : '—';

        return `
        <div class="step ${cls}">
            <div class="step-dot"></div>
            <div class="step-content">
                ${labelHtml}
                <span class="step-city">${e.ville}</span>
                <span class="step-time">${formaterDateComplete(off.date)} à ${e.heure || '--:--'}</span>
                <div class="step-caps">
                    <span class="cap-pill" title="Charge restante que le transporteur peut encore accepter à cet arrêt">
                        <i class="fa-solid fa-weight-hanging"></i> ${chargeAff}
                    </span>
                    <span class="cap-pill" title="Volume maximal d'un colis accepté à cet arrêt">
                        <i class="fa-solid fa-box"></i> ${dimAff}
                    </span>
                </div>
            </div>
        </div>`;
    }).join('');

    // ─── Bloc d'explication du tarif ───
    const tarifBloc = off.tarif_euro_m3_km ? `
        <div class="modal-tarif-explainer">
            <div class="tarif-icon"><i class="fa-solid fa-tag"></i></div>
            <div>
                <strong>Comment est calculé le prix ?</strong>
                <p>Le tarif est de <strong>${off.tarif_euro_m3_km} €</strong> par km parcouru entre vos arrêts.
                   Le prix final dépend uniquement de la distance entre votre point de départ et votre destination.</p>
            </div>
        </div>` : '';

    content.innerHTML = `
        <div class="modal-detail-wrapper">
            <div class="modal-meta-row">
                <span>Transporteur : <strong>@${off.proprietaire}</strong></span>
                <span class="badge-type">${(off.type_marchandise || 'Palette').toUpperCase()}</span>
                ${off.expire_date ? `<span class="expire-info"><i class="fa-solid fa-clock"></i> Offre valable jusqu'au ${formaterDateComplete(off.expire_date)}${off.expire_heure ? ' à ' + off.expire_heure : ''}</span>` : ''}
            </div>
            ${tarifBloc}
            <div class="itinerary-card">
                <p class="caps-legend"><i class="fa-solid fa-circle-info"></i> Les capacités indiquées correspondent à l'espace et au poids encore disponibles à chaque arrêt. Votre colis doit respecter ces limites sur tout votre trajet.</p>
                <div class="timeline">${timelineHtml}</div>
            </div>
        </div>
    `;

    const btnReserver = document.getElementById('btn-demande-modal');
    if (btnReserver) {
        btnReserver.onclick = () => window.emettreDemande(off.proprietaire, String(off.id));
    }
};

/* --------------------------------------------------------------------------
   MODAL RÉSERVATION
   -------------------------------------------------------------------------- */
window.emettreDemande = function(proprietaire, id) {
    const off = marketCache.find(o => String(o.id) === String(id) && o.proprietaire === proprietaire);
    if (!off) return;

    currentOffreAction = off;
    const etapes = off.capacites_par_etape || [];

    // Construire les selects d'arrêts
    const optionsDep = etapes.map((e, i) =>
        `<option value="${i}">${e.ville} (${e.heure || '--:--'})</option>`
    ).join('');

    const optionsArr = etapes.map((e, i) =>
        `<option value="${i}" ${i === etapes.length - 1 ? 'selected' : ''}>${e.ville} (${e.heure || '--:--'})</option>`
    ).join('');

    const selDep = document.getElementById('req-arret-depart');
    const selArr = document.getElementById('req-arret-arrivee');
    if (selDep) selDep.innerHTML = optionsDep;
    if (selArr) selArr.innerHTML = optionsArr;

    // Date du trajet (lecture seule)
    const dateEl = document.getElementById('req-date-trajet');
    if (dateEl) dateEl.value = off.date || '';

    // Limites initiales (premier arrêt)
    majLimitesArret(0, etapes);

    // Réinitialisation de l'erreur et mise à jour des limites au changement d'arrêt
    const resetArretError = () => {
        const errEl = document.getElementById('req-arret-error');
        if (errEl) errEl.style.display = 'none';
        if (selDep) selDep.style.borderColor = '#cbd5e1';
        if (selArr) selArr.style.borderColor = '#cbd5e1';
    };
    selDep?.addEventListener('change', () => {
        resetArretError();
        majLimitesArret(parseInt(selDep.value), etapes);
    });
    selArr?.addEventListener('change', () => {
        resetArretError();
        majLimitesArret(parseInt(selDep.value), etapes);
    });

    // Tarif : reformulé
    const tarifEl = document.getElementById('req-tarif-info');
    if (tarifEl) tarifEl.textContent = off.tarif_euro_m3_km
        ? `${off.tarif_euro_m3_km} € / km`
        : 'N/C';

    // Prix auto vide, sera recalculé
    const prixEl = document.getElementById('req-prix');
    if (prixEl) prixEl.placeholder = 'Calculé automatiquement';

    window.fermerModal();
    setTimeout(() => {
        const modalForm = document.getElementById('modal-form-demande');
        if (modalForm) modalForm.classList.add('active');
    }, 150);
};

function majLimitesArret(idxDep, etapes) {
    const selArr = document.getElementById('req-arret-arrivee');
    const idxArr = selArr ? parseInt(selArr.value) : etapes.length - 1;

    // Contraintes des villes traversées seulement (destination exclue : la marchandise y descend)
    const fin = (idxArr > idxDep) ? idxArr : idxDep + 1;
    const troncon = etapes.slice(idxDep, fin);

    const minVal = (key) => troncon.length
        ? Math.min(...troncon.map(e => e[key] ?? Infinity))
        : '';

    const charge = minVal('charge_disponible');
    const long   = minVal('longueur');
    const larg   = minVal('largeur');
    const haut   = minVal('hauteur');

    const setLimit = (elId, spanId, val) => {
        const el = document.getElementById(elId);
        if (el) { el.max = val; el.placeholder = `max ${val}`; }
        const sp = document.getElementById(spanId);
        if (sp) sp.textContent = `(max ${val})`;
    };

    const setLimitLongueur = (elId, spanId, val) => {
        const el = document.getElementById(elId);
        const sp = document.getElementById(spanId);
        if (val === 0) {
            if (el) { el.max = 0; el.placeholder = 'Rempli'; el.disabled = true; }
            if (sp) sp.textContent = '(Rempli)';
        } else {
            if (el) { el.max = val; el.placeholder = `max ${val}`; el.disabled = false; }
            if (sp) sp.textContent = `(max ${val})`;
        }
    };

    setLimit('req-poids',    'max-poids', charge !== Infinity ? charge : '');
    setLimitLongueur('req-longueur', 'max-long', long !== Infinity ? long : '');
    setLimit('req-largeur',  'max-larg',  larg   !== Infinity ? larg   : '');
    setLimit('req-hauteur',  'max-haut',  haut   !== Infinity ? haut   : '');
    recalculerPrix();
}

function recalculerPrix() {
    if (!currentOffreAction) return;

    const tarif = currentOffreAction.tarif_euro_m3_km || 0;
    const idxDep = parseInt(document.getElementById('req-arret-depart')?.value)  || 0;
    const idxArr = parseInt(document.getElementById('req-arret-arrivee')?.value) || 0;
    const key    = `${idxDep}-${idxArr}`;
    const dist   = (currentOffreAction.distances_troncons || {})[key] || 0;

    const prix = (tarif * dist).toFixed(2);

    const el     = document.getElementById('req-prix');
    const distEl = document.getElementById('req-distance-info');

    if (distEl) {
        distEl.textContent = dist > 0
            ? `${dist} km (tronçon sélectionné)`
            : 'Distance non disponible — le prix sera calculé à la validation';
    }

    if (el) {
        if (dist > 0) {
            el.placeholder = `Suggéré : ${prix} €`;
        } else {
            el.placeholder = 'Sélectionnez vos arrêts pour voir une estimation';
        }
    }
}

/* --------------------------------------------------------------------------
   FERMETURES
   -------------------------------------------------------------------------- */
window.fermerModal = function() {
    const m = document.getElementById('modal-details');
    if (m) m.classList.remove('active');
};

window.fermerModalForm = function() {
    const m = document.getElementById('modal-form-demande');
    if (m) {
        m.classList.remove('active');
        document.getElementById('form-reservation')?.reset();
    }
    currentOffreAction = null;
};

/* --------------------------------------------------------------------------
   UTILITAIRES
   -------------------------------------------------------------------------- */
function formaterDate(dateStr) {
    if (!dateStr) return "N/C";
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formaterDateComplete(dateStr) {
    if (!dateStr) return "N/C";
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}