(function () {
    // 1. Récupération des données
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    const user = localStorage.getItem("currentUser");
    const path = window.location.pathname;

    // 2. Gestion des accès (Redirection)
    const isPublicPage = path === "/login" || path === "/" || path.includes("login");

    if (!isPublicPage) {
        if (!isLoggedIn || !user) {
            window.location.replace("/login");
            return; // On arrête l'exécution ici
        }
    } else {
        if (isLoggedIn === "true" && user) {
            window.location.replace("/dashboard");
            return;
        }
    }

    // 3. Affichage du nom (Une fois que le HTML est prêt)
    // On utilise "DOMContentLoaded" pour être sûr que le <span> existe
    document.addEventListener("DOMContentLoaded", () => {
        const displayEl = document.getElementById("display-username");
        
        if (displayEl) {
            if (user && user !== "undefined" && user !== "null") {
                // Met la première lettre en majuscule pour faire propre
                displayEl.textContent = user.charAt(0).toUpperCase() + user.slice(1);
            } else {
                displayEl.textContent = "Utilisateur"; 
            }
        }
    });
})();