document.addEventListener("DOMContentLoaded", function() {
    const truckForm = document.getElementById('truckForm');
    const errorDisplay = document.getElementById('errorMessage');

    /**
     * Gestion de la soumission
     */
    if (truckForm) {
        truckForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = localStorage.getItem("currentUser");
            if (!username) {
                alert("Session expirée. Veuillez vous reconnecter.");
                window.location.href = "/login";
                return;
            }

            const immatValue = document.getElementById('immatriculation').value.trim().toUpperCase();
            const chargeValue = parseFloat(document.getElementById('charge_maximale_kg').value);
            const longueurValue = parseFloat(document.getElementById('longueur').value);
            const largeurValue = parseFloat(document.getElementById('largeur').value);
            const hauteurValue = parseFloat(document.getElementById('hauteur').value);

            const nouveauCamion = {
                id: Date.now(),
                immatriculation: immatValue,
                charge_maximale_kg: chargeValue,
                longueur: longueurValue,
                largeur: largeurValue,
                hauteur: hauteurValue,
                statut: "Disponible"
            };

            try {
                const response = await fetch(`/api/trucks/${username}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(nouveauCamion)
                });

                if (response.ok) {
                    if (errorDisplay) errorDisplay.style.display = 'none';
                    truckForm.reset();
                    closeModalHandler();
                    if (typeof chargerEtAfficherCamions === 'function') chargerEtAfficherCamions();
                } else {
                    const data = await response.json();
                    if (errorDisplay) {
                        errorDisplay.textContent = data.detail || "Erreur lors de l'enregistrement.";
                        errorDisplay.style.display = 'block';
                    }
                }
            } catch (error) {
                console.error("Erreur réseau :", error);
                alert("Impossible de contacter le serveur.");
            }
        });
    }

    function closeModalHandler() {
        if (typeof closeModal === 'function') {
            closeModal();
        } else {
            const modal = document.getElementById('truckModal');
            if (modal) modal.style.display = 'none';
        }
        truckForm.reset();
    }
});