/**
 * GESTION DE LA SUPPRESSION (MODALE)
 */

// Variable globale pour stocker l'immatriculation en attente de suppression
// Note : On l'attache à window pour être sûr qu'elle est accessible partout
window.immatriculationASupprimer = null;

/**
 * 1. Ouvre la modale de confirmation
 * Appelée par le bouton .btn-delete de la carte camion
 */
function deletetruck(immatriculation) {
    window.immatriculationASupprimer = immatriculation;
    const modal = document.getElementById('truckErase');
    if (modal) {
        modal.style.display = 'flex';
    }
}

/**
 * 2. Exécute la suppression réelle via l'API
 * Appelée par le bouton id="confirmDelete" dans le HTML de la modale
 */
async function confirmerSuppression() {
    const immat = window.immatriculationASupprimer;
    if (!immat) return;

    const username = localStorage.getItem("currentUser");
    const btnConfirm = document.getElementById('confirmDelete');

    // Feedback visuel sur le bouton
    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>...';
    }

    try {
        const response = await fetch(`/api/trucks/${username}/${immat}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            // Fermer la modale
            closeEraseModal();
            // Rafraîchir la liste immédiatement
            await chargerEtAfficherCamions();
        } else {
            const errorData = await response.json();
            console.error("Erreur suppression:", errorData.detail);
            closeEraseModal();
        }
    } catch (error) {
        console.error("Erreur réseau suppression:", error);
        closeEraseModal();
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerHTML = 'Supprimer';
        }
    }
}

/**
 * 3. Fermeture de la modale de suppression
 */
function closeEraseModal() {
    const modal = document.getElementById('truckErase');
    if (modal) {
        modal.style.display = 'none';
    }
    window.immatriculationASupprimer = null;
}

// Gestion des clics extérieurs pour fermer la modale
window.addEventListener('click', function(event) {
    const modalErase = document.getElementById('truckErase');
    if (event.target === modalErase) {
        closeEraseModal();
    }
});