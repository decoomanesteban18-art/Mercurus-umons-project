/**
 * ville-autocomplete.js
 * Composant d'autocomplétion réutilisable pour les champs de villes autorisées.
 * 
 * Usage :
 *   attachVilleAutocomplete(document.getElementById('mon-input'));
 *   attachVilleAutocomplete(inputElement, { onSelect: (ville) => console.log(ville) });
 */

const VILLES_AUTORISEES = [
    "Ath", "Binche", "Braine-le-Comte", "Charleroi", "Châtelet",
    "Comines-Warneton", "Fleurus", "La Louvière", "Lessines",
    "Mons", "Mouscron", "Péruwelz", "Saint-Ghislain", "Soignies", "Tournai"
];

/**
 * Attache l'autocomplétion à un élément <input>.
 * @param {HTMLInputElement} input  - L'input cible
 * @param {Object}           opts  - Options : { onSelect(ville) }
 */
function attachVilleAutocomplete(input, opts = {}) {
    if (!input) return;

    // Éviter les doublons si appelé plusieurs fois sur le même input
    if (input._autocompleteAttached) return;
    input._autocompleteAttached = true;

    // Wrapper positionné
    const wrapper = document.createElement('div');
    wrapper.className = 'ville-ac-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    // Dropdown
    const dropdown = document.createElement('ul');
    dropdown.className = 'ville-ac-dropdown';
    wrapper.appendChild(dropdown);

    let selectedIndex = -1;

    function renderDropdown(items) {
        selectedIndex = -1;
        if (!items.length) { dropdown.style.display = 'none'; return; }

        dropdown.innerHTML = items.map((ville, i) =>
            `<li class="ville-ac-item" data-index="${i}" data-value="${ville}">
                <i class="fa-solid fa-location-dot"></i> ${ville}
            </li>`
        ).join('');

        dropdown.querySelectorAll('.ville-ac-item').forEach(li => {
            li.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Empêche le blur de se déclencher avant le clic
                selectVille(li.dataset.value);
            });
        });

        dropdown.style.display = 'block';
    }

    function selectVille(ville) {
        input.value = ville;
        input.classList.remove('ville-invalid');
        input.classList.add('ville-valid');
        dropdown.style.display = 'none';
        if (typeof opts.onSelect === 'function') opts.onSelect(ville);
    }

    function highlightItem(index) {
        const items = dropdown.querySelectorAll('.ville-ac-item');
        items.forEach((el, i) => el.classList.toggle('active', i === index));
        if (items[index]) items[index].scrollIntoView({ block: 'nearest' });
    }

    // Filtrage au fil de la frappe
    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        input.classList.remove('ville-valid', 'ville-invalid');

        if (!val) { dropdown.style.display = 'none'; return; }

        const matches = VILLES_AUTORISEES.filter(v =>
            v.toLowerCase().startsWith(val) || v.toLowerCase().includes(val)
        );
        renderDropdown(matches);
    });

    // Navigation clavier
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.ville-ac-item');
        if (!items.length || dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
            highlightItem(selectedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            highlightItem(selectedIndex);
        } else if (e.key === 'Enter' || e.key === 'Tab') {
            if (selectedIndex >= 0 && items[selectedIndex]) {
                e.preventDefault();
                selectVille(items[selectedIndex].dataset.value);
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    // Fermeture + validation au blur
    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.style.display = 'none'; }, 150);

        const val = input.value.trim();
        if (!val) { input.classList.remove('ville-valid', 'ville-invalid'); return; }

        if (VILLES_AUTORISEES.includes(val)) {
            input.classList.remove('ville-invalid');
            input.classList.add('ville-valid');
        } else {
            input.classList.remove('ville-valid');
            input.classList.add('ville-invalid');
        }
    });

    // Ouverture du dropdown sur le focus (si l'input a déjà du texte)
    input.addEventListener('focus', () => {
        const val = input.value.trim().toLowerCase();
        if (!val) return;
        const matches = VILLES_AUTORISEES.filter(v =>
            v.toLowerCase().startsWith(val) || v.toLowerCase().includes(val)
        );
        renderDropdown(matches);
    });
}

/**
 * Attache l'autocomplétion à tous les inputs d'un conteneur d'étapes dynamiques.
 * À appeler après avoir ajouté une nouvelle ligne d'étape au DOM.
 * @param {HTMLElement} container - Le div contenant les .etape-libre-row
 */
function attachAutocompleteToEtapesContainer(container) {
    if (!container) return;
    container.querySelectorAll('input[type="text"]').forEach(inp => {
        attachVilleAutocomplete(inp);
    });
}