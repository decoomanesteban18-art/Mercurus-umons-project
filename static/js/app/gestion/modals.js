/**
 * MERCURUS - Modals : Édition d'offre (stepper) & Suppression
 *
 * PRINCIPE : Le cycle et le camion sont figés à la création de l'offre.
 * En mode édition, on utilise TOUJOURS les snapshots stockés dans l'offre
 * (snapshot_camion, snapshot_cycle) pour afficher et valider les capacités.
 * Seuls le tarif, les dates, le statut et les heures/capacités par arrêt
 * peuvent être modifiés.
 */

/* ==========================================================================
   VARIABLES D'ÉTAT
   ========================================================================== */

let currentOffreId   = null;
let currentOffre     = null;   // offre complète chargée depuis l'API (snapshots inclus)
let editArretCourant = 0;
let editArretsTotal  = 0;

// Limites lues depuis snapshot_camion — jamais depuis l'API trucks en direct
let truckLimitsEdit = { long: 0, larg: 0, haut: 0, poids: 0 };

/* ==========================================================================
   1. UTILITAIRES UI
   ========================================================================== */

function showModalError(message) {
    const errBox = document.getElementById('modal-error-msg');
    if (!errBox) return;
    errBox.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${message}</span>`;
    errBox.style.display = 'flex';
}

function hideModalError() {
    const errBox = document.getElementById('modal-error-msg');
    if (errBox) { errBox.style.display = 'none'; errBox.innerHTML = ''; }
}

/* ==========================================================================
   2. NAVIGATION STEPPER
   ========================================================================== */

function goToEditStep(step) {
    hideModalError();

    if (step === 2) {
        // On ne rebuilde PAS si le formulaire est déjà construit (évite de perdre les valeurs)
        const container = document.getElementById('edit-capacites-par-etape');
        if (!container || container.querySelectorAll('.etape-block').length === 0) {
            buildEditCapacitesForm(currentOffre?.capacites_par_etape || []);
        }
    }

    if (step === 3) {
        if (!validateEditCapacites()) return;
    }

    if (step === 4) {
        const dateTrajet  = document.getElementById('edit-date-trajet')?.value;
        const expireDate  = document.getElementById('edit-expire-date')?.value;
        const expireHeure = document.getElementById('edit-expire-heure')?.value;
        const tarifVal    = parseFloat(document.getElementById('edit-tarif-euro-m3-km')?.value);

        if (!dateTrajet)              { showModalError("Veuillez renseigner la date du trajet."); return; }
        if (!expireDate || !expireHeure) { showModalError("Veuillez renseigner la date et l'heure d'expiration."); return; }
        if (expireDate > dateTrajet)  { showModalError("La date d'expiration ne peut pas être après la date du trajet."); return; }
        if (!tarifVal || tarifVal <= 0) { showModalError("€/km : veuillez renseigner un tarif valide."); return; }
    }

    [1, 2, 3, 4].forEach(i => {
        const el  = document.getElementById(`edit-step-${i}`);
        const dot = document.getElementById(`edit-dot-${i}`);
        if (el)  el.classList.toggle('active', i === step);
        if (dot) dot.classList.toggle('active', i === step);
    });
}

/* ==========================================================================
   3. GÉNÉRATION DU FORMULAIRE DE CAPACITÉS
   Utilise uniquement snapshot_cycle et snapshot_camion — jamais les données live.
   ========================================================================== */

function buildEditCapacitesForm(capacitesExistantes = []) {
    if (!currentOffre) return;

    // ✅ On lit le snapshot figé du cycle — pas cyclesDataEdit
    const snap = currentOffre.snapshot_cycle || {};
    const arrets = [
        { label: snap.depart      || currentOffre.depart,      type: 'depart' },
        ...(snap.etapes           || currentOffre.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: snap.destination || currentOffre.destination, type: 'destination' }
    ];

    editArretsTotal  = arrets.length;
    editArretCourant = 0;

    const container = document.getElementById('edit-capacites-par-etape');
    if (!container) return;

    // ✅ Limites lues depuis snapshot_camion — pas depuis l'API trucks
    const { long, larg, haut, poids } = truckLimitsEdit;
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
                    <input type="time" name="edit_etape_heure_${idx}">
                </div>
            </div>
            ${isDestination ? `
            <div style="margin-top:10px; padding:10px 14px; background:#f1f5f9; border-radius:8px; color:#64748b; font-size:0.85rem;">
                <i class="fa-solid fa-circle-info" style="color:#3b82f6;"></i>
                La marchandise est déchargée à destination — aucune capacité à encoder.
            </div>
            <input type="hidden" name="edit_etape_long_${idx}"  value="0">
            <input type="hidden" name="edit_etape_larg_${idx}"  value="0">
            <input type="hidden" name="edit_etape_haut_${idx}"  value="0">
            <input type="hidden" name="edit_etape_poids_${idx}" value="0">
            ` : `
            <div class="form-row-tri">
                <div class="form-group">
                    <label>Longueur (m)</label>
                    <input type="number" name="edit_etape_long_${idx}" step="0.1" min="0" max="${long}" placeholder="0.0">
                    <div class="info-max">Max : <span>${long || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Largeur (m)</label>
                    <input type="number" name="edit_etape_larg_${idx}" step="0.1" min="0" max="${larg}" placeholder="0.0">
                    <div class="info-max">Max : <span>${larg || '--'}</span></div>
                </div>
                <div class="form-group">
                    <label>Hauteur (m)</label>
                    <input type="number" name="edit_etape_haut_${idx}" step="0.1" min="0" max="${haut}" placeholder="0.0">
                    <div class="info-max">Max : <span>${haut || '--'}</span></div>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Charge disponible (kg)</label>
                    <input type="number" name="edit_etape_poids_${idx}" min="0" max="${poids}" placeholder="Ex : 1200">
                    <div class="info-max">Max : <span>${poids || '--'}</span></div>
                </div>
            </div>
            `}
        </div>`;
    }).join('');

    // Réinjection des valeurs existantes
    capacitesExistantes.forEach((cap, idx) => {
        const setVal = (name, val) => {
            const el = container.querySelector(`[name="${name}"]`);
            if (el && val !== undefined && val !== null) el.value = val;
        };
        const setValStr = (name, val) => {
            const el = container.querySelector(`[name="${name}"]`);
            if (el && val !== undefined && val !== null && val !== '') el.value = val;
        };
        setValStr(`edit_etape_heure_${idx}`, cap.heure);
        setVal(`edit_etape_long_${idx}`,  cap.longueur);
        setVal(`edit_etape_larg_${idx}`,  cap.largeur);
        setVal(`edit_etape_haut_${idx}`,  cap.hauteur);
        setVal(`edit_etape_poids_${idx}`, cap.charge_disponible);
    });

    rafraichirEditNavArrets();
}

function rafraichirEditNavArrets() {
    const nav = document.getElementById('edit-arrets-nav');
    if (!nav) return;

    const estDernier = editArretCourant === editArretsTotal - 1;

    let dots = '';
    for (let i = 0; i < editArretsTotal; i++) {
        dots += `<div class="arret-dot${i === editArretCourant ? ' active' : (i < editArretCourant ? ' done' : '')}"></div>`;
        if (i < editArretsTotal - 1) dots += '<div class="arret-line"></div>';
    }

    nav.innerHTML = `
        <div class="arrets-stepper">${dots}</div>
        <div class="arrets-nav-btns">
            <button type="button" class="btn-secondary" onclick="naviguerEditArret(-1)" ${editArretCourant === 0 ? 'disabled' : ''}>
                <i class="fa-solid fa-arrow-left"></i> Précédent
            </button>
            ${estDernier
                ? `<button type="button" class="btn-primary" onclick="goToEditStep(3)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
                : `<button type="button" class="btn-primary" onclick="naviguerEditArret(1)">
                       Suivant <i class="fa-solid fa-arrow-right"></i>
                   </button>`
            }
        </div>`;
}

function naviguerEditArret(direction) {
    hideModalError();

    if (direction === 1 && !validerEditArretIdx(editArretCourant)) return;

    const blocks = document.querySelectorAll('#edit-capacites-par-etape .etape-block');
    if (blocks[editArretCourant]) blocks[editArretCourant].style.display = 'none';

    editArretCourant += direction;
    if (editArretCourant < 0) editArretCourant = 0;
    if (editArretCourant >= editArretsTotal) editArretCourant = editArretsTotal - 1;

    if (blocks[editArretCourant]) blocks[editArretCourant].style.display = 'block';

    rafraichirEditNavArrets();
}

/* ==========================================================================
   4. VALIDATION PAR ARRÊT (lit les max depuis data-attributes du bloc)
   ========================================================================== */

function validerEditArretIdx(idx) {
    const block = document.querySelector(`#edit-capacites-par-etape .etape-block[data-idx="${idx}"]`);
    if (!block) return true;

    const ville  = block.querySelector('.etape-ville')?.textContent || `Arrêt ${idx}`;
    const long   = parseFloat(block.dataset.longMax)  || 0;
    const larg   = parseFloat(block.dataset.largMax)  || 0;
    const haut   = parseFloat(block.dataset.hautMax)  || 0;
    const poids  = parseFloat(block.dataset.poidsMax) || 0;

    const heureInput = block.querySelector(`[name="edit_etape_heure_${idx}"]`)?.value?.trim();
    const vLong  = parseFloat(block.querySelector(`[name="edit_etape_long_${idx}"]`)?.value);
    const vLarg  = parseFloat(block.querySelector(`[name="edit_etape_larg_${idx}"]`)?.value);
    const vHaut  = parseFloat(block.querySelector(`[name="edit_etape_haut_${idx}"]`)?.value);
    const vPoids = parseInt(block.querySelector(`[name="edit_etape_poids_${idx}"]`)?.value);

    if (!heureInput)           { showModalError(`Veuillez renseigner l'heure de passage pour "${ville}".`);     return false; }

    // La destination ne nécessite pas de capacités (la marchandise y est déchargée)
    const isDestination = block.querySelector('.etape-badge')?.classList.contains('etape-badge--destination');
    if (!isDestination) {
        if (!vLong || vLong <= 0)  { showModalError(`Veuillez renseigner la longueur disponible pour "${ville}".`); return false; }
        if (!vLarg || vLarg <= 0)  { showModalError(`Veuillez renseigner la largeur disponible pour "${ville}".`);  return false; }
        if (!vHaut || vHaut <= 0)  { showModalError(`Veuillez renseigner la hauteur disponible pour "${ville}".`);  return false; }
        if (!vPoids || vPoids <= 0){ showModalError(`Veuillez renseigner la charge disponible pour "${ville}".`);   return false; }
        if (vLong  > long)         { showModalError(`"${ville}" — longueur dépassée (max ${long} m).`);             return false; }
        if (vLarg  > larg)         { showModalError(`"${ville}" — largeur dépassée (max ${larg} m).`);              return false; }
        if (vHaut  > haut)         { showModalError(`"${ville}" — hauteur dépassée (max ${haut} m).`);              return false; }
        if (vPoids > poids)        { showModalError(`"${ville}" — charge dépassée (max ${poids} kg).`);             return false; }
    }

    if (idx > 0) {
        const heureActuelle = block.querySelector(`[name="edit_etape_heure_${idx}"]`)?.value;
        const prevBlock     = document.querySelector(`#edit-capacites-par-etape .etape-block[data-idx="${idx - 1}"]`);
        const heurePrev     = prevBlock?.querySelector(`[name="edit_etape_heure_${idx - 1}"]`)?.value;
        if (heureActuelle && heurePrev && heureActuelle < heurePrev) {
            const villePrev = prevBlock?.querySelector('.etape-ville')?.textContent || `Arrêt ${idx - 1}`;
            showModalError(`"${ville}" — l'heure de passage (${heureActuelle}) ne peut pas être avant celle de "${villePrev}" (${heurePrev}).`);
            return false;
        }
    }

    return true;
}

function validateEditCapacites() {
    for (let i = 0; i < editArretsTotal; i++) {
        if (!validerEditArretIdx(i)) return false;
    }
    return true;
}

/* ==========================================================================
   5. COLLECTE DES CAPACITÉS PAR ARRÊT
   Utilise les arrêts du snapshot figé — jamais cyclesDataEdit.
   ========================================================================== */

function collectEditCapacites() {
    const container = document.getElementById('edit-capacites-par-etape');
    if (!container || !currentOffre) return [];

    // ✅ On lit le snapshot figé du cycle — pas cyclesDataEdit
    const snap = currentOffre.snapshot_cycle || {};
    const arrets = [
        { label: snap.depart      || currentOffre.depart,      type: 'depart' },
        ...(snap.etapes           || currentOffre.etapes || []).map(e => ({ label: e, type: 'etape' })),
        { label: snap.destination || currentOffre.destination, type: 'destination' }
    ];

    return [...container.querySelectorAll('.etape-block')].map((block, idx) => ({
        ville:             arrets[idx]?.label || '',
        type:              arrets[idx]?.type  || 'etape',
        heure:             block.querySelector(`[name="edit_etape_heure_${idx}"]`)?.value || '',
        longueur:          parseFloat(block.querySelector(`[name="edit_etape_long_${idx}"]`)?.value)  || 0,
        largeur:           parseFloat(block.querySelector(`[name="edit_etape_larg_${idx}"]`)?.value)  || 0,
        hauteur:           parseFloat(block.querySelector(`[name="edit_etape_haut_${idx}"]`)?.value)  || 0,
        charge_disponible: parseInt(block.querySelector(`[name="edit_etape_poids_${idx}"]`)?.value)   || 0,
    }));
}

/* ==========================================================================
   6. MISE À JOUR DES LIMITES CAMION (désactivée — on lit le snapshot)
   Conservée pour rétrocompatibilité si appelée ailleurs, mais sans effet.
   ========================================================================== */

function updateMaxIndicatorsEdit() {
    // Les limites camion sont figées via snapshot_camion à l'ouverture de la modale.
    // Cette fonction n'a plus d'effet : on ne relit jamais l'API trucks en édition.
}

/* ==========================================================================
   7. OUVERTURE — CHARGEMENT ET PRÉ-REMPLISSAGE
   ========================================================================== */

/* ==========================================================================
   LOCKED MODE — désactive tous les inputs/boutons quand l'offre est verrouillée
   ========================================================================== */

function _applyLockedMode(isLocked) {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    // Bannière de verrouillage
    let banner = modal.querySelector('.locked-banner');
    if (isLocked) {
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'locked-banner';
            banner.innerHTML = `<i class="fa-solid fa-lock"></i> Cette offre est <strong>verrouillée</strong> — aucune modification n'est possible.`;
            const body = modal.querySelector('.modal-body') || modal.querySelector('.modal-content') || modal;
            body.prepend(banner);
        }
        banner.style.display = 'flex';
    } else {
        if (banner) banner.style.display = 'none';
    }

    // Désactiver / réactiver tous les champs et boutons de sauvegarde
    const fields = modal.querySelectorAll('input, select, textarea, button[onclick*="goToEditStep"], button[onclick*="sauvegarder"], button[onclick*="naviguer"], button[onclick*="valider"]');
    fields.forEach(el => {
        if (isLocked) {
            el.setAttribute('disabled', 'disabled');
            el.style.pointerEvents = 'none';
            el.style.opacity = '0.5';
        } else {
            el.removeAttribute('disabled');
            el.style.pointerEvents = '';
            el.style.opacity = '';
        }
    });

    // Cacher le bouton "Enregistrer" / "Sauvegarder"
    const saveBtns = modal.querySelectorAll('[onclick*="sauvegarder"], [onclick*="Sauvegarder"], .btn-save, #btn-save-offre');
    saveBtns.forEach(btn => { btn.style.display = isLocked ? 'none' : ''; });
}

async function openSettingsModal(offreId) {
    currentOffreId = offreId;
    currentOffre   = null;

    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    const form = document.getElementById('form-edit-offre');
    if (form) form.reset();

    truckLimitsEdit = { long: 0, larg: 0, haut: 0, poids: 0 };
    const cap = document.getElementById('edit-capacites-par-etape');
    if (cap) cap.innerHTML = '';

    hideModalError();
    modal.style.display = 'flex';
    goToEditStep(1);

    const username = localStorage.getItem('currentUser') || 'admin';

    try {
        const resOffre = await fetch(`/api/offres/${username}/${offreId}`);
        if (!resOffre.ok) throw new Error('Offre introuvable');

        const offre  = await resOffre.json();
        currentOffre = offre;  // stocké globalement pour buildEditCapacitesForm et collectEditCapacites

        // --- VERROUILLAGE : offre Acceptée ou Publiée → lecture seule ---
        const isLocked = offre.statut === 'Acceptée' || offre.statut === 'Publiée';
        _applyLockedMode(isLocked);

        // ✅ Limites du camion lues depuis snapshot_camion — pas depuis l'API trucks
        const snapCamion = offre.snapshot_camion || {};
        truckLimitsEdit = {
            long:  snapCamion.long  || 0,
            larg:  snapCamion.larg  || 0,
            haut:  snapCamion.haut  || 0,
            poids: snapCamion.poids || 0,
        };

        // ✅ Affichage du camion figé (lecture seule — pas de select modifiable)
        const sTruck = document.getElementById('edit-camion');
        if (sTruck) {
            sTruck.innerHTML = `<option value="${offre.camion_id}" selected>${offre.camion_id}</option>`;
            sTruck.disabled  = true;  // le camion est figé, on ne peut plus le changer
        }

        // ✅ Affichage du cycle figé (lecture seule — pas de select modifiable)
        const snapCycle = offre.snapshot_cycle || {};
        const sCycle = document.getElementById('edit-cycle');
        if (sCycle) {
            const nomCycle = snapCycle.nom_cycle
                ? `${snapCycle.nom_cycle} (${snapCycle.depart} → ${snapCycle.destination})`
                : `Cycle #${offre.cycle_id}`;
            sCycle.innerHTML = `<option value="${offre.cycle_id}" selected>${nomCycle}</option>`;
            sCycle.disabled  = true;  // le cycle est figé, on ne peut plus le changer
        }

        // Type de transport (modifiable)
        const sType = document.getElementById('edit-type-transport');
        if (sType && offre.type_transport) sType.value = offre.type_transport;

        // Type de marchandise (modifiable)
        const sMarch = document.getElementById('edit-type-marchandise');
        if (sMarch && offre.type_marchandise) sMarch.value = offre.type_marchandise;

        // Pré-construction du formulaire de capacités avec les données existantes
        buildEditCapacitesForm(offre.capacites_par_etape || []);

        // Dates, expiration, tarif (modifiables)
        const f = id => document.getElementById(id);
        if (f('edit-date-trajet'))      f('edit-date-trajet').value      = offre.date              || '';
        if (f('edit-expire-date'))      f('edit-expire-date').value      = offre.expire_date       || '';
        if (f('edit-expire-heure'))     f('edit-expire-heure').value     = offre.expire_heure      || '';
        if (f('edit-tarif-euro-m3-km')) f('edit-tarif-euro-m3-km').value = offre.tarif_euro_m3_km || '';

        // Statut (modifiable — une offre "Publiée" peut repasser en "Planifiée")
        const statut = (offre.statut === 'Publiée') ? 'Planifiée' : (offre.statut || 'Brouillon');
        const radio  = document.querySelector(`input[name="edit-offre-status"][value="${statut}"]`);
        if (radio) radio.checked = true;

    } catch (err) {
        console.error('openSettingsModal :', err);
        showModalError('Impossible de charger les données de cette offre.');
    }
}

/* ==========================================================================
   8. SAUVEGARDE
   Le payload n'envoie que les champs modifiables.
   Les champs figés (depart, destination, etapes, snapshots, camion_id, cycle_id)
   sont protégés côté serveur (main.py CHAMPS_IMMUABLES) et ignorés même si envoyés.
   ========================================================================== */

async function sauvegarderModificationOffre() {
    hideModalError();

    if (!currentOffreId || !currentOffre) return;

    const username = localStorage.getItem('currentUser') || 'admin';
    const capacites = collectEditCapacites();

    const dateTrajet  = document.getElementById('edit-date-trajet')?.value;
    const expireDate  = document.getElementById('edit-expire-date')?.value;
    const expireHeure = document.getElementById('edit-expire-heure')?.value;
    const tarifVal    = parseFloat(document.getElementById('edit-tarif-euro-m3-km')?.value);
    const statut = document.querySelector('input[name="edit-offre-status"]:checked')?.value || 'Brouillon';
    const typeMarchandise = document.getElementById('edit-type-marchandise')?.value || 'Palette';

    // Payload : uniquement les champs modifiables
    // Les champs figés (depart, destination, etapes, snapshots, camion_id, cycle_id)
    // sont renvoyés depuis currentOffre pour que le serveur puisse les valider,
    // mais le serveur les écrasera de toute façon avec les valeurs d'origine.
    const payload = {
        camion_id:           currentOffre.camion_id,
        cycle_id:            currentOffre.cycle_id,
        snapshot_camion:     currentOffre.snapshot_camion,
        snapshot_cycle:      currentOffre.snapshot_cycle,
        depart:              currentOffre.depart,
        destination:         currentOffre.destination,
        etapes:              currentOffre.etapes,

        // Champs modifiables
        type_marchandise:    typeMarchandise,
        date:                dateTrajet,
        expire_date:         expireDate,
        expire_heure:        expireHeure,
        tarif_euro_m3_km:    tarifVal,
        capacites_par_etape: capacites,
        statut,
    };

    try {
        const res = await fetch(`/api/offres/${username}/${currentOffreId}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });

        if (res.ok) {
            closeSettingsModal();
            location.reload();
        } else {
            showModalError("Erreur lors de la sauvegarde. Veuillez réessayer.");
        }
    } catch (err) {
        console.error('sauvegarderModificationOffre :', err);
        showModalError("Erreur réseau. Vérifiez votre connexion.");
    }
}

/* ==========================================================================
   9. FERMETURE SETTINGS MODAL
   ========================================================================== */

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.style.display = 'none';
    currentOffreId = null;
    currentOffre   = null;
}

/* ==========================================================================
   10. DELETE MODAL
   ========================================================================== */

function askDeleteOffre(offreId) {
    currentOffreId = offreId;

    const modal = document.getElementById('deleteModal');
    if (!modal) return;

    modal.style.display = 'flex';

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        newBtn.addEventListener('click', () => confirmerSuppressionOffre(offreId));
    }
}

async function confirmerSuppressionOffre(offreId) {
    const username = localStorage.getItem('currentUser') || 'admin';
    try {
        const res = await fetch(`/api/offres/${username}/${offreId}`, { method: 'DELETE' });
        closeDeleteModal();
        if (res.ok) location.reload();
    } catch (err) {
        console.error('confirmerSuppressionOffre :', err);
        closeDeleteModal();
    }
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteModal');
    if (modal) modal.style.display = 'none';
    currentOffreId = null;
}

/* ==========================================================================
   11. FERMETURE AU CLIC SUR L'OVERLAY
   ========================================================================== */

/* ==========================================================================
   12. MODALE DÉTAILS (lecture seule — offre Acceptée)
   ========================================================================== */

async function ouvrirDetailsOffre(offreId) {
    const modal = document.getElementById('detailsOffreModal');
    const body  = document.getElementById('details-offre-body');
    if (!modal || !body) return;

    body.innerHTML = '<p style="color:#64748b;">Chargement...</p>';
    modal.style.display = 'flex';

    const username = localStorage.getItem('currentUser') || 'admin';

    try {
        const res = await fetch(`/api/offres/${username}/${offreId}`);
        if (!res.ok) throw new Error('Introuvable');
        const o = await res.json();

        const snap  = o.snapshot_camion || {};
        const cycle = o.snapshot_cycle  || {};

        const etapesHtml = (o.capacites_par_etape || []).map((e, idx) => {
            const isLast = idx === (o.capacites_par_etape.length - 1);
            const icon   = idx === 0 ? '📍' : isLast ? '🏁' : '🔄';
            const caps   = isLast
                ? '<span style="color:#94a3b8;font-size:0.8rem;">Déchargement</span>'
                : `<span style="font-size:0.82rem;color:#475569;">
                       ${e.charge_disponible ?? '--'} kg &nbsp;·&nbsp;
                       ${e.longueur ?? '--'} × ${e.largeur ?? '--'} × ${e.hauteur ?? '--'} m
                   </span>`;
            return `
            <div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f1f5f9;">
                <span style="font-size:1.1rem;margin-top:2px;">${icon}</span>
                <div style="flex:1;">
                    <strong style="font-size:0.92rem;color:#1e293b;">${e.ville}</strong>
                    <span style="color:#94a3b8;font-size:0.8rem;margin-left:8px;">${e.heure || '--:--'}</span>
                    <div style="margin-top:3px;">${caps}</div>
                </div>
            </div>`;
        }).join('');

        body.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center;background:#dbeafe;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;">
                <i class="fa-solid fa-lock" style="color:#1d4ed8;"></i>
                <span style="font-size:0.88rem;color:#1e40af;font-weight:600;">Offre acceptée — lecture seule</span>
            </div>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <span style="font-size:0.72rem;text-transform:uppercase;font-weight:700;color:#94a3b8;">Véhicule</span>
                    <p style="margin:4px 0 0;font-weight:700;color:#1e293b;">${o.camion_id}</p>
                    <p style="margin:2px 0 0;font-size:0.8rem;color:#64748b;">${snap.long ?? '--'} m · ${snap.poids ?? '--'} kg max</p>
                </div>
                <div>
                    <span style="font-size:0.72rem;text-transform:uppercase;font-weight:700;color:#94a3b8;">Trajet</span>
                    <p style="margin:4px 0 0;font-weight:700;color:#1e293b;">${o.depart} → ${o.destination}</p>
                    <p style="margin:2px 0 0;font-size:0.8rem;color:#64748b;">${o.date || '--'}</p>
                </div>
                <div>
                    <span style="font-size:0.72rem;text-transform:uppercase;font-weight:700;color:#94a3b8;">Tarif</span>
                    <p style="margin:4px 0 0;font-weight:700;color:#1e293b;">${o.tarif_euro_m3_km ?? '--'} € / km</p>
                </div>
                <div>
                    <span style="font-size:0.72rem;text-transform:uppercase;font-weight:700;color:#94a3b8;">Marchandise</span>
                    <p style="margin:4px 0 0;font-weight:700;color:#1e293b;">${o.type_marchandise || '--'}</p>
                </div>
            </div>

            <div>
                <p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;color:#94a3b8;margin:0 0 4px;">Arrêts & capacités</p>
                ${etapesHtml}
            </div>
        `;
    } catch (err) {
        body.innerHTML = '<p style="color:#ef4444;">Impossible de charger les détails.</p>';
    }
}

function fermerDetailsOffre() {
    const modal = document.getElementById('detailsOffreModal');
    if (modal) modal.style.display = 'none';
}


document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('settingsModal')) closeSettingsModal();
    });
    document.getElementById('deleteModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('deleteModal')) closeDeleteModal();
    });
});
/* ==========================================================================
   13. RENVOYER OFFRE (Fin de publication → mise à jour du délai)
   ========================================================================== */

function renvoyerOffre(offreId) {
    const modal = document.getElementById('renvoyerOffreModal');
    if (!modal) return;

    const dateEl  = document.getElementById('renvoyer-expire-date');
    const heureEl = document.getElementById('renvoyer-expire-heure');
    if (dateEl)  dateEl.value  = '';
    if (heureEl) heureEl.value = '';

    const errEl = document.getElementById('renvoyer-error');
    if (errEl) errEl.style.display = 'none';

    modal.dataset.offreId = offreId;
    modal.style.display = 'flex';
}

function fermerRenvoyerOffre() {
    const modal = document.getElementById('renvoyerOffreModal');
    if (modal) modal.style.display = 'none';
}

async function confirmerRenvoyerOffre() {
    const modal   = document.getElementById('renvoyerOffreModal');
    const offreId = parseInt(modal?.dataset.offreId);
    if (!offreId) return;

    const dateVal  = document.getElementById('renvoyer-expire-date')?.value;
    const heureVal = document.getElementById('renvoyer-expire-heure')?.value;
    const errEl    = document.getElementById('renvoyer-error');

    if (!dateVal || !heureVal) {
        if (errEl) { errEl.textContent = "Veuillez renseigner la date et l'heure."; errEl.style.display = 'block'; }
        return;
    }
    if (errEl) errEl.style.display = 'none';

    const username = localStorage.getItem('currentUser') || 'admin';

    try {
        const res = await fetch(`/api/offres/${username}/${offreId}`);
        if (!res.ok) throw new Error();
        const offre = await res.json();

        // Restaurer l'ancien statut ou Planifiée par défaut
        const ancienStatut = offre.statut_avant || 'Planifiée';

        const payload = { ...offre, expire_date: dateVal, expire_heure: heureVal, statut: ancienStatut, statut_avant: null };

        const resPut = await fetch(`/api/offres/${username}/${offreId}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        });

        if (resPut.ok) {
            fermerRenvoyerOffre();
            location.reload();
        } else {
            if (errEl) { errEl.textContent = 'Erreur lors de la sauvegarde.'; errEl.style.display = 'block'; }
        }
    } catch {
        if (errEl) { errEl.textContent = 'Erreur réseau.'; errEl.style.display = 'block'; }
    }
}
