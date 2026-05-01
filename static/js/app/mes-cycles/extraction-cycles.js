/**
 * extraction-cycles.js
 * Gère la récupération et l'affichage dynamique des cartes de cycles.
 */

// On ne définit plus d'URL fixe avec le port, on utilise des chemins relatifs ou dynamiques
let cycleASupprimer = null;

/**
 * Récupère le nom de l'utilisateur connecté
 */
function getCurrentUser() {
    return localStorage.getItem("currentUser");
}

/**
 * Charge les données depuis l'API et génère les cartes HTML
 */
async function chargerEtAfficherCycles() {
    const cycleList = document.getElementById('cycle-list'); 
    if (!cycleList) return;

    const username = getCurrentUser();
    if (!username) {
        console.error("Aucun utilisateur connecté.");
        return;
    }

    try {
        // Chemin mis à jour pour inclure l'utilisateur
        const response = await fetch(`/api/cycles/${username}`);
        if (!response.ok) throw new Error("Erreur serveur");
        
        const cycles = await response.json();
        let htmlBuffer = "";

        if (!cycles || cycles.length === 0) {
            cycleList.innerHTML = `<p style="text-align:center; padding:40px; color:#64748b;">Aucun cycle enregistré pour ${username}.</p>`;
            return;
        }

        cycles.forEach(cycle => {
            const id = cycle.id;
            const nom = cycle.nom_cycle || "Sans nom";
            const dep = cycle.depart || "N/C";
            const dest = cycle.destination || "N/C";
            const etapesCount = cycle.etapes ? cycle.etapes.length : 0;
            
            const nomSafe = nom.replace(/'/g, "\\'");

            htmlBuffer += `
                <div class="cycle-item-card">
                    <div class="cycle-info">
                        <div class="cycle-title-group">
                            <i class="fa-solid fa-route" style="color: #3b82f6;"></i>
                            <strong>${nom}</strong>
                        </div>
                        <span class="cycle-id">RÉSEAU #CY-${id}</span>
                    </div>

                    <div class="cycle-route-visual">
                        <div class="route-node origin">
                            <i class="fa-solid fa-location-dot"></i>
                            <span class="node-label">${dep}</span>
                        </div>
                        <div class="route-connector">
                            <div class="step-pill">${etapesCount} étape${etapesCount > 1 ? 's' : ''}</div>
                        </div>
                        <div class="route-node destination">
                            <i class="fa-solid fa-location-arrow"></i>
                            <span class="node-label">${dest}</span>
                        </div>
                    </div>

                    <div class="cycle-actions">
                        <button class="btn-cycle btn-view" title="Voir" onclick="ouvrirDetailsCycle(${id})">
                            <i class="fa-solid fa-map-marked-alt"></i>
                        </button>
                        <button class="btn-cycle btn-settings" title="Modifier" onclick="ouvrirModifierCycle(${id})">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-cycle btn-delete" title="Supprimer" onclick="preparerSuppressionCycle(${id}, '${nomSafe}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        cycleList.innerHTML = htmlBuffer;
    } catch (error) {
        console.error("Erreur lors du chargement des cycles:", error);
        cycleList.innerHTML = `<div style="color:red; padding:20px; text-align:center;">Erreur de connexion au serveur.</div>`;
    }
}

/**
 * Affiche les détails (Timeline) d'un cycle
 */
async function ouvrirDetailsCycle(id) {
    const username = getCurrentUser();
    try {
        // On récupère la liste complète et on cherche l'ID (plus simple que de créer une route Python par ID)
        const response = await fetch(`/api/cycles/${username}`);
        if (!response.ok) throw new Error("Cycle introuvable");
        const cycles = await response.json();
        const cycle = cycles.find(c => c.id === id);

        if (!cycle) throw new Error("Cycle non trouvé dans la liste");

        const nomElem = document.getElementById('det-nom-cycle');
        const container = document.getElementById('det-etapes-container');
        
        if (nomElem) nomElem.innerText = cycle.nom_cycle;
        if (container) {
            container.innerHTML = "";
            const fullRoute = [cycle.depart, ...(cycle.etapes || []), cycle.destination];
            fullRoute.forEach((ville, index) => {
                const item = document.createElement('div');
                item.className = "timeline-item";
                let label = "Etape";
                if (index === 0) label = "Départ";
                else if (index === fullRoute.length - 1) label = "Arrivée";
                
                item.innerHTML = `<strong>${label} :</strong> ${ville}`;
                container.appendChild(item);
            });
        }

        if (typeof toggleModal === "function") {
            toggleModal('modal-details-cycle', true);
        }
    } catch (err) {
        console.error(err);
        alert("Impossible de charger les détails.");
    }
}

/**
 * Prépare la suppression
 */
function preparerSuppressionCycle(id, nom) {
    cycleASupprimer = id;
    const nameElem = document.getElementById('suppr-nom-cycle');
    if (nameElem) nameElem.innerText = nom;
    
    if (typeof toggleModal === "function") {
        toggleModal('modal-suppression-cycle', true);
    }
}

/**
 * Confirme la suppression via l'API (Il faudra ajouter la route DELETE dans main.py pour les cycles)
 */
async function confirmerSuppression() {
    if (!cycleASupprimer) return;
    const username = getCurrentUser();

    try {
        // Note : Vérifie que tu as une route DELETE /api/cycles/{username}/{id} dans ton Python
        const response = await fetch(`/api/cycles/${username}/${cycleASupprimer}`, { method: 'DELETE' });
        if (response.ok) {
            if (typeof toggleModal === "function") {
                toggleModal('modal-suppression-cycle', false);
            }
            cycleASupprimer = null;
            chargerEtAfficherCycles(); 
        } else {
            alert("Erreur lors de la suppression.");
        }
    } catch (err) {
        console.error("Erreur suppression:", err);
        alert("Erreur de connexion.");
    }
}

document.addEventListener('DOMContentLoaded', chargerEtAfficherCycles);