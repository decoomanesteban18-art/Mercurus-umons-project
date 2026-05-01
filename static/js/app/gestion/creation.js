/**
 * MERCURUS - Gestion de la Création d'Offre
 * Capacités encodées par arrêt (départ + étapes + destination)
 *
 * PRINCIPE : Les données du camion ET du cycle sont capturées en snapshot
 * au moment de la sélection et stockées dans snapshotCamion / snapshotCycle.
 * Ces snapshots sont envoyés dans le payload et figés côté serveur — toute
 * modification ultérieure du camion ou du cycle n'affecte jamais une offre
 * déjà créée.
 */

// --- CONFIGURATION DES VILLES AUTORISÉES (partagée avec add-modal.js) ---
const VILLES_AUTORISEES_CREATION = [
    "Mons", "Charleroi", "Ath", "Tournai", "Soignies", "La Louvière",
    "Binche", "Saint-Ghislain", "Péruwelz", "Braine-le-Comte",
    "Mouscron", "Comines-Warneton", "Lessines", "Châtelet", "Fleurus"
];

// Snapshot figé des caractéristiques du camion sélectionné
let snapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 };

// Snapshot figé du cycle sélectionné
let snapshotCycle = { id: null, nom_cycle: '', depart: '', destination: '', etapes: [] };

let cyclesDataOffre = [];

/* ==========================================================================
   1. UTILITAIRES UI
   ========================================================================== */

function showError(message) {
    const errorBox = document.getElementById('error-message-creation');
    if (!errorBox) return;
    errorBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${message}</span>`;
    errorBox.style.display = 'flex';
}

function hideError() {
    const errorBox = document.getElementById('error-message-creation');
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.innerHTML = '';
    }
}



function goToStep(step) {
    hideError();

    if (step === 2) {
        const camion = document.getElementById('select-camion').value;
        if (!camion) { showError("Veuillez sélectionner un véhicule."); return; }

        const cycle = document.getElementById('select-cycle').value;
        if (!cycle) { showError("Veuillez sélectionner un circuit préconfiguré."); return; }

        if (snapshotCamion.immatriculation !== camion) {
            showError("Erreur interne : données du véhicule non chargées. Veuillez re-sélectionner le véhicule.");
            return;
        }

        if (snapshotCycle.id !== parseInt(cycle)) {
            showError("Erreur interne : données du circuit non chargées. Veuillez re-sélectionner le circuit.");
            return;
        }

        const typeMarchandise = document.getElementById('type-marchandise').value;
        if (!typeMarchandise) { showError("Veuillez sélectionner un type de marchandise."); return; }

        buildCapacitesForm();
    }

    if (step === 3) {
        if (!validateCapacites()) return;
    }

    [1, 2, 3].forEach(i => {
        const el = document.getElementById(`step-${i}`);
        if (el) el.classList.toggle('active', i === step);
    });

    [1, 2, 3].forEach(i => {
        const dot = document.getElementById(`dot-${i}`);
        if (dot) dot.classList.toggle('active', i === step);
    });
}

/* ==========================================================================
   3. SNAPSHOT DU CAMION (déclenché au changement de sélection)
   ========================================================================== */

/**
 * Appelé via onchange sur le <select> du camion.
 * Fige les dimensions et la charge dans snapshotCamion.
 */
async function captureSnapshotCamion() {
    const immat = document.getElementById('select-camion').value;

    if (!immat) {
        snapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 };
        return;
    }

    try {
        const username = localStorage.getItem("currentUser") || "admin";
        const res    = await fetch(`/api/trucks/${username}`);
        const trucks = await res.json();
        const truck  = trucks.find(t => t.immatriculation === immat);

        if (truck) {
            snapshotCamion = {
                immatriculation: truck.immatriculation,
                long:  truck.longueur           || 0,
                larg:  truck.largeur            || 0,
                haut:  truck.hauteur            || 0,
                poids: truck.charge_maximale_kg || 0,
            };
        } else {
            snapshotCamion = { immatriculation: immat, long: 0, larg: 0, haut: 0, poids: 0 };
        }
    } catch (e) {
        console.error("Erreur lors du snapshot camion :", e);
        snapshotCamion = { immatriculation: immat, long: 0, larg: 0, haut: 0, poids: 0 };
    }
}

/* ==========================================================================
   3b. SNAPSHOT DU CYCLE (déclenché au changement de sélection)
   ========================================================================== */

/**
 * Appelé via onchange sur le <select> du cycle.
 * Fige le départ, la destination et les étapes dans snapshotCycle.
 */
function captureSnapshotCycle() {
    const cycleId = parseInt(document.getElementById('select-cycle').value);

    if (!cycleId || isNaN(cycleId)) {
        snapshotCycle = { id: null, nom_cycle: '', depart: '', destination: '', etapes: [] };
        return;
    }

    const cycleInfo = cyclesDataOffre.find(c => c.id === cycleId);

    if (cycleInfo) {
        snapshotCycle = {
            id:          cycleInfo.id,
            nom_cycle:   cycleInfo.nom_cycle   || '',
            depart:      cycleInfo.depart      || '',
            destination: cycleInfo.destination || '',
            etapes:      [...(cycleInfo.etapes || [])],  // copie profonde
        };
    } else {
        snapshotCycle = { id: cycleId, nom_cycle: '', depart: '', destination: '', etapes: [] };
    }
}

/* ==========================================================================
   4. GÉNÉRATION DU FORMULAIRE DE CAPACITÉS (utilise uniquement les snapshots)
   ========================================================================== */

let arretCourant = 0;
let arretsTotal  = 0;

function buildCapacitesForm() {
    // On utilise le snapshot figé du cycle — jamais cyclesDataOffre directement
    const arrets = [
        { label: snapshotCycle.depart,      type: 'depart' },
        ...(snapshotCycle.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: snapshotCycle.destination, type: 'destination' }
    ];

    arretsTotal  = arrets.length;
    arretCourant = 0;

    const container = document.getElementById('capacites-par-etape');
    if (!container) return;

    // On lit le snapshot figé du camion — jamais l'API directement
    const { long, larg, haut, poids } = snapshotCamion;

    const iconMap = { depart: 'fa-circle-dot', etape: 'fa-map-pin', destination: 'fa-flag-checkered' };

    container.innerHTML = arrets.map((arret, idx) => {
        const isDestination = arret.type === 'destination';
        const labelType = arret.type === 'depart'      ? 'Départ'
                        : arret.type === 'destination' ? 'Destination'
                        : `Arrêt ${idx}`;
        return `
        <div class="etape-block${idx === 0 ? ' active' : ''}" data-idx="${idx}" style="display:${idx === 0 ? 'block' : 'none'};"
             data-long-max="${long}" data-larg-max="${larg}" data-haut-max="${haut}" data-poids-max="${poids}">
            <div class="etape-block-header">
                <span class="etape-badge etape-badge--${arret.type}">
                    <i class="fa-solid ${iconMap[arret.type]}"></i> ${labelType}
                </span>
                <span class="etape-ville">${arret.label}</span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fa-solid fa-clock"></i> Heure de passage</label>
                    <input type="time" name="etape_heure_${idx}">
                </div>
            </div>
            ${isDestination ? `
            <div style="margin-top:10px; padding:10px 14px; background:#f1f5f9; border-radius:8px; color:#64748b; font-size:0.85rem;">
                <i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i>
                La marchandise est déchargée à destination — aucune capacité à encoder.
            </div>
            <input type="hidden" name="etape_long_${idx}"  value="0">
            <input type="hidden" name="etape_larg_${idx}"  value="0">
            <input type="hidden" name="etape_haut_${idx}"  value="0">
            <input type="hidden" name="etape_poids_${idx}" value="0">
            ` : `
            <div class="form-row-tri">
                <div class="form-group">
                    <label>Longueur (m)</label>
                    <input type="number" name="etape_long_${idx}" step="0.1" min="0" max="${long}" placeholder="0.0">
                    <div class="info-max">Max : <span>${long || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Largeur (m)</label>
                    <input type="number" name="etape_larg_${idx}" step="0.1" min="0" max="${larg}" placeholder="0.0">
                    <div class="info-max">Max : <span>${larg || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Hauteur (m)</label>
                    <input type="number" name="etape_haut_${idx}" step="0.1" min="0" max="${haut}" placeholder="0.0">
                    <div class="info-max">Max : <span>${haut || '--'}</span></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Charge disponible (kg)</label>
                    <input type="number" name="etape_poids_${idx}" min="0" max="${poids}" placeholder="Ex : 1200">
                    <div class="info-max">Max : <span>${poids || '--'}</span></div>
                </div>
            </div>
            `}
        </div>`;
    }).join('');

    rafraichirNavArrets();
}

/* ==========================================================================
   5. NAVIGATION ARRÊT PAR ARRÊT
   ========================================================================== */

function rafraichirNavArrets() {
    const nav = document.getElementById('arrets-nav');
    if (!nav) return;

    const estDernier = arretCourant === arretsTotal - 1;

    let dots = '';
    for (let i = 0; i < arretsTotal; i++) {
        dots += `<div class="arret-dot${i === arretCourant ? ' active' : (i < arretCourant ? ' done' : '')}"></div>`;
        if (i < arretsTotal - 1) dots += '<div class="arret-line"></div>';
    }

    nav.innerHTML = `
        <div class="arrets-stepper">${dots}</div>
        <div class="arrets-nav-btns">
            <button type="button" class="btn-secondary" onclick="naviguerArret(-1)" ${arretCourant === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-left"></i> Précédent
            </button>
            ${estDernier
                ? `<button type="button" class="btn-primary" onclick="goToStep(3)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
                : `<button type="button" class="btn-primary" onclick="naviguerArret(1)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
            }
        </div>`;
}

function naviguerArret(direction) {
    hideError();

    if (direction === 1 && !validerArretIdx(arretCourant)) return;

    const blocks = document.querySelectorAll('#capacites-par-etape .etape-block');
    if (blocks[arretCourant]) blocks[arretCourant].style.display = 'none';

    arretCourant += direction;
    if (arretCourant < 0) arretCourant = 0;
    if (arretCourant >= arretsTotal) arretCourant = arretsTotal - 1;

    if (blocks[arretCourant]) blocks[arretCourant].style.display = 'block';

    rafraichirNavArrets();
}

/* ==========================================================================
   6. VALIDATION D'UN ARRÊT (lit les max depuis data-attributes du bloc)
   ========================================================================== */

function validerArretIdx(idx) {
    const block = document.querySelector(`#capacites-par-etape .etape-block[data-idx="${idx}"]`);
    if (!block) return true;

    const ville = block.querySelector('.etape-ville')?.textContent || `Arrêt ${idx}`;

    const long  = parseFloat(block.dataset.longMax)  || 0;
    const larg  = parseFloat(block.dataset.largMax)  || 0;
    const haut  = parseFloat(block.dataset.hautMax)  || 0;
    const poids = parseFloat(block.dataset.poidsMax) || 0;

    const heureInput = block.querySelector(`[name="etape_heure_${idx}"]`)?.value?.trim();
    const vLong  = parseFloat(block.querySelector(`[name="etape_long_${idx}"]`)?.value);
    const vLarg  = parseFloat(block.querySelector(`[name="etape_larg_${idx}"]`)?.value);
    const vHaut  = parseFloat(block.querySelector(`[name="etape_haut_${idx}"]`)?.value);
    const vPoids = parseInt(block.querySelector(`[name="etape_poids_${idx}"]`)?.value);

    if (!heureInput)           { showError(`Veuillez renseigner l'heure de passage pour "${ville}".`);        return false; }

    // La destination ne nécessite pas de capacités (la marchandise y est déchargée)
    const isDestination = block.querySelector('.etape-badge')?.classList.contains('etape-badge--destination');
    if (!isDestination) {
        if (!vLong || vLong <= 0)  { showError(`Veuillez renseigner la longueur disponible pour "${ville}".`);    return false; }
        if (!vLarg || vLarg <= 0)  { showError(`Veuillez renseigner la largeur disponible pour "${ville}".`);     return false; }
        if (!vHaut || vHaut <= 0)  { showError(`Veuillez renseigner la hauteur disponible pour "${ville}".`);     return false; }
        if (!vPoids || vPoids <= 0){ showError(`Veuillez renseigner la charge disponible pour "${ville}".`);      return false; }
        if (vLong  > long)         { showError(`"${ville}" — longueur dépassée (max ${long} m).`);                return false; }
        if (vLarg  > larg)         { showError(`"${ville}" — largeur dépassée (max ${larg} m).`);                 return false; }
        if (vHaut  > haut)         { showError(`"${ville}" — hauteur dépassée (max ${haut} m).`);                 return false; }
        if (vPoids > poids)        { showError(`"${ville}" — charge dépassée (max ${poids} kg).`);                return false; }
    }

    // Vérification chronologique
    if (idx > 0) {
        const heureActuelle = block.querySelector(`[name="etape_heure_${idx}"]`)?.value;
        const prevBlock     = document.querySelector(`#capacites-par-etape .etape-block[data-idx="${idx - 1}"]`);
        const heurePrev     = prevBlock?.querySelector(`[name="etape_heure_${idx - 1}"]`)?.value;
        if (heureActuelle && heurePrev && heureActuelle < heurePrev) {
            const villePrev = prevBlock?.querySelector('.etape-ville')?.textContent || `Arrêt ${idx - 1}`;
            showError(`"${ville}" — l'heure de passage (${heureActuelle}) ne peut pas être avant celle de "${villePrev}" (${heurePrev}).`);
            return false;
        }
    }

    return true;
}

function validateCapacites() {
    for (let i = 0; i < arretsTotal; i++) {
        if (!validerArretIdx(i)) return false;
    }
    return true;
}

/* ==========================================================================
   7. LECTURE DES CAPACITÉS POUR LE PAYLOAD
   ========================================================================== */

function collectCapacites() {
    const container = document.getElementById('capacites-par-etape');
    if (!container) return [];

    // On utilise le snapshot figé du cycle — jamais cyclesDataOffre directement
    const arrets = [
        { label: snapshotCycle.depart,      type: 'depart' },
        ...(snapshotCycle.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: snapshotCycle.destination, type: 'destination' }
    ];

    return [...container.querySelectorAll('.etape-block')].map((block, idx) => ({
        ville:             arrets[idx]?.label || '',
        type:              arrets[idx]?.type  || 'etape',
        heure:             block.querySelector(`[name="etape_heure_${idx}"]`)?.value || '',
        longueur:          parseFloat(block.querySelector(`[name="etape_long_${idx}"]`)?.value)  || 0,
        largeur:           parseFloat(block.querySelector(`[name="etape_larg_${idx}"]`)?.value)  || 0,
        hauteur:           parseFloat(block.querySelector(`[name="etape_haut_${idx}"]`)?.value)  || 0,
        charge_disponible: parseInt(block.querySelector(`[name="etape_poids_${idx}"]`)?.value)   || 0,
    }));
}

/* ==========================================================================
   8. INITIALISATION (ouverture modale)
   ========================================================================== */

async function openOffreModal() {
    const modal = document.getElementById('offreModal');
    if (!modal) return;

    const form = document.getElementById('form-creation-offre');
    if (form) form.reset();

    // Réinitialisation des deux snapshots
    snapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 };
    snapshotCycle  = { id: null, nom_cycle: '', depart: '', destination: '', etapes: [] };

    const cap = document.getElementById('capacites-par-etape');
    if (cap) cap.innerHTML = '';

    modal.style.display = 'flex';
    goToStep(1);

    const username = localStorage.getItem("currentUser") || "admin";

    try {
        const [resT, resC] = await Promise.all([
            fetch(`/api/trucks/${username}`),
            fetch(`/api/cycles/${username}`)
        ]);

        const trucks = await resT.json();
        cyclesDataOffre = await resC.json();

        const sTruck = document.getElementById('select-camion');
        if (sTruck) {
            sTruck.innerHTML = '<option value="">-- Sélectionner --</option>' +
                trucks.map(t => `<option value="${t.immatriculation}">${t.immatriculation}</option>`).join('');

            sTruck.removeEventListener('change', captureSnapshotCamion);
            sTruck.addEventListener('change', captureSnapshotCamion);
        }

        const sCycle = document.getElementById('select-cycle');
        if (sCycle) {
            sCycle.innerHTML = '<option value="">-- Choisir un itinéraire --</option>' +
                cyclesDataOffre.map(c =>
                    `<option value="${c.id}">${c.nom_cycle} (${c.depart} → ${c.destination})</option>`
                ).join('');

            // Branchement du snapshot cycle sur le select
            sCycle.removeEventListener('change', captureSnapshotCycle);
            sCycle.addEventListener('change', captureSnapshotCycle);
        }
    } catch (err) { console.error(err); }
}

/* ==========================================================================
   9. SOUMISSION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-creation-offre')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = localStorage.getItem("currentUser") || "admin";

        if (!snapshotCycle.id || isNaN(snapshotCycle.id)) {
            showError("Veuillez sélectionner un circuit préconfiguré.");
            return;
        }

        const capacites = collectCapacites();

        const dateTrajet = document.getElementById('date-trajet').value;
        if (!dateTrajet) {
            showError("Veuillez renseigner la date du trajet.");
            return;
        }

        const expireDate  = document.getElementById('expire-date').value;
        const expireHeure = document.getElementById('expire-heure').value;
        if (!expireDate || !expireHeure) {
            showError("Veuillez renseigner la date et l'heure d'expiration de l'offre.");
            return;
        }
        if (expireDate > dateTrajet) {
            showError("La date d'expiration ne peut pas être après la date du trajet.");
            return;
        }

        const tarifVal = parseFloat(document.getElementById('tarif-euro-m3-km').value);
        if (!tarifVal || tarifVal <= 0) {
            showError("€/km : veuillez renseigner un tarif valide.");
            return;
        }

        const payload = {
            camion_id:           snapshotCamion.immatriculation,
            snapshot_camion:     { ...snapshotCamion },
            cycle_id:            snapshotCycle.id,
            snapshot_cycle:      { ...snapshotCycle, etapes: [...snapshotCycle.etapes] },
            type_marchandise:    document.getElementById('type-marchandise').value,
            depart:              snapshotCycle.depart,
            destination:         snapshotCycle.destination,
            etapes:              [...snapshotCycle.etapes],
            date:                dateTrajet,
            expire_date:         expireDate,
            expire_heure:        expireHeure,
            tarif_euro_m3_km:    tarifVal,
            capacites_par_etape: capacites,
            statut:              "Planifiée"
        };

        try {
            const res = await fetch(`/api/offres/${username}`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            });
            if (res.ok) {
                closeOffreModal();
                location.reload();
            } else {
                showError("Une erreur est survenue lors de la publication. Veuillez réessayer.");
            }
        } catch (err) {
            console.error(err);
            showError("Erreur réseau. Vérifiez votre connexion et réessayez.");
        }
    });
});

/* ==========================================================================
   10. FERMETURE
   ========================================================================== */

function closeOffreModal() {
    const modal = document.getElementById('offreModal');
    if (modal) modal.style.display = 'none';
}

/* ==========================================================================
   11. MODAL EXPRESS — variables & helpers
   ========================================================================== */

let expSnapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 };
let expSnapshotCycle  = { id: null, nom_cycle: '', depart: '', destination: '', etapes: [] };
let expArretCourant   = 0;
let expArretsTotal    = 0;

function showExpressError(msg) {
    const box = document.getElementById('error-message-express');
    if (!box) return;
    box.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${msg}</span>`;
    box.style.display = 'flex';
}

function hideExpressError() {
    const box = document.getElementById('error-message-express');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

/* Ouvre le modal express et charge les camions */
async function openOffreExpressModal() {
    const modal = document.getElementById('offreExpressModal');
    if (!modal) return;

    document.getElementById('form-creation-express')?.reset();

    expSnapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 };
    expSnapshotCycle  = { id: null, nom_cycle: '', depart: '', destination: '', etapes: [] };

    // Vider les étapes libres
    const etapesCont = document.getElementById('exp-etapes-container');
    if (etapesCont) etapesCont.innerHTML = '';

    const cap = document.getElementById('exp-capacites-par-etape');
    if (cap) cap.innerHTML = '';

    modal.style.display = 'flex';
    goToExpressStep(1);

    // Autocomplétion sur les champs fixes de ville
    attachVilleAutocomplete(document.getElementById('exp-depart'));
    attachVilleAutocomplete(document.getElementById('exp-destination'));

    const username = localStorage.getItem("currentUser") || "admin";

    try {
        const res    = await fetch(`/api/trucks/${username}`);
        const trucks = await res.json();

        const sTruck = document.getElementById('exp-select-camion');
        if (sTruck) {
            sTruck.innerHTML = '<option value="">-- Sélectionner --</option>' +
                trucks.map(t => `<option value="${t.immatriculation}">${t.immatriculation}</option>`).join('');

            sTruck.addEventListener('change', captureExpressSnapshotCamion);
        }
    } catch (err) { console.error(err); }
}

function closeOffreExpressModal() {
    const modal = document.getElementById('offreExpressModal');
    if (modal) modal.style.display = 'none';
}

/* Snapshot camion express */
async function captureExpressSnapshotCamion() {
    const immat = document.getElementById('exp-select-camion').value;
    if (!immat) { expSnapshotCamion = { immatriculation: '', long: 0, larg: 0, haut: 0, poids: 0 }; return; }

    try {
        const username = localStorage.getItem("currentUser") || "admin";
        const res    = await fetch(`/api/trucks/${username}`);
        const trucks = await res.json();
        const truck  = trucks.find(t => t.immatriculation === immat);

        expSnapshotCamion = truck
            ? { immatriculation: truck.immatriculation, long: truck.longueur || 0, larg: truck.largeur || 0, haut: truck.hauteur || 0, poids: truck.charge_maximale_kg || 0 }
            : { immatriculation: immat, long: 0, larg: 0, haut: 0, poids: 0 };
    } catch (e) {
        expSnapshotCamion = { immatriculation: immat, long: 0, larg: 0, haut: 0, poids: 0 };
    }
}

/* Ajoute une ligne d'étape dans le builder express */
function ajouterEtapeExpress(valeur = '') {
    const container = document.getElementById('exp-etapes-container');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'etape-libre-row';
    row.innerHTML = `
        <input type="text" placeholder="Ex : Ath" value="${valeur}" autocomplete="off">
        <button type="button" class="btn-remove-etape" onclick="this.parentElement.remove()" title="Supprimer">
            <i class="fa-solid fa-xmark"></i>
        </button>`;
    container.appendChild(row);

    // Attacher l'autocomplete sur le nouvel input d'étape
    const newInput = row.querySelector('input[type="text"]');
    if (newInput) attachVilleAutocomplete(newInput);
}

/* Navigation steps express */
function goToExpressStep(step) {
    hideExpressError();

    if (step === 2) {
        const camion = document.getElementById('exp-select-camion').value;
        if (!camion) { showExpressError("Veuillez sélectionner un véhicule."); return; }

        if (expSnapshotCamion.immatriculation !== camion) {
            showExpressError("Erreur interne : données du véhicule non chargées. Veuillez re-sélectionner le véhicule.");
            return;
        }

        const depart      = document.getElementById('exp-depart')?.value.trim();
        const destination = document.getElementById('exp-destination')?.value.trim();
        if (!depart)      { showExpressError("Veuillez renseigner la ville de départ.");      return; }
        if (!destination) { showExpressError("Veuillez renseigner la ville de destination."); return; }

        // Validation géographique : départ et destination doivent être dans la liste
        if (!VILLES_AUTORISEES_CREATION.includes(depart)) {
            showExpressError("Ville de départ non desservie dans le réseau Mercurus.");
            return;
        }
        if (!VILLES_AUTORISEES_CREATION.includes(destination)) {
            showExpressError("Ville de destination non desservie dans le réseau Mercurus.");
            return;
        }

        const typeMarchandise = document.getElementById('exp-type-marchandise').value;
        if (!typeMarchandise) { showExpressError("Veuillez sélectionner un type de marchandise."); return; }

        // Construire le snapshot cycle depuis les champs libres
        const etapeInputs = document.querySelectorAll('#exp-etapes-container .etape-libre-row input');
        const etapes      = [...etapeInputs].map(i => i.value.trim()).filter(Boolean);

        // Validation géographique des étapes intermédiaires
        for (const etape of etapes) {
            if (!VILLES_AUTORISEES_CREATION.includes(etape)) {
                showExpressError("L'étape \"" + etape + "\" n'est pas desservie dans le réseau Mercurus.");
                return;
            }
        }

        expSnapshotCycle = {
            id:          null,
            nom_cycle:   `${depart} → ${destination}`,
            depart,
            destination,
            etapes,
        };

        buildExpressCapacitesForm();
    }

    if (step === 3) {
        if (!validateExpressCapacites()) return;
    }

    [1, 2, 3].forEach(i => {
        const el = document.getElementById(`exp-step-${i}`);
        if (el) el.classList.toggle('active', i === step);
        const dot = document.getElementById(`exp-dot-${i}`);
        if (dot) dot.classList.toggle('active', i === step);
    });
}

/* Construction du formulaire de capacités (réutilise la même logique) */
function buildExpressCapacitesForm() {
    const arrets = [
        { label: expSnapshotCycle.depart,      type: 'depart' },
        ...(expSnapshotCycle.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: expSnapshotCycle.destination, type: 'destination' }
    ];

    expArretsTotal  = arrets.length;
    expArretCourant = 0;

    const container = document.getElementById('exp-capacites-par-etape');
    if (!container) return;

    const { long, larg, haut, poids } = expSnapshotCamion;
    const iconMap = { depart: 'fa-circle-dot', etape: 'fa-map-pin', destination: 'fa-flag-checkered' };

    container.innerHTML = arrets.map((arret, idx) => {
        const isDestination = arret.type === 'destination';
        const labelType = arret.type === 'depart'      ? 'Départ'
                        : arret.type === 'destination' ? 'Destination'
                        : `Arrêt ${idx}`;
        return `
        <div class="etape-block${idx === 0 ? ' active' : ''}" data-idx="${idx}" style="display:${idx === 0 ? 'block' : 'none'};"
             data-long-max="${long}" data-larg-max="${larg}" data-haut-max="${haut}" data-poids-max="${poids}">
            <div class="etape-block-header">
                <span class="etape-badge etape-badge--${arret.type}">
                    <i class="fa-solid ${iconMap[arret.type]}"></i> ${labelType}
                </span>
                <span class="etape-ville">${arret.label}</span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label><i class="fa-solid fa-clock"></i> Heure de passage</label>
                    <input type="time" name="exp_etape_heure_${idx}">
                </div>
            </div>
            ${isDestination ? `
            <div style="margin-top:10px; padding:10px 14px; background:#f1f5f9; border-radius:8px; color:#64748b; font-size:0.85rem;">
                <i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i>
                La marchandise est déchargée à destination — aucune capacité à encoder.
            </div>
            <input type="hidden" name="exp_etape_long_${idx}"  value="0">
            <input type="hidden" name="exp_etape_larg_${idx}"  value="0">
            <input type="hidden" name="exp_etape_haut_${idx}"  value="0">
            <input type="hidden" name="exp_etape_poids_${idx}" value="0">
            ` : `
            <div class="form-row-tri">
                <div class="form-group">
                    <label>Longueur (m)</label>
                    <input type="number" name="exp_etape_long_${idx}" step="0.1" min="0" max="${long}" placeholder="0.0">
                    <div class="info-max">Max : <span>${long || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Largeur (m)</label>
                    <input type="number" name="exp_etape_larg_${idx}" step="0.1" min="0" max="${larg}" placeholder="0.0">
                    <div class="info-max">Max : <span>${larg || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Hauteur (m)</label>
                    <input type="number" name="exp_etape_haut_${idx}" step="0.1" min="0" max="${haut}" placeholder="0.0">
                    <div class="info-max">Max : <span>${haut || '--'}</span></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Charge disponible (kg)</label>
                    <input type="number" name="exp_etape_poids_${idx}" min="0" max="${poids}" placeholder="Ex : 1200">
                    <div class="info-max">Max : <span>${poids || '--'}</span></div>
                </div>
            </div>
            `}
        </div>`;
    }).join('');

    rafraichirExpressNavArrets();
}

function rafraichirExpressNavArrets() {
    const nav = document.getElementById('exp-arrets-nav');
    if (!nav) return;

    const estDernier = expArretCourant === expArretsTotal - 1;
    let dots = '';
    for (let i = 0; i < expArretsTotal; i++) {
        dots += `<div class="arret-dot${i === expArretCourant ? ' active' : (i < expArretCourant ? ' done' : '')}"></div>`;
        if (i < expArretsTotal - 1) dots += '<div class="arret-line"></div>';
    }

    nav.innerHTML = `
        <div class="arrets-stepper">${dots}</div>
        <div class="arrets-nav-btns">
            <button type="button" class="btn-secondary" onclick="naviguerExpressArret(-1)" ${expArretCourant === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-left"></i> Précédent
            </button>
            ${estDernier
                ? `<button type="button" class="btn-primary" onclick="goToExpressStep(3)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
                : `<button type="button" class="btn-primary" onclick="naviguerExpressArret(1)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
            }
        </div>`;
}

function naviguerExpressArret(direction) {
    hideExpressError();
    if (direction === 1 && !validerExpressArretIdx(expArretCourant)) return;

    const blocks = document.querySelectorAll('#exp-capacites-par-etape .etape-block');
    if (blocks[expArretCourant]) blocks[expArretCourant].style.display = 'none';

    expArretCourant += direction;
    if (expArretCourant < 0) expArretCourant = 0;
    if (expArretCourant >= expArretsTotal) expArretCourant = expArretsTotal - 1;

    if (blocks[expArretCourant]) blocks[expArretCourant].style.display = 'block';
    rafraichirExpressNavArrets();
}

function validerExpressArretIdx(idx) {
    const block = document.querySelector(`#exp-capacites-par-etape .etape-block[data-idx="${idx}"]`);
    if (!block) return true;

    const ville = block.querySelector('.etape-ville')?.textContent || `Arrêt ${idx}`;
    const long  = parseFloat(block.dataset.longMax)  || 0;
    const larg  = parseFloat(block.dataset.largMax)  || 0;
    const haut  = parseFloat(block.dataset.hautMax)  || 0;
    const poids = parseFloat(block.dataset.poidsMax) || 0;

    const heureInput = block.querySelector(`[name="exp_etape_heure_${idx}"]`)?.value?.trim();
    const vLong  = parseFloat(block.querySelector(`[name="exp_etape_long_${idx}"]`)?.value);
    const vLarg  = parseFloat(block.querySelector(`[name="exp_etape_larg_${idx}"]`)?.value);
    const vHaut  = parseFloat(block.querySelector(`[name="exp_etape_haut_${idx}"]`)?.value);
    const vPoids = parseInt(block.querySelector(`[name="exp_etape_poids_${idx}"]`)?.value);

    if (!heureInput) { showExpressError(`Veuillez renseigner l'heure de passage pour "${ville}".`); return false; }

    const isDestination = block.querySelector('.etape-badge')?.classList.contains('etape-badge--destination');
    if (!isDestination) {
        if (!vLong || vLong <= 0)  { showExpressError(`Veuillez renseigner la longueur disponible pour "${ville}".`);    return false; }
        if (!vLarg || vLarg <= 0)  { showExpressError(`Veuillez renseigner la largeur disponible pour "${ville}".`);     return false; }
        if (!vHaut || vHaut <= 0)  { showExpressError(`Veuillez renseigner la hauteur disponible pour "${ville}".`);     return false; }
        if (!vPoids || vPoids <= 0){ showExpressError(`Veuillez renseigner la charge disponible pour "${ville}".`);      return false; }
        if (vLong > long)          { showExpressError(`"${ville}" — longueur dépassée (max ${long} m).`);                return false; }
        if (vLarg > larg)          { showExpressError(`"${ville}" — largeur dépassée (max ${larg} m).`);                 return false; }
        if (vHaut > haut)          { showExpressError(`"${ville}" — hauteur dépassée (max ${haut} m).`);                 return false; }
        if (vPoids > poids)        { showExpressError(`"${ville}" — charge dépassée (max ${poids} kg).`);                return false; }
    }

    if (idx > 0) {
        const heureActuelle = block.querySelector(`[name="exp_etape_heure_${idx}"]`)?.value;
        const prevBlock     = document.querySelector(`#exp-capacites-par-etape .etape-block[data-idx="${idx - 1}"]`);
        const heurePrev     = prevBlock?.querySelector(`[name="exp_etape_heure_${idx - 1}"]`)?.value;
        if (heureActuelle && heurePrev && heureActuelle < heurePrev) {
            const villePrev = prevBlock?.querySelector('.etape-ville')?.textContent || `Arrêt ${idx - 1}`;
            showExpressError(`"${ville}" — l'heure (${heureActuelle}) ne peut pas être avant celle de "${villePrev}" (${heurePrev}).`);
            return false;
        }
    }
    return true;
}

function validateExpressCapacites() {
    for (let i = 0; i < expArretsTotal; i++) {
        if (!validerExpressArretIdx(i)) return false;
    }
    return true;
}

function collectExpressCapacites() {
    const container = document.getElementById('exp-capacites-par-etape');
    if (!container) return [];

    const arrets = [
        { label: expSnapshotCycle.depart,      type: 'depart' },
        ...(expSnapshotCycle.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: expSnapshotCycle.destination, type: 'destination' }
    ];

    return [...container.querySelectorAll('.etape-block')].map((block, idx) => ({
        ville:             arrets[idx]?.label || '',
        type:              arrets[idx]?.type  || 'etape',
        heure:             block.querySelector(`[name="exp_etape_heure_${idx}"]`)?.value || '',
        longueur:          parseFloat(block.querySelector(`[name="exp_etape_long_${idx}"]`)?.value)  || 0,
        largeur:           parseFloat(block.querySelector(`[name="exp_etape_larg_${idx}"]`)?.value)  || 0,
        hauteur:           parseFloat(block.querySelector(`[name="exp_etape_haut_${idx}"]`)?.value)  || 0,
        charge_disponible: parseInt(block.querySelector(`[name="exp_etape_poids_${idx}"]`)?.value)   || 0,
    }));
}

/* Soumission express */
async function soumettreOffreExpress() {
    hideExpressError();
    if (!validateExpressCapacites()) return;

    const username = localStorage.getItem("currentUser") || "admin";

    const dateTrajet = document.getElementById('exp-date-trajet').value;
    if (!dateTrajet) { showExpressError("Veuillez renseigner la date du trajet."); return; }

    const expireDate  = document.getElementById('exp-expire-date').value;
    const expireHeure = document.getElementById('exp-expire-heure').value;
    if (!expireDate || !expireHeure) { showExpressError("Veuillez renseigner la date et l'heure d'expiration."); return; }
    if (expireDate > dateTrajet)     { showExpressError("La date d'expiration ne peut pas être après la date du trajet."); return; }

    const tarifVal = parseFloat(document.getElementById('exp-tarif-euro-m3-km').value);
    if (!tarifVal || tarifVal <= 0) { showExpressError("€/km : veuillez renseigner un tarif valide."); return; }

    const capacites = collectExpressCapacites();

    const payload = {
        camion_id:           expSnapshotCamion.immatriculation,
        snapshot_camion:     { ...expSnapshotCamion },
        cycle_id:            null,   // trajet libre — pas de cycle préenregistré
        snapshot_cycle:      { ...expSnapshotCycle, etapes: [...expSnapshotCycle.etapes] },
        type_marchandise:    document.getElementById('exp-type-marchandise').value,
        depart:              expSnapshotCycle.depart,
        destination:         expSnapshotCycle.destination,
        etapes:              [...expSnapshotCycle.etapes],
        date:                dateTrajet,
        expire_date:         expireDate,
        expire_heure:        expireHeure,
        tarif_euro_m3_km:    tarifVal,
        capacites_par_etape: capacites,
        statut:              "Planifiée"
    };

    try {
        const res = await fetch(`/api/offres/${username}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });
        if (res.ok) {
            closeOffreExpressModal();
            location.reload();
        } else {
            showExpressError("Une erreur est survenue lors de la publication. Veuillez réessayer.");
        }
    } catch (err) {
        console.error(err);
        showExpressError("Erreur réseau. Vérifiez votre connexion et réessayez.");
    }
}