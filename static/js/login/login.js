// --- GESTION DES ONGLETS (Inchangé) ---
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');

const switchTab = (activeTab, inactiveTab, showForm, hideForm) => {
    activeTab.classList.add('active');
    inactiveTab.classList.remove('active');
    showForm.classList.remove('hidden');
    hideForm.classList.add('hidden');
    errorMsg.innerText = "";
};

tabLogin.addEventListener('click', () => switchTab(tabLogin, tabRegister, loginForm, registerForm));
tabRegister.addEventListener('click', () => switchTab(tabRegister, tabLogin, registerForm, loginForm));

// --- CONNEXION ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username').value;
    const passwordInput = document.getElementById('password').value;

    const payload = {
        username: usernameInput,
        password: passwordInput
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok) {
            // --- CORRECTION ICI ---
            // On stocke les drapeaux de connexion attendus par ton script de redirection
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('currentUser', usernameInput); // Le nom saisi (Marc ou Louis)
            
            // On stocke aussi l'objet complet si besoin pour d'autres pages
            localStorage.setItem('user', JSON.stringify({
                username: usernameInput,
                entreprise: result.company_name || result.entreprise || ""
            }));

            window.location.replace("/dashboard"); 
        } else {
            errorMsg.style.color = "#ff4d4d";
            errorMsg.innerText = result.detail || "Identifiants incorrects";
        }
    } catch (err) {
        errorMsg.innerText = "Le serveur Mercurus ne répond pas";
    }
});

// --- INSCRIPTION ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (password !== confirm) {
        errorMsg.style.color = "#ff4d4d";
        errorMsg.innerText = "Les mots de passe ne correspondent pas";
        return;
    }

    const payload = {
        username: document.getElementById('reg-username').value,
        company_name: document.getElementById('reg-company').value,
        address: document.getElementById('reg-address').value,
        email: document.getElementById('reg-email').value,
        phone: document.getElementById('reg-phone').value,
        password: password
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            tabLogin.click(); 
            errorMsg.style.color = "#2ecc71"; 
            errorMsg.innerText = "Compte créé avec succès ! Connectez-vous.";
        } else {
            const result = await response.json();
            errorMsg.style.color = "#ff4d4d";
            errorMsg.innerText = result.detail || "Erreur lors de l'inscription";
        }
    } catch (err) {
        errorMsg.innerText = "Impossible de joindre le serveur";
    }
});