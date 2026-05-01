/**
 * add-modal.js
 * Gestion complète des cycles avec validation géographique 
 * et messages d'erreurs dynamiques.
 */

// --- CONFIGURATION DES VILLES AUTORISÉES ---
const VILLES_AUTORISEES = [
    "Mons", "Charleroi", "Ath", "Tournai", "Soignies", "La Louvière",
    "Binche", "Saint-Ghislain", "Péruwelz", "Braine-le-Comte",
    "Mouscron", "Comines-Warneton", "Lessines", "Châtelet", "Fleurus"
];

let etapesInitiales = []; 
let etapesModif = [];     
let idCycleEnCours = null; 

function getCurrentUser() {
    return localStorage.getItem("currentUser");
}

/**
 * Affiche un message d'erreur éphémère sous un input (Animation + Texte)
 */
function afficherErreurChamp(inputElement, message) {
    // 1. Nettoyage de l'erreur précédente
    const parent = inputElement.parentElement;
    const existingError = parent.querySelector('.error-toast');
    if (existingError) existingError.remove();

    // 2. Création du message d'erreur
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-toast';
    errorMsg.innerText = message;

    // 3. Animation de secousse
    inputElement.classList.add('shake-animation');
    parent.appendChild(errorMsg);

    // 4. Retrait automatique après 3 secondes
    setTimeout(() => {
        inputElement.classList.remove('shake-animation');
        errorMsg.style.opacity = '0';
        setTimeout(() => errorMsg.remove(), 300);
    }, 3000);
}

/**
 * GESTION GÉNÉRIQUE DES MODAUX
 */
function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = show ? 'flex' : 'none';

    if (show && modalId === 'modal-ajout-cycle') {
        document.getElementById('form-ajout-cycle').reset();
        etapesInitiales = [];
        renderEtapesVisual('liste-etapes-visuelle', etapesInitiales, 'supprimerEtapeTag');
        // Autocomplete sur les champs fixes du modal ajout cycle
        attachVilleAutocomplete(document.getElementById('depart-cycle'));
        attachVilleAutocomplete(document.getElementById('dest-cycle'));
    }
    if (show && modalId === 'modal-edit-cycle') {
        // Autocomplete sur les champs fixes du modal édition cycle
        attachVilleAutocomplete(document.getElementById('edit-depart-cycle'));
        attachVilleAutocomplete(document.getElementById('edit-dest-cycle'));
    }
}

/**
 * RENDU DES TAGS (Pastilles de villes)
 */
function renderEtapesVisual(containerId, dataArray, deleteFuncName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    dataArray.forEach((ville, index) => {
        const tag = document.createElement('div');
        tag.className = 'tag-etape';
        tag.innerHTML = `
            <span>${ville}</span>
            <i class="fa-solid fa-xmark" onclick="${deleteFuncName}(${index})"></i>
        `;
        container.appendChild(tag);
    });
}

// ==========================================================================
// LOGIQUE : AJOUTER UNE ÉTAPE (VALIDATION INCLUSE)
// ==========================================================================

function ajouterEtape(inputId, containerId, isEdit = false) {
    const input = document.getElementById(inputId);
    const ville = input.value.trim();
    const listeTravail = isEdit ? etapesModif : etapesInitiales;

    if (ville === "") return;

    // Validation contre la liste officielle
    if (!VILLES_AUTORISEES.includes(ville)) {
        afficherErreurChamp(input, "Cette ville n'est pas desservie.");
        return;
    }

    if (!listeTravail.includes(ville)) {
        listeTravail.push(ville);
        renderEtapesVisual(containerId, listeTravail, isEdit ? 'supprimerEtapeModif' : 'supprimerEtapeTag');
    }
    input.value = "";
    input.focus();
}

function supprimerEtapeTag(index) {
    etapesInitiales.splice(index, 1);
    renderEtapesVisual('liste-etapes-visuelle', etapesInitiales, 'supprimerEtapeTag');
}

function supprimerEtapeModif(index) {
    etapesModif.splice(index, 1);
    renderEtapesVisual('edit-liste-etapes-visuelle', etapesModif, 'supprimerEtapeModif');
}

// ==========================================================================
// LOGIQUE : VALIDATION ET ENVOI FORMULAIRE (POST)
// ==========================================================================

async function validerAjoutCycle() {
    const inputNom = document.getElementById('nom-cycle');
    const inputDep = document.getElementById('depart-cycle');
    const inputDest = document.getElementById('dest-cycle');

    // Validation des villes de départ et destination
    let error = false;
    if (!VILLES_AUTORISEES.includes(inputDep.value)) {
        afficherErreurChamp(inputDep, "Ville de départ non reconnue.");
        error = true;
    }
    if (!VILLES_AUTORISEES.includes(inputDest.value)) {
        afficherErreurChamp(inputDest, "Ville de destination non reconnue.");
        error = true;
    }

    if (error) return;

    const data = {
        nom_cycle: inputNom.value,
        depart: inputDep.value,
        destination: inputDest.value,
        etapes: etapesInitiales
    };

    try {
        const response = await fetch(`/api/cycles/${getCurrentUser()}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            toggleModal('modal-ajout-cycle', false);
            if (typeof chargerEtAfficherCycles === 'function') chargerEtAfficherCycles();
        } else {
            const err = await response.json();
            alert("Erreur: " + err.detail);
        }
    } catch (e) {
        console.error(e);
    }
}

// ==========================================================================
// LOGIQUE : MODIFICATION (GET + PUT)
// ==========================================================================

async function ouvrirModifierCycle(id) {
    idCycleEnCours = id;
    const username = getCurrentUser();

    try {
        const response = await fetch(`/api/cycles/${username}`);
        const cycles = await response.json();
        const cycle = cycles.find(c => c.id === id);

        if (!cycle) return;

        document.getElementById('edit-nom-cycle').value = cycle.nom_cycle;
        document.getElementById('edit-depart-cycle').value = cycle.depart;
        document.getElementById('edit-dest-cycle').value = cycle.destination;
        
        etapesModif = [...(cycle.etapes || [])];
        renderEtapesVisual('edit-liste-etapes-visuelle', etapesModif, 'supprimerEtapeModif');
        
        toggleModal('modal-edit-cycle', true);
    } catch (err) {
        console.error(err);
    }
}

async function sauvegarderModifCycle() {
    if (!idCycleEnCours) return;
    
    const inputDep = document.getElementById('edit-depart-cycle');
    const inputDest = document.getElementById('edit-dest-cycle');

    // Validation géographique lors de la modif
    if (!VILLES_AUTORISEES.includes(inputDep.value) || !VILLES_AUTORISEES.includes(inputDest.value)) {
        if (!VILLES_AUTORISEES.includes(inputDep.value)) afficherErreurChamp(inputDep, "Ville invalide.");
        if (!VILLES_AUTORISEES.includes(inputDest.value)) afficherErreurChamp(inputDest, "Ville invalide.");
        return;
    }

    const data = {
        nom_cycle: document.getElementById('edit-nom-cycle').value,
        depart: inputDep.value,
        destination: inputDest.value,
        etapes: etapesModif
    };

    try {
        const response = await fetch(`/api/cycles/${getCurrentUser()}/${idCycleEnCours}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            toggleModal('modal-edit-cycle', false);
            if (typeof chargerEtAfficherCycles === 'function') chargerEtAfficherCycles();
        }
    } catch (e) {
        console.error(e);
    }
}