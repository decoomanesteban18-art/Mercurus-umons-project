/**
 * Mercurus - Gestion des Transports
 * Fichier : mes-transports.js
 * Gère l'affichage et la mise à jour des paramètres des camions.
 */

// Variable globale pour suivre le véhicule en cours d'édition
window.currentEditingImmat = null;

/**
 * Ouvre la modale et pré-remplit les champs avec les données du camion.
 * @param {string} immat - Immatriculation du camion
 * @param {string} type - Type de véhicule (ex: Camionnette)
 * @param {number} lon - Longueur en mètres
 * @param {number} lar - Largeur en mètres
 * @param {number} hau - Hauteur en mètres
 * @param {number} charge - Charge maximale en kg
 * @param {string} statut - Statut actuel (Disponible, Maintenance, En livraison, Indisponible)
 */
function openSettingsModal(immat, type, lon, lar, hau, charge, statut) {
    const modal = document.getElementById('truckSettings');
    const statutSelect = document.getElementById('statut_vehicule_edit');
    
    if (!modal || !statutSelect) return;

    window.currentEditingImmat = immat;

    document.getElementById('immatriculation-display').textContent = `Véhicule : ${immat}`;
    document.getElementById('longueur_edit').value = lon;
    document.getElementById('largeur_edit').value = lar;
    document.getElementById('hauteur_edit').value = hau;
    document.getElementById('charge_maximale_kg_edit').value = charge;
    // Forcer la sélection de l option correspondante
    for (let i = 0; i < statutSelect.options.length; i++) {
        if (statutSelect.options[i].value === statut) {
            statutSelect.selectedIndex = i;
            break;
        }
    }

    modal.style.display = 'flex';
}

/**
 * Ferme la modale et réinitialise l'état d'édition.
 */
function closeSettingsModal() {
    const modal = document.getElementById('truckSettings');
    if (modal) {
        modal.style.display = 'none';
    }
    window.currentEditingImmat = null;
}

/**
 * Envoie les modifications au serveur via une requête PUT.
 */
async function enregistrerModifications() {
    const immat = window.currentEditingImmat;
    if (!immat) return;

    const username = localStorage.getItem("currentUser");
    if (!username) {
        alert("Session expirée. Veuillez vous reconnecter.");
        window.location.href = "/login";
        return;
    }

    // Préparation de l'objet de données (cast en types numériques)
    const updatedTruck = {
        immatriculation: immat,
        statut: document.getElementById('statut_vehicule_edit').value,
        charge_maximale_kg: parseFloat(document.getElementById('charge_maximale_kg_edit').value),
        longueur: parseFloat(document.getElementById('longueur_edit').value),
        largeur: parseFloat(document.getElementById('largeur_edit').value),
        hauteur: parseFloat(document.getElementById('hauteur_edit').value)
    };

    // Validation basique
    if (isNaN(updatedTruck.charge_maximale_kg)) {
        alert("Veuillez entrer une valeur numérique valide pour la charge.");
        return;
    }

    try {
        const response = await fetch(`/api/trucks/${username}/${immat}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedTruck)
        });

        if (response.ok) {
            console.log(`Mise à jour réussie pour le camion ${immat}`);
            closeSettingsModal();
            
            // Rechargement de la liste des camions
            if (typeof chargerEtAfficherCamions === 'function') {
                chargerEtAfficherCamions();
            } else {
                window.location.reload();
            }
        } else {
            const errorData = await response.json();
            alert("Erreur lors de la sauvegarde : " + (errorData.detail || "Réponse invalide du serveur."));
        }
    } catch (error) {
        console.error("Erreur réseau :", error);
        alert("Impossible de contacter le serveur. Vérifiez votre connexion.");
    }
}

/**
 * Événements globaux
 */

// Fermer la modale si l'utilisateur clique en dehors du cadre blanc
window.onclick = function(event) {
    const modal = document.getElementById('truckSettings');
    if (event.target === modal) {
        closeSettingsModal();
    }
};

// Gestion de la touche "Echap" pour fermer la modale
window.onkeydown = function(event) {
    if (event.key === "Escape") {
        closeSettingsModal();
    }
};