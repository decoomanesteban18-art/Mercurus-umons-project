/**
 * Configuration des styles de badges selon le statut
 */
const STATUS_STYLES = {
    'Disponible': 'bg-success',
    'Maintenance': 'bg-danger',
    'Indisponible': 'bg-secondary'
};

// Variable pour garder en mémoire quel camion on s'apprête à supprimer
let immatriculationASupprimer = null;

/**
 * Fonction principale : Charge et affiche les camions
 */
async function chargerEtAfficherCamions() {
    const vracList = document.getElementById('bulk-list') || document.querySelector('.list-bulk'); 
    if (!vracList) return;

    const username = localStorage.getItem("currentUser");
    if (!username) {
        window.location.href = "/login";
        return;
    }

    try {
        const response = await fetch(`/api/trucks/${username}`);
        if (!response.ok) throw new Error(`Erreur serveur : ${response.status}`);
        
        const camions = await response.json();
        vracList.innerHTML = ""; 

        if (camions.length === 0) {
            vracList.innerHTML = `<div class="no-data"><p>Aucun véhicule enregistré.</p></div>`;
            return;
        }

        camions.forEach(truck => {
            const badgeClass = STATUS_STYLES[truck.statut] || 'bg-secondary';
            const mass = truck.charge_maximale_kg || 0;

            const truckCard = `
                <div class="cycle-card" data-immat="${truck.immatriculation}">
                    <div class="card-header">
                        <span class="truck-plate">${truck.immatriculation}</span>
                        <span class="badge ${badgeClass}">${truck.statut}</span>
                    </div>

                    <div class="cycle-body" style="padding: 20px; flex-grow: 1;">
                        <h3 class="under-title" style="margin-bottom: 15px;">
                            ${truck.type_vehicule || 'Poids Lourd'}
                        </h3>
                        
                        <div class="timeline"> <div class="etape-item">
                                <div class="data-group">
                                    <span class="data-label">Dimensions (L × l × H)</span>
                                    <span class="data-value">${truck.longueur}m × ${truck.largeur}m × ${truck.hauteur}m</span>
                                </div>
                            </div>
                            <div class="etape-item" style="margin-top: 10px;">
                                <div class="data-group">
                                    <span class="data-label">Charge utile</span>
                                    <span class="data-value">${mass.toLocaleString()} kg</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="cycle-actions">
                        <button class="btn-cycle edit" title="Modifier"
                            onclick="openSettingsModal('${truck.immatriculation}', '${truck.type_vehicule}', ${truck.longueur}, ${truck.largeur}, ${truck.hauteur}, ${mass}, '${truck.statut}')">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-cycle delete" title="Supprimer"
                            onclick="deletetruck('${truck.immatriculation}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>`;
            
            vracList.insertAdjacentHTML('beforeend', truckCard);
        });

    } catch (error) {
        console.error("Erreur lors du chargement :", error);
        vracList.innerHTML = "<p style='color:red; text-align:center;'>Impossible de charger les camions.</p>";
    }
}

/**
 * 1. OUVRE LA MODALE (Remplace l'ancienne fonction supprimerCamion)
 */
function deletetruck(immat) {
    immatriculationASupprimer = immat; // On stocke l'immatriculation
    const modal = document.getElementById('truckErase');
    if (modal) {
        modal.style.display = 'flex'; // On affiche la modale
    }
}

/**
 * 2. FERME LA MODALE
 */
function closeEraseModal() {
    const modal = document.getElementById('truckErase');
    if (modal) {
        modal.style.display = 'none';
    }
    immatriculationASupprimer = null;
}

/**
 * 3. ACTION DE SUPPRESSION RÉELLE (Appelée par le bouton "Supprimer" de la modale)
 */
async function confirmerSuppression() {
    if (!immatriculationASupprimer) return;

    const username = localStorage.getItem("currentUser");
    const btnDelete = document.getElementById('confirmDelete');

    if (btnDelete) btnDelete.disabled = true;

    try {
        const response = await fetch(`/api/trucks/${username}/${immatriculationASupprimer}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            closeEraseModal(); // Fermer la modale
            chargerEtAfficherCamions(); // Rafraîchir la liste
        } else {
            alert("Erreur lors de la suppression.");
            closeEraseModal();
        }
    } catch (error) {
        console.error("Erreur :", error);
        closeEraseModal();
    } finally {
        if (btnDelete) btnDelete.disabled = false;
    }
}

// Gestionnaires de fermeture (clic extérieur et touche Echap)
window.addEventListener('click', (e) => {
    if (e.target.id === 'truckErase') closeEraseModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") closeEraseModal();
});

// Lancement
document.addEventListener('DOMContentLoaded', chargerEtAfficherCamions);