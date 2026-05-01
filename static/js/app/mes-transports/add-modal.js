/**
 * ADD-MODAL.JS
 */

function openModal() {
    const modal = document.getElementById('truckModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal() {
    const modal = document.getElementById('truckModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Utilisation de addEventListener pour NE PAS ÉCRASER les autres scripts
window.addEventListener('click', function(event) {
    const modal = document.getElementById('truckModal');
    if (event.target === modal) {
        closeModal();
    }
});