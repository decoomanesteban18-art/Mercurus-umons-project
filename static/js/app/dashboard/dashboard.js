// ═══════════════════════════════════════════════
//  dashboard.js — Mercurus
//  Panneau gauche  : Mes offres + demandes reçues
//  Panneau droit   : Mes demandes envoyées (archives)
// ═══════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", () => {
    const username = localStorage.getItem("currentUser");

    // Hydrate header
    const displayUsername = document.getElementById("display-username");
    const displayRole     = document.getElementById("display-role");
    if (displayUsername) displayUsername.textContent = username || "Inconnu";
    if (displayRole)     displayRole.textContent = localStorage.getItem("company_name") || "Utilisateur";

    if (!username) return;

    loadOffres(username);
    loadDemandesEnvoyees(username);
});

// ── Utilitaires ────────────────────────────────

function badgeStatut(statut) {
    const map = {
        "Planifiée":          "badge-planifiee",
        "Publiée":            "badge-publiee",
        "Acceptée":           "badge-acceptee",
        "Terminée":           "badge-terminee",
        "Annulée":            "badge-annulee",
        "En attente":         "badge-attente",
        "Refusée":            "badge-refusee",
        "Remboursée":         "badge-remboursee",
        "Contre-proposition": "badge-contre",
    };
    const cls = map[statut] || "badge-default";
    return `<span class="badge ${cls}">${statut || "Inconnu"}</span>`;
}

function formatDate(d) {
    if (!d) return "—";
    const [y, m, j] = d.split("-");
    return `${j}/${m}/${y}`;
}

function iconMarchandise(type) {
    const icons = {
        "Palette":  "fa-pallet",
        "Vrac":     "fa-box-open",
        "Liquide":  "fa-flask",
        "Frigorifique": "fa-snowflake",
    };
    return icons[type] || "fa-box";
}

// ── PANNEAU GAUCHE : Offres + demandes reçues ──

async function loadOffres(username) {
    const panel = document.getElementById("offres-panel");
    const counter = document.getElementById("count-offres");

    let offres = [];
    let demandesRecues = [];

    try {
        const [resOffres, resDemandes] = await Promise.all([
            fetch(`/api/offres/${username}`),
            fetch(`/api/demandes/${username}`)           // demandes en cours sur mes offres
        ]);
        if (resOffres.ok)   offres         = await resOffres.json();
        if (resDemandes.ok) demandesRecues = await resDemandes.json();
    } catch (e) {
        // fallback : on essaie quand même d'afficher les offres
    }

    // Si pas de route /api/demandes/:username, on tente /api/demandes/archivees/:username
    // et on filtre celles où transporteur === username
    if (!demandesRecues.length) {
        try {
            const res = await fetch(`/api/demandes/archivees/${username}`);
            if (res.ok) {
                const data = await res.json();
                const toutes = data.archivees || [];
                demandesRecues = toutes.filter(d => d.transporteur === username);
            }
        } catch (_) {}
    }

    counter.textContent = offres.length;

    if (!offres.length) {
        panel.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-truck-ramp-box"></i>
                Vous n'avez pas encore émis d'offres.
            </div>`;
        return;
    }

    // Regrouper les demandes reçues par id_offre
    const demandesParOffre = {};
    for (const d of demandesRecues) {
        const idOffre = d.id_offre;
        if (!demandesParOffre[idOffre]) demandesParOffre[idOffre] = [];
        demandesParOffre[idOffre].push(d);
    }

    panel.innerHTML = offres.map(offre => buildOffreCard(offre, demandesParOffre[offre.id] || [])).join("");

    // Gestion des toggles
    panel.querySelectorAll(".demandes-toggle").forEach(btn => {
        btn.addEventListener("click", () => {
            const list = btn.nextElementSibling;
            const isOpen = list.classList.contains("visible");
            list.classList.toggle("visible", !isOpen);
            btn.classList.toggle("open", !isOpen);
        });
    });
}

function buildOffreCard(offre, demandes) {
    const etapesStr = offre.etapes?.length
        ? offre.etapes.map(e => `<span class="arrow">›</span>${e}`).join(" ")
        : "";

    const nbDemandes = demandes.length;
    const toggleLabel = nbDemandes === 0
        ? "Aucune demande reçue"
        : `${nbDemandes} demande${nbDemandes > 1 ? "s" : ""} reçue${nbDemandes > 1 ? "s" : ""}`;

    const demandesHTML = nbDemandes === 0 ? "" : demandes.map(d => {
        const don = d.donnees || {};
        const prix = don.prix_fixe != null ? `${don.prix_fixe} €` : "—";
        return `
            <div class="demande-item">
                <div class="demande-item-top">
                    <span class="demande-expediteur">
                        <i class="fa-solid fa-user" style="font-size:0.7rem;opacity:.5"></i>
                        ${d.expediteur || "Inconnu"}
                    </span>
                    <div style="display:flex;gap:6px;align-items:center;">
                        ${badgeStatut(don.statut)}
                        <span class="prix-tag">${prix}</span>
                    </div>
                </div>
                <div class="demande-route">
                    <i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:.7rem"></i> ${don.ville_depart || "—"}
                    <span style="margin:0 4px;opacity:.4">→</span>
                    <i class="fa-solid fa-flag-checkered" style="color:#16a34a;font-size:.7rem"></i> ${don.ville_destination || "—"}
                    &nbsp;·&nbsp; ${formatDate(don.date)} &nbsp;${don.heure_depart || ""} → ${don.heure_arrivee || ""}
                </div>
                <div class="demande-details">
                    <span><i class="fa-solid fa-weight-hanging"></i> ${don.poids_kg ? don.poids_kg.toLocaleString() + " kg" : "—"}</span>
                    <span><i class="fa-solid fa-ruler-combined"></i> ${don.longueur || "—"} × ${don.largeur || "—"} × ${don.hauteur || "—"} m</span>
                    ${don.distance_km ? `<span><i class="fa-solid fa-road"></i> ${don.distance_km} km</span>` : ""}
                </div>
            </div>`;
    }).join("");

    return `
        <div class="offre-card">
            <div class="offre-top">
                <div class="offre-route">
                    <i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:.75rem"></i>
                    ${offre.depart || "—"}
                    ${etapesStr}
                    <span class="arrow">›</span>
                    <i class="fa-solid fa-flag-checkered" style="color:#16a34a;font-size:.75rem"></i>
                    ${offre.destination || "—"}
                </div>
                ${badgeStatut(offre.statut)}
            </div>
            <div class="offre-meta">
                <span><i class="fa-solid fa-calendar-days"></i> ${formatDate(offre.date)}</span>
                <span><i class="fa-solid fa-truck"></i> ${offre.camion_id || offre.snapshot_camion?.immatriculation || "—"}</span>
                <span><i class="fa-solid fa-${iconMarchandise(offre.type_marchandise)}"></i> ${offre.type_marchandise || "—"}</span>
                ${offre.tarif_euro_m3_km != null ? `<span><i class="fa-solid fa-euro-sign"></i> ${offre.tarif_euro_m3_km} €/km</span>` : ""}
                <span style="margin-left:auto;font-size:.7rem;opacity:.6">Offre #${offre.id}</span>
            </div>

            <button class="demandes-toggle ${nbDemandes === 0 ? "text-muted" : ""}">
                <i class="fa-solid fa-chevron-right toggle-icon"></i>
                <i class="fa-solid fa-handshake" style="opacity:.6"></i>
                ${toggleLabel}
            </button>

            <div class="demandes-list">
                ${demandesHTML || `<div style="font-size:.75rem;color:#9ca3af;padding:4px 0">Aucune demande pour l'instant.</div>`}
            </div>
        </div>`;
}

// ── PANNEAU DROIT : Demandes envoyées (archives) ──

async function loadDemandesEnvoyees(username) {
    const panel   = document.getElementById("demandes-panel");
    const counter = document.getElementById("count-demandes");

    let demandes = [];

    try {
        const res = await fetch(`/api/demandes/archivees/${username}`);
        if (res.ok) {
            const data = await res.json();
            // Garder uniquement celles où l'utilisateur est l'expéditeur
            demandes = (data.archivees || []).filter(d => d.expediteur === username);
        }
    } catch (_) {}

    counter.textContent = demandes.length;

    if (!demandes.length) {
        panel.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-paper-plane"></i>
                Vous n'avez envoyé aucune demande pour l'instant.
            </div>`;
        return;
    }

    panel.innerHTML = demandes.map(d => buildDemandeEnvoyeeCard(d)).join("");
}

function buildDemandeEnvoyeeCard(d) {
    const don = d.donnees || {};
    const prix = don.prix_fixe != null ? `${don.prix_fixe} €` : "—";
    const prixCalcule = don.prix_calcule != null ? `(calculé : ${don.prix_calcule} €)` : "";

    return `
        <div class="demande-envoyee-card">
            <div class="demande-envoyee-top">
                <div>
                    <div class="demande-envoyee-route">
                        <i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:.75rem"></i>
                        ${don.ville_depart || "—"}
                        <span style="opacity:.4;margin:0 2px">→</span>
                        <i class="fa-solid fa-flag-checkered" style="color:#16a34a;font-size:.75rem"></i>
                        ${don.ville_destination || "—"}
                    </div>
                    <div style="font-size:.72rem;color:#9ca3af;margin-top:2px">${don.id_demande || ""}</div>
                </div>
                <div style="text-align:right">
                    ${badgeStatut(don.statut)}
                    <div class="prix-tag" style="margin-top:4px">${prix}</div>
                    ${prixCalcule ? `<div style="font-size:.68rem;color:#9ca3af">${prixCalcule}</div>` : ""}
                </div>
            </div>
            <div class="demande-envoyee-meta" style="margin-top:6px">
                <span><i class="fa-solid fa-calendar-days"></i> ${formatDate(don.date)}</span>
                <span><i class="fa-solid fa-clock"></i> ${don.heure_depart || "—"} → ${don.heure_arrivee || "—"}</span>
                <span><i class="fa-solid fa-weight-hanging"></i> ${don.poids_kg ? don.poids_kg.toLocaleString() + " kg" : "—"}</span>
                <span><i class="fa-solid fa-truck"></i> ${d.transporteur || "—"}</span>
                ${don.distance_km ? `<span><i class="fa-solid fa-road"></i> ${don.distance_km} km</span>` : ""}
                <span><i class="fa-solid fa-${iconMarchandise(don.type_marchandise)}"></i> ${don.type_marchandise || "—"}</span>
            </div>
        </div>`;
}