/**
 * MERCURUS - Gestion des Demandes
 */

document.addEventListener("DOMContentLoaded", () => {
    const state = {
        currentUser: localStorage.getItem("currentUser"),
        allDemandes: [],
        allOffres: [],
        archivees: []
    };

    if (!state.currentUser) return;

    const displayUsername = document.getElementById("display-username");
    if (displayUsername) displayUsername.textContent = state.currentUser;

    // -------------------------------------------------------------------------
    // TOAST INTERNE (modale modification)
    // -------------------------------------------------------------------------
    const showModalError = (message) => {
        const toast = document.getElementById('toast-container');
        const toastMsg = document.getElementById('toast-message');
        if (!toast || !toastMsg) return;
        toastMsg.textContent = message;
        toast.style.display = 'flex';
        setTimeout(() => { toast.style.display = 'none'; }, 4000);
    };

    // -------------------------------------------------------------------------
    // TOAST GLOBAL (hors modale)
    // -------------------------------------------------------------------------
    let _toastTimer = null;
    const showToast = (message, type = 'error') => {
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.style.cssText = [
                'position:fixed', 'bottom:28px', 'right:28px', 'z-index:9999',
                'display:flex', 'align-items:center', 'gap:10px',
                'padding:14px 20px', 'border-radius:10px',
                'font-size:0.88rem', 'font-family:inherit', 'font-weight:500',
                'box-shadow:0 4px 20px rgba(0,0,0,0.15)', 'max-width:380px',
                'opacity:0', 'transform:translateY(12px)',
                'transition:opacity 0.25s ease, transform 0.25s ease',
                'pointer-events:none'
            ].join(';');
            document.body.appendChild(toast);
        }
        const styles = {
            error:   { bg:'#fef2f2', border:'#fecaca', color:'#dc2626', icon:'fa-triangle-exclamation' },
            warning: { bg:'#fffbeb', border:'#fde68a', color:'#d97706', icon:'fa-triangle-exclamation' },
            success: { bg:'#f0fdf4', border:'#bbf7d0', color:'#16a34a', icon:'fa-circle-check'         },
            info:    { bg:'#eff6ff', border:'#bfdbfe', color:'#2563eb', icon:'fa-circle-info'          },
        };
        const s = styles[type] || styles.error;
        toast.style.background = s.bg;
        toast.style.border     = `1px solid ${s.border}`;
        toast.style.color      = s.color;
        toast.innerHTML = `<i class="fa-solid ${s.icon}"></i><span>${message}</span>`;
        requestAnimationFrame(() => {
            toast.style.opacity   = '1';
            toast.style.transform = 'translateY(0)';
        });
        if (_toastTimer) clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => {
            toast.style.opacity   = '0';
            toast.style.transform = 'translateY(12px)';
        }, 4500);
    };

    // -------------------------------------------------------------------------
    // CHARGEMENT
    // -------------------------------------------------------------------------
    const chargerDonnees = async () => {
        try {
            const [resDem, resOff, resArch] = await Promise.all([
                fetch("/api/demandes"),
                fetch(`/api/offres/${state.currentUser}`),
                fetch(`/api/demandes/archivees/${state.currentUser}`)
            ]);
            const dataDem  = await resDem.json();
            const dataOff  = await resOff.json();
            const dataArch = await resArch.json();

            state.allDemandes = dataDem.demandes  || [];
            state.allOffres   = dataOff            || [];
            state.archivees   = dataArch.archivees || [];

            filtrerEtAfficher();
        } catch (error) {
            console.error("Erreur chargement:", error);
        }
    };

    // -------------------------------------------------------------------------
    // FILTRAGE & DISPATCH
    // -------------------------------------------------------------------------
    const filtrerEtAfficher = () => {
        const user = state.currentUser.toLowerCase().trim();

        const envoyees = state.allDemandes.filter(d => d.expediteur.toLowerCase().trim() === user);
        const recues   = state.allDemandes.filter(d => d.transporteur.toLowerCase().trim() === user);

        const archEnvoyees = state.archivees.filter(d => d.expediteur.toLowerCase().trim() === user);
        const archRecues   = state.archivees.filter(d =>
            d.transporteur.toLowerCase().trim() === user && d.expediteur.toLowerCase().trim() !== user
        );

        renderListEnvoyees(envoyees, "list-envoyees");
        renderAccordionRecues(recues, "list-recues");
        renderArchivees(archEnvoyees, archRecues, "list-archivees");

        setCount("count-envoyees", envoyees.length);
        setCount("count-recues",   recues.length);
        setCount("count-archivees", state.archivees.length);
    };

    const setCount = (id, n) => {
        const el = document.getElementById(id);
        if (el) el.textContent = n > 0 ? n : '';
    };

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------
    const fmtDate = (iso) => {
        if (!iso) return '--';
        const d = new Date(iso);
        return isNaN(d) ? iso : d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    };

    const statutBadge = (statut) => {
        const cls = (statut || 'En attente')
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/\s/g, "-");
        return `<span class="badge status-${cls}">${statut || 'En attente'}</span>`;
    };

    const dimensionsStr = (info) =>
        `${info.longueur ?? '--'}×${info.largeur ?? '--'}×${info.hauteur ?? '--'} m`;

    const commentBlock = (info) => {
        const c = info.commentaire;
        if (!c || c === "Aucun" || !c.trim()) return '';
        return `<div class="dem-comment"><i class="fa-solid fa-comment-dots"></i> ${c}</div>`;
    };

    const metaRow = (info) => `
        <div class="dem-meta">
            <span><i class="fa-solid fa-calendar-day"></i> ${fmtDate(info.date)}</span>
            <span><i class="fa-solid fa-clock"></i> ${info.heure_depart||'--'} → ${info.heure_arrivee||'--'}</span>
            ${info.distance_km ? `<span><i class="fa-solid fa-route"></i> ${info.distance_km} km</span>` : ''}
        </div>
        <div class="dem-meta">
            <span><i class="fa-solid fa-box"></i> ${info.type_marchandise||'--'}</span>
            <span><i class="fa-solid fa-weight-hanging"></i> ${info.poids_kg} kg</span>
            <span><i class="fa-solid fa-ruler-combined"></i> ${dimensionsStr(info)}</span>
        </div>`;

    // -------------------------------------------------------------------------
    // RENDU : DEMANDES ENVOYÉES
    // -------------------------------------------------------------------------
    const renderListEnvoyees = (demandes, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (demandes.length === 0) {
            container.innerHTML = `<tr><td colspan="4" class="empty-row"><i class="fa-solid fa-inbox" style="margin-right:8px;"></i>Aucune demande en cours.</td></tr>`;
            return;
        }

        container.innerHTML = demandes.map(d => {
            const info   = d.donnees;
            const statut = info.statut || "En attente";
            return `
            <tr class="demande-row">
                <td>
                    <div class="dem-trajet">
                        <strong>${info.ville_depart} ➔ ${info.ville_destination}</strong>
                        ${metaRow(info)}
                        ${commentBlock(info)}
                    </div>
                </td>
                <td class="price-cell"><span class="price">${info.prix_fixe}€</span></td>
                <td>${statutBadge(statut)}</td>
                <td>
                    <div class="actions-group">
                        ${statut === "En attente" || statut === "Contre-proposition" ? `
                            <button onclick="window.preparerModification('${info.id_demande}', 'client')" class="btn-action edit" title="Modifier"><i class="fa-solid fa-pen-to-square"></i></button>
                        ` : ''}
                        ${statut === "Contre-proposition" ? `
                            <button onclick="window.modifierStatut('${info.id_demande}', 'Acceptée')" class="btn-action accept" title="Accepter"><i class="fa-solid fa-check"></i></button>
                        ` : ''}
                        <button onclick="window.supprimerDemande('${info.id_demande}')" class="btn-action delete" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    };

    // -------------------------------------------------------------------------
    // RENDU : ACCORDÉON DES RÉCEPTIONS
    // -------------------------------------------------------------------------
    const renderAccordionRecues = (demandes, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (demandes.length === 0) {
            container.innerHTML = `<tr><td colspan="4" class="empty-row"><i class="fa-solid fa-envelope-open" style="margin-right:8px;"></i>Aucune demande reçue.</td></tr>`;
            return;
        }

        const groups = demandes.reduce((acc, d) => {
            const key = d.id_offre || "Sans-Offre";
            if (!acc[key]) acc[key] = [];
            acc[key].push(d);
            return acc;
        }, {});

        let html = "";
        for (const idOffre in groups) {
            const ds    = groups[idOffre];
            const ref   = ds[0].donnees;
            const count = ds.length;

            html += `
            <tr class="offre-card-header" onclick="window.toggleAccordion('${idOffre}')" style="cursor:pointer;">
                <td colspan="4" style="padding:14px 16px; background:#f1f5f9; border-bottom:2px solid #e2e8f0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span>
                            <i class="fa-solid fa-truck-fast" style="color:#2563eb; margin-right:8px;"></i>
                            <strong>Offre #${idOffre}</strong>
                            <span style="color:#64748b; font-weight:400;"> · ${ref.ville_depart} ➔ ${ref.ville_destination}</span>
                            <span class="count-pill">${count} demande${count > 1 ? 's' : ''}</span>
                        </span>
                        <i class="fa-solid fa-chevron-down arrow-icon" id="arrow-${idOffre}"></i>
                    </div>
                </td>
            </tr>`;

            ds.forEach(d => {
                const info      = d.donnees;
                const idDemande = info.id_demande;
                const statut    = info.statut || "En attente";

                html += `
                <tr class="demande-child-${idOffre} demande-row" style="display:none;">
                    <td style="padding-left:32px; border-left:3px solid #2563eb;">
                        <div class="dem-trajet">
                            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                                <strong>${d.expediteur}</strong>
                                <span style="font-size:0.72rem;color:#64748b;font-style:italic;">#${idDemande}</span>
                            </div>
                            ${metaRow(info)}
                            ${commentBlock(info)}
                        </div>
                    </td>
                    <td class="price-cell"><span class="price">${info.prix_fixe}€</span></td>
                    <td>${statutBadge(statut)}</td>
                    <td>
                        <div class="actions-group">
                            ${statut === "En attente" ? `
                                <button onclick="event.stopPropagation(); window.preparerModification('${idDemande}', 'transporteur')" class="btn-action edit" title="Contre-proposer"><i class="fa-solid fa-pen-to-square"></i></button>
                                <button onclick="event.stopPropagation(); window.modifierStatut('${idDemande}', 'Acceptée')" class="btn-action accept" title="Accepter"><i class="fa-solid fa-check"></i></button>
                                <button onclick="event.stopPropagation(); window.modifierStatut('${idDemande}', 'Refusée')" class="btn-action refuse" title="Refuser"><i class="fa-solid fa-xmark"></i></button>
                            ` : ''}
                            <button onclick="event.stopPropagation(); window.supprimerDemande('${idDemande}')" class="btn-action delete" title="Supprimer"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>`;
            });
        }
        container.innerHTML = html;
    };

    // -------------------------------------------------------------------------
    // RENDU : ARCHIVÉES
    // -------------------------------------------------------------------------
    const renderArchivees = (envoyees, recues, containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return;

        const all = [
            ...envoyees.map(d => ({ ...d, _role: 'client' })),
            ...recues.map(d => ({ ...d, _role: 'transporteur' }))
        ].sort((a, b) =>
            (b.donnees?.date_demande_envoi || '').localeCompare(a.donnees?.date_demande_envoi || '')
        );

        if (all.length === 0) {
            container.innerHTML = `<tr><td colspan="4" class="empty-row"><i class="fa-solid fa-box-archive" style="margin-right:8px;"></i>Aucune transaction archivée.</td></tr>`;
            return;
        }

        container.innerHTML = all.map(d => {
            const info      = d.donnees;
            const statut    = info.statut || '--';
            const role      = d._role === 'client' ? 'Client' : 'Transporteur';
            const roleClass = d._role === 'client' ? 'role-client' : 'role-transporteur';
            const partner   = d._role === 'client' ? d.transporteur : d.expediteur;

            return `
            <tr class="demande-row archived-row">
                <td>
                    <div class="dem-trajet">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <strong>${info.ville_depart} ➔ ${info.ville_destination}</strong>
                            <span class="role-badge ${roleClass}">${role}</span>
                        </div>
                        ${metaRow(info)}
                        <div class="dem-meta">
                            <span><i class="fa-solid fa-user"></i> ${partner}</span>
                            <span style="color:#94a3b8;font-size:0.72rem;">Envoyée le ${fmtDate(info.date_demande_envoi)}</span>
                        </div>
                        ${commentBlock(info)}
                    </div>
                </td>
                <td class="price-cell"><span class="price">${info.prix_fixe}€</span></td>
                <td>${statutBadge(statut)}</td>
                <td style="text-align:center;">
                    <i class="fa-solid fa-lock" style="color:#cbd5e1;" title="Transaction clôturée"></i>
                </td>
            </tr>`;
        }).join('');
    };

    // -------------------------------------------------------------------------
    // LOGIQUE DE MODIFICATION
    // -------------------------------------------------------------------------
    window.preparerModification = (id, role = 'client') => {
        const d = state.allDemandes.find(x => x.donnees.id_demande === id);
        if (!d) return;

        const offre = state.allOffres.find(o => o.id == d.id_offre);
        const modal = document.getElementById('modal-edit-demande');
        const t     = document.getElementById('toast-container');
        if (t) t.style.display = 'none';

        // Réinitialiser les contraintes par défaut
        let maxPoids = Infinity, maxL = Infinity, maxW = Infinity, maxH = Infinity;

        if (offre) {
            // Contraintes réelles depuis capacites_par_etape sur le tronçon de la demande
            const etapes  = offre.capacites_par_etape || [];
            const villes  = etapes.map(e => e.ville);
            const idxDep  = villes.indexOf(d.donnees.ville_depart);
            const idxArr  = villes.indexOf(d.donnees.ville_destination);
            const troncon = (idxDep >= 0 && idxArr > idxDep)
                ? etapes.slice(idxDep, idxArr + 1)
                : etapes;

            const minVal = (key) => troncon.length
                ? Math.min(...troncon.map(e => e[key] ?? Infinity))
                : Infinity;

            maxPoids = minVal('charge_disponible');
            maxL     = minVal('longueur');
            maxW     = minVal('largeur');
            maxH     = minVal('hauteur');

            modal.dataset.maxPoids = maxPoids !== Infinity ? maxPoids : 0;
            modal.dataset.maxL     = maxL     !== Infinity ? maxL     : 0;
            modal.dataset.maxW     = maxW     !== Infinity ? maxW     : 0;
            modal.dataset.maxH     = maxH     !== Infinity ? maxH     : 0;

            // Appliquer les max sur les inputs
            const applyMax = (inputId, val) => {
                const el = document.getElementById(inputId);
                if (!el) return;
                if (val !== Infinity) {
                    el.max = val;
                } else {
                    el.removeAttribute('max');
                }
            };
            applyMax('edit-poids',    maxPoids);
            applyMax('edit-longueur', maxL);
            applyMax('edit-largeur',  maxW);
            applyMax('edit-hauteur',  maxH);

            // Afficher les contraintes dans les labels
            const setMax = (elId, val, unit) => {
                const el = document.getElementById(elId);
                if (el) el.textContent = (val !== Infinity) ? `(max ${val} ${unit})` : '';
            };
            setMax('max-poids', maxPoids, 'kg');
            setMax('max-long',  maxL,     'm');
            setMax('max-larg',  maxW,     'm');
            setMax('max-haut',  maxH,     'm');

            // Bloc de contraintes visuelles
            const bloc = document.getElementById('bloc-contraintes');
            if (bloc) {
                const fmt = (val, unit) => (val !== Infinity)
                    ? `<strong>${val}</strong> ${unit}`
                    : '<span style="color:#94a3b8;">N/C</span>';

                const depVille = d.donnees.ville_depart;
                const arrVille = d.donnees.ville_destination;

                bloc.innerHTML = `
                    <div class="contrainte-header">
                        <i class="fa-solid fa-circle-info"></i>
                        Capacités disponibles sur le tronçon
                        <span class="contrainte-troncon">${depVille} → ${arrVille}</span>
                    </div>
                    <div class="contrainte-grid">
                        <div class="contrainte-item">
                            <i class="fa-solid fa-weight-hanging"></i>
                            <span class="contrainte-label">Poids max</span>
                            <span class="contrainte-val">${fmt(maxPoids, 'kg')}</span>
                        </div>
                        <div class="contrainte-item">
                            <i class="fa-solid fa-ruler-horizontal"></i>
                            <span class="contrainte-label">Longueur max</span>
                            <span class="contrainte-val">${fmt(maxL, 'm')}</span>
                        </div>
                        <div class="contrainte-item">
                            <i class="fa-solid fa-left-right"></i>
                            <span class="contrainte-label">Largeur max</span>
                            <span class="contrainte-val">${fmt(maxW, 'm')}</span>
                        </div>
                        <div class="contrainte-item">
                            <i class="fa-solid fa-up-down"></i>
                            <span class="contrainte-label">Hauteur max</span>
                            <span class="contrainte-val">${fmt(maxH, 'm')}</span>
                        </div>
                    </div>`;
                bloc.style.display = 'block';
            }
        } else {
            // Pas d'offre trouvée : cacher le bloc contraintes
            const bloc = document.getElementById('bloc-contraintes');
            if (bloc) bloc.style.display = 'none';
            ['edit-poids','edit-longueur','edit-largeur','edit-hauteur'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.removeAttribute('max');
            });
            ['max-poids','max-long','max-larg','max-haut'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '';
            });
        }

        const editIdInput = document.getElementById('edit-id');
        editIdInput.value        = d.donnees.id_demande || "";
        editIdInput.dataset.role = role;
        window.ouvrirModaleModification(d.donnees);
    };

    window.ouvrirModaleModification = (info) => {
        document.getElementById('edit-poids').value         = info.poids_kg     || "";
        document.getElementById('edit-prix').value          = info.prix_fixe    || "";
        document.getElementById('edit-heure-depart').value  = info.heure_depart || "";
        document.getElementById('edit-heure-arrivee').value = info.heure_arrivee|| "";
        document.getElementById('edit-longueur').value      = info.longueur     || "";
        document.getElementById('edit-largeur').value       = info.largeur      || "";
        document.getElementById('edit-hauteur').value       = info.hauteur      || "";
        const editComm = document.getElementById('edit-commentaire');
        if (editComm) editComm.value = info.commentaire || "";
        window.toggleModal('modal-edit-demande', true);
    };

    // Validation visuelle en temps réel sur les inputs contraints
    const _bindContrainteInput = (inputId, getMax) => {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.addEventListener('input', () => {
            const val = parseFloat(el.value) || 0;
            const max = getMax();
            if (max && max !== Infinity && val > max) {
                el.style.borderColor = '#ef4444';
                el.style.background  = '#fef2f2';
            } else {
                el.style.borderColor = '';
                el.style.background  = '';
            }
        });
    };

    const _getModalMax = (key) => {
        const modal = document.getElementById('modal-edit-demande');
        const v = parseFloat(modal?.dataset[key]);
        return isNaN(v) ? Infinity : v;
    };

    _bindContrainteInput('edit-poids',    () => _getModalMax('maxPoids'));
    _bindContrainteInput('edit-longueur', () => _getModalMax('maxL'));
    _bindContrainteInput('edit-largeur',  () => _getModalMax('maxW'));
    _bindContrainteInput('edit-hauteur',  () => _getModalMax('maxH'));

    window.validerModification = async () => {
        const modal = document.getElementById('modal-edit-demande');
        const id    = document.getElementById('edit-id').value;
        const role  = document.getElementById('edit-id').dataset.role;

        const nvPoids = parseFloat(document.getElementById('edit-poids').value)    || 0;
        const nvL     = parseFloat(document.getElementById('edit-longueur').value) || 0;
        const nvW     = parseFloat(document.getElementById('edit-largeur').value)  || 0;
        const nvH     = parseFloat(document.getElementById('edit-hauteur').value)  || 0;

        const maxP = _getModalMax('maxPoids');
        const maxL = _getModalMax('maxL');
        const maxW = _getModalMax('maxW');
        const maxH = _getModalMax('maxH');

        // Highlight les champs en erreur
        const highlight = (inputId, isOver) => {
            const el = document.getElementById(inputId);
            if (!el) return;
            el.style.borderColor = isOver ? '#ef4444' : '';
            el.style.background  = isOver ? '#fef2f2' : '';
        };
        const overPoids = nvPoids > maxP;
        const overL     = nvL     > maxL;
        const overW     = nvW     > maxW;
        const overH     = nvH     > maxH;
        highlight('edit-poids',    overPoids);
        highlight('edit-longueur', overL);
        highlight('edit-largeur',  overW);
        highlight('edit-hauteur',  overH);

        if (overPoids || overL || overW || overH) {
            showModalError("⚠️ Modification impossible : les valeurs dépassent la capacité disponible.");
            return;
        }

        const payload = {
            poids_kg:      nvPoids,
            prix_fixe:     parseFloat(document.getElementById('edit-prix').value) || 0,
            heure_depart:  document.getElementById('edit-heure-depart').value,
            heure_arrivee: document.getElementById('edit-heure-arrivee').value,
            longueur: nvL, largeur: nvW, hauteur: nvH,
            statut: (role === 'transporteur') ? "Contre-proposition" : "En attente"
        };

        try {
            const res = await fetch(`/api/demandes/modifier/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                window.toggleModal('modal-edit-demande', false);
                chargerDonnees();
            } else {
                const err = await res.json();
                showModalError("Erreur : " + err.detail);
            }
        } catch {
            showModalError("Erreur de connexion réseau.");
        }
    };

    window.modifierStatut = async (id, nouveau) => {
        const res = await fetch("/api/demandes/statut", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_demande: id, statut: nouveau })
        });
        if (res.ok) {
            chargerDonnees();
        } else if (res.status === 409) {
            const err = await res.json();
            showToast("Acceptation impossible : " + err.detail, 'warning');
        } else {
            showToast("Une erreur est survenue.", 'error');
        }
    };

    window.supprimerDemande = (id) => {
        const targetInput = document.getElementById('delete-id-target');
        if (targetInput) targetInput.value = id;
        window.toggleModal('modal-delete-confirm', true);
    };

    window.confirmerSuppression = async () => {
        const id  = document.getElementById('delete-id-target').value;
        const res = await fetch(`/api/demandes/supprimer/${id}`, { method: "DELETE" });
        if (res.ok) {
            window.toggleModal('modal-delete-confirm', false);
            chargerDonnees();
        }
    };

    window.toggleAccordion = (idOffre) => {
        const rows  = document.querySelectorAll(`.demande-child-${idOffre}`);
        const arrow = document.getElementById(`arrow-${idOffre}`);
        rows.forEach(r => { r.style.display = (r.style.display === "none") ? "table-row" : "none"; });
        if (arrow) arrow.style.transform = (arrow.style.transform === "rotate(180deg)") ? "rotate(0deg)" : "rotate(180deg)";
    };

    window.toggleModal = (id, show) => {
        const m = document.getElementById(id);
        if (m) m.style.display = show ? 'flex' : 'none';
    };

    window.switchTab = (tabName) => {
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const panel = document.getElementById(`panel-${tabName}`);
        const btn   = document.getElementById(`tab-${tabName}`);
        if (panel) panel.classList.add('active');
        if (btn)   btn.classList.add('active');
    };

    chargerDonnees();
});