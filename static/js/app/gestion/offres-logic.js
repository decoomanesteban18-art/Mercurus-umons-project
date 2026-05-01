/**
 * GESTION DES OFFRES MERCURUS - AFFICHAGE ET RENDU
 */

// Configuration des statuts
const STATUTS_CONFIG = {
    'Publiée':  { class: 'status-publiee',    label: 'Publiée'  },
    'Planifiée':{ class: 'status-plannifiee', label: 'À venir'  },
    'Brouillon':{ class: 'status-brouillon',  label: 'Brouillon'},
    'Acceptée': { class: 'status-acceptee',   label: 'Acceptée' }
};

document.addEventListener('DOMContentLoaded', () => {
    chargerOffres();
});

/**
 * CHARGEMENT DES DONNÉES PAR UTILISATEUR
 */
async function chargerOffres() {
    const container = document.getElementById('offres-list');
    if (!container) return;

    const username = localStorage.getItem("currentUser");
    if (!username) {
        container.innerHTML = '<p class="error-msg">Veuillez vous connecter pour voir vos offres.</p>';
        return;
    }

    try {
        const response = await fetch(`/api/offres/${username}`);
        if (!response.ok) throw new Error("Erreur lors de la récupération");

        const offres = await response.json();

        if (!offres || offres.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p class="empty-msg">Aucune offre enregistrée pour <strong>${username}</strong>.</p>
                </div>`;
            return;
        }

        container.innerHTML = offres.map(offre => renderOffreCard(offre)).join('');

    } catch (error) {
        console.error("Erreur chargement :", error);
        container.innerHTML = '<p class="error-msg">Erreur de connexion avec le serveur.</p>';
    }
}

/**
 * COMPOSANT DE RENDU
 * Nouveau modèle : offre.date, offre.type_transport, offre.depart, offre.destination,
 * offre.capacites_par_etape[0] = arrêt départ, offre.capacites_par_etape[last] = arrêt destination
 */
function renderOffreCard(offre) {
    const config = STATUTS_CONFIG[offre.statut] || STATUTS_CONFIG['Brouillon'];

    // Verrouillage si l'offre est publiée OU acceptée (plus de modification possible)
    const isLocked    = offre.statut === 'Publiée' || offre.statut === 'Acceptée';
    const actionIcon  = isLocked ? 'fa-eye' : 'fa-pen-to-square';
    const actionTitle = isLocked ? 'Voir les détails' : 'Modifier';

    // Récupération des heures depuis capacites_par_etape
    const etapes    = offre.capacites_par_etape || [];
    const premier   = etapes[0]              || {};
    const dernier   = etapes[etapes.length - 1] || {};

    const heureDep = premier.heure || '--:--';
    const heureArr = dernier.heure  || '--:--';

    // Charge du premier arrêt (départ)
    const chargeDispo = premier.charge_disponible ?? offre.charge_disponible ?? '--';

    // Ville départ / destination
    const villeDep = offre.depart      || premier.ville || '--';
    const villeArr = offre.destination || dernier.ville  || '--';

    return `
        <div class="offre-item-card" data-id="${offre.id}">
            <div class="status-badge ${config.class}">${config.label}</div>

            <div class="card-body">
                <div class="truck-section">
                    <div class="truck-icon"><i class="fa-solid fa-truck-fast"></i></div>
                    <div class="truck-info">
                        <span class="label">Véhicule • <strong>${offre.type_marchandise || 'Palette'}</strong></span>
                        <strong class="value">${offre.camion_id}</strong>
                    </div>
                </div>

                <div class="route-section">
                    <div class="route-item">
                        <span class="label">Départ</span>
                        <strong class="value">${heureDep}</strong>
                        <small class="date-sub">${villeDep}</small>
                        <small class="date-sub">${formatDate(offre.date)}</small>
                    </div>

                    <div class="route-visual">
                        <div class="dot"></div>
                        <div class="line"></div>
                        <i class="fa-solid fa-arrow-right-long"></i>
                        <div class="line"></div>
                        <div class="dot"></div>
                    </div>

                    <div class="route-item">
                        <span class="label">Arrivée</span>
                        <strong class="value">${heureArr}</strong>
                        <small class="date-sub">${villeArr}</small>
                        <small class="date-sub">${formatDate(offre.date)}</small>
                    </div>
                </div>
            </div>

            <div class="card-footer">
                <div class="capacity-pill">
                    <i class="fa-solid fa-weight-hanging"></i>
                    <span><strong>${chargeDispo}</strong> kg dispos</span>
                </div>

                <div class="action-group">
                    <button class="btn-action ${isLocked ? 'btn-view' : 'btn-edit'}"
                            onclick="openSettingsModal(${offre.id})"
                            title="${actionTitle}">
                        <i class="fa-solid ${actionIcon}"></i>
                    </button>
                    <div class="btn-divider"></div>
                    <button class="btn-action btn-delete"
                            onclick="askDeleteOffre(${offre.id})"
                            title="Supprimer">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * UTILITAIRES
 */
function formatDate(dateStr) {
    if (!dateStr) return "--/--/----";
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj)) return dateStr;
    return dateObj.toLocaleDateString('fr-FR', {
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    });
}