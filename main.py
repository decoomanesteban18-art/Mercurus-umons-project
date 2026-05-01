import time
import math
from fastapi import FastAPI, Body, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
import json
import os

# ===========================================================================
# MODULE GPS
# ===========================================================================

_R = 6371

VILLES_GPS = {
    "Mons":             (50.4542, 3.9523),
    "Charleroi":        (50.4108, 4.4446),
    "Ath":              (50.6333, 3.6167),
    "Tournai":          (50.6033, 3.3817),
    "Soignies":         (50.5833, 3.8167),
    "La Louviere":      (50.4833, 4.1833),
    "Binche":           (50.4167, 4.0667),
    "Saint-Ghislain":   (50.4167, 3.8167),
    "Peruwelz":         (50.3667, 3.4667),
    "Braine-le-Comte":  (50.5833, 4.1500),
    "Mouscron":         (50.7500, 3.2000),
    "Comines-Warneton": (50.7500, 3.1000),
    "Lessines":         (50.7500, 3.5000),
    "Chatelet":         (50.4167, 4.4500),
    "Fleurus":          (50.4167, 4.3500),
    "Blaton":           (50.4833, 3.6833),
    "Beloeil":          (50.5500, 3.7333),
    "Frameries":        (50.4000, 3.9000),
    "Quaregnon":        (50.4333, 3.8667),
    "Boussu":           (50.4333, 3.8000),
}

# Alias avec accents vers clefs sans accents
VILLES_ALIAS = {
    "La Louviere": "La Louviere",
    "La Louvière": "La Louviere",
    "Péruwelz": "Peruwelz",
    "Châtelet": "Chatelet",
}

def _normaliser_ville(v):
    return VILLES_ALIAS.get(v, v)

def distance_gps(ville1, ville2):
    v1 = _normaliser_ville(ville1)
    v2 = _normaliser_ville(ville2)
    if v1 not in VILLES_GPS or v2 not in VILLES_GPS or v1 == v2:
        return 0.0
    lat1, lon1 = (math.radians(x) for x in VILLES_GPS[v1])
    lat2, lon2 = (math.radians(x) for x in VILLES_GPS[v2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return round(_R * 2 * math.asin(math.sqrt(a)), 2)

def distance_troncon(villes_liste):
    total = 0.0
    for i in range(len(villes_liste) - 1):
        total += distance_gps(villes_liste[i], villes_liste[i+1])
    return round(total, 2)

# ===========================================================================

app = FastAPI()

@app.get('/favicon.ico', include_in_schema=False)
async def favicon():
    # Réponse vide 204 pour éviter de chercher un fichier inexistant
    return Response(status_code=204)

# --- CONFIGURATION DES DOSSIERS ---
if not os.path.exists("static"):
    os.makedirs("static")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# --- CONFIGURATION CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURATION DU FICHIER UNIQUE (BASE DE DONNÉES) ---
DATA_FILE = "data.json"

def charger_db():
    if not os.path.exists(DATA_FILE):
        return {"users": {}, "market": [], "demandes": []}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"users": {}, "market": [], "demandes": []}

def sauvegarder_db(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

# --- ROUTES DES PAGES HTML ---
# Route pour l'accueil
@app.get("/", response_class=HTMLResponse)
@app.get("/login", response_class=HTMLResponse)
async def read_login(request: Request):
    # La nouvelle syntaxe : request en premier, puis le nom du fichier, puis le contexte
    return templates.TemplateResponse(request, "login.html", {"request": request})

# Route pour les autres pages
@app.get("/{page}", response_class=HTMLResponse)
async def read_any_page(request: Request, page: str):
    try:
        return templates.TemplateResponse(request, f"{page}.html", {"request": request})
    except:
        return templates.TemplateResponse(request, "login.html", {"request": request})
# --- ROUTES API : AUTHENTIFICATION ---

@app.post("/api/login")
async def api_login(credentials: dict = Body(...)):
    db = charger_db()
    username = credentials.get("username")
    password = credentials.get("password")
    
    user = db["users"].get(username)
    
    if user and user["password"] == password:
        return {
            "status": "success", 
            "username": username, 
            "entreprise": user.get("company_name", "") 
        }
    raise HTTPException(status_code=401, detail="Identifiants incorrects")

@app.post("/api/register")
async def api_register(user_data: dict = Body(...)):
    db = charger_db()
    username = user_data.get("username")
    
    if username in db["users"]:
        raise HTTPException(status_code=400, detail="Ce nom d'utilisateur est déjà pris.")

    db["users"][username] = {
        "password": user_data.get("password"),
        "company_name": user_data.get("company_name", ""),
        "address": user_data.get("address", ""),
        "email": user_data.get("email", ""),
        "phone": user_data.get("phone", ""),
        "camions": [],
        "cycles": [],
        "mes_offres": []
    }
    
    sauvegarder_db(db)
    return {"status": "success"}

# --- ROUTES API : CAMIONS ---
@app.put("/api/trucks/{username}/{immat}")
async def update_truck(username: str, immat: str, updated_truck: dict = Body(...)):
    db = charger_db()
    
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    camions = db["users"][username]["camions"]
    
    for i, c in enumerate(camions):
        if c["immatriculation"] == immat:
            camions[i] = updated_truck
            sauvegarder_db(db)
            return {"status": "success", "message": "Camion mis à jour"}
            
    raise HTTPException(status_code=404, detail="Camion non trouvé dans la liste")

@app.get("/api/trucks/{username}")
async def get_trucks(username: str):
    db = charger_db()
    return db["users"].get(username, {}).get("camions", [])

@app.post("/api/trucks/{username}")
async def add_truck(username: str, truck: dict = Body(...)):
    db = charger_db()
    
    if username not in db["users"]: 
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    if "camions" not in db["users"][username]:
        db["users"][username]["camions"] = []
        
    camions = db["users"][username]["camions"]
    
    immat_new = truck.get("immatriculation", "").strip().upper()
    if not immat_new:
        raise HTTPException(status_code=400, detail="L'immatriculation est requise.")

    if any(c.get("immatriculation", "").strip().upper() == immat_new for c in camions):
        raise HTTPException(
            status_code=400, 
            detail=f"Le camion avec l'immatriculation {immat_new} existe déjà."
        )

    truck["id"] = int(time.time() * 1000)
    truck["immatriculation"] = immat_new
    
    camions.append(truck)
    sauvegarder_db(db)
    
    return {"status": "success", "message": "Camion ajouté", "id": truck["id"]}

@app.delete("/api/trucks/{username}/{immat}")
async def delete_truck(username: str, immat: str):
    db = charger_db()
    if username in db["users"]:
        db["users"][username]["camions"] = [c for c in db["users"][username]["camions"] if c["immatriculation"] != immat]
        sauvegarder_db(db)
        return {"status": "success"}
    raise HTTPException(status_code=404)

# --- ROUTES API : CYCLES ---
@app.get("/api/cycles/{username}")
async def get_cycles(username: str):
    db = charger_db()
    if username not in db["users"]:
        return []
    return db["users"][username].get("cycles", [])

@app.post("/api/cycles/{username}")
async def add_cycle(username: str, cycle: dict = Body(...)):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    cycles = db["users"][username].get("cycles", [])
    
    new_id = max([c.get("id", 0) for c in cycles], default=0) + 1
    cycle["id"] = new_id
    
    cycles.append(cycle)
    db["users"][username]["cycles"] = cycles
    sauvegarder_db(db)
    
    return {"status": "success", "id": new_id}

@app.put("/api/cycles/{username}/{cycle_id}")
async def update_cycle(username: str, cycle_id: int, updated_data: dict = Body(...)):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    cycles = db["users"][username].get("cycles", [])
    
    for i, c in enumerate(cycles):
        if c.get("id") == cycle_id:
            updated_data["id"] = cycle_id
            cycles[i] = updated_data
            sauvegarder_db(db)
            return {"status": "success", "message": "Cycle mis à jour"}
            
    raise HTTPException(status_code=404, detail="Cycle introuvable")

@app.delete("/api/cycles/{username}/{cycle_id}")
async def delete_cycle(username: str, cycle_id: int):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    initial_count = len(db["users"][username].get("cycles", []))
    
    db["users"][username]["cycles"] = [
        c for c in db["users"][username].get("cycles", []) 
        if c.get("id") != cycle_id
    ]
    
    if len(db["users"][username]["cycles"]) == initial_count:
        raise HTTPException(status_code=404, detail="Cycle non trouvé")
        
    sauvegarder_db(db)
    return {"status": "success", "message": "Cycle supprimé"}

# --- ROUTES API : OFFRES (MES TRANSPORTS) ---
@app.get("/api/offres/{username}")
async def get_offres(username: str):
    db = charger_db()
    offres = db["users"].get(username, {}).get("mes_offres", [])
    return sorted(offres, key=lambda x: x.get("id", 0), reverse=True)

@app.get("/api/offres/{username}/{id}")
async def get_offre_individuelle(username: str, id: int):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    offres = db["users"][username].get("mes_offres", [])
    offre = next((o for o in offres if o.get("id") == id), None)
    
    if not offre:
        raise HTTPException(status_code=404, detail="Offre introuvable")
    return offre

@app.post("/api/offres/{username}")
async def add_offre(username: str, offre: dict = Body(...)):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404)

    # ✅ CORRECTION : création de la clé si absente (utilisateurs créés manuellement)
    if "mes_offres" not in db["users"][username]:
        db["users"][username]["mes_offres"] = []

    offres = db["users"][username]["mes_offres"]
    new_id = max([o.get("id", 0) for o in offres], default=0) + 1
    offre["id"] = new_id
    offres.append(offre)
    sauvegarder_db(db)
    return {"status": "success", "id": new_id}

@app.put("/api/offres/{username}/{id}")
async def update_offre(username: str, id: int, updated_data: dict = Body(...)):
    db = charger_db()
    if username not in db["users"]:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    offres = db["users"][username].get("mes_offres", [])
    for i, o in enumerate(offres):
        if o.get("id") == id:
            # ✅ PROTECTION : ces champs sont figés à la création et ne peuvent jamais être modifiés
            CHAMPS_IMMUABLES = [
                "depart", "destination", "etapes",
                "snapshot_camion", "snapshot_cycle",
                "camion_id", "cycle_id"
            ]
            for champ in CHAMPS_IMMUABLES:
                if champ in o:
                    updated_data[champ] = o[champ]  # on remet toujours la valeur d'origine

            updated_data["id"] = id
            offres[i] = updated_data
            sauvegarder_db(db)
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Offre non trouvée")

@app.delete("/api/offres/{username}/{id}")
async def delete_offre(username: str, id: int):
    db = charger_db()
    if username in db["users"]:
        db["users"][username]["mes_offres"] = [o for o in db["users"][username].get("mes_offres", []) if o.get("id") != id]
        sauvegarder_db(db)
        return {"status": "success"}
    raise HTTPException(status_code=404)

@app.get("/api/market/all")
async def get_market():
    db = charger_db()
    offres_publiques = []

    for username, user_data in db.get("users", {}).items():
        for off in user_data.get("mes_offres", []):
            if off.get("statut") not in ["Publiée", "Planifiée", "Acceptée"]:
                continue

            etapes = off.get("capacites_par_etape", [])
            premier = etapes[0]  if etapes else {}
            dernier = etapes[-1] if etapes else {}

            villes_arr = [e.get("ville", "") for e in etapes]
            distances_troncons = {}
            for i in range(len(villes_arr)):
                for j in range(i + 1, len(villes_arr)):
                    distances_troncons[f"{i}-{j}"] = distance_troncon(villes_arr[i:j+1])

            market_item = {
                "id":               off.get("id"),
                "proprietaire":     username,
                "statut":           off.get("statut"),
                "type_marchandise": off.get("type_marchandise", "Palette"),
                "depart":           off.get("depart"),
                "destination":    off.get("destination"),
                "etapes":         off.get("etapes", []),
                "date":           off.get("date"),
                "heure_depart":   premier.get("heure"),
                "heure_arrivee":  dernier.get("heure"),
                "expire_date":    off.get("expire_date"),
                "expire_heure":   off.get("expire_heure"),
                "tarif_euro_m3_km": off.get("tarif_euro_m3_km"),
                "capacites_par_etape": etapes,
                "distances_troncons": distances_troncons,
                "charge_disponible": premier.get("charge_disponible", 0),
                "longueur":          premier.get("longueur", 0),
                "largeur":           premier.get("largeur",  0),
                "hauteur":           premier.get("hauteur",  0),
            }
            offres_publiques.append(market_item)

    return offres_publiques

# --- ROUTE API : DEMANDES DE RÉSERVATION ---
@app.post("/api/demandes/creer")
async def creer_demande(payload: dict = Body(...)):
    db = charger_db()

    if "demandes" not in db:
        db["demandes"] = []

    donnees      = payload.get("donnees", {})
    id_offre     = payload.get("id_offre")
    transporteur = payload.get("transporteur")

    poids  = float(donnees.get("poids_kg",  0) or 0)
    long   = float(donnees.get("longueur",  0) or 0)
    larg   = float(donnees.get("largeur",   0) or 0)
    haut   = float(donnees.get("hauteur",   0) or 0)
    volume = long * larg * haut

    tarif        = 0.0
    etapes_offre = []
    if transporteur and id_offre and transporteur in db.get("users", {}):
        for offre in db["users"][transporteur].get("mes_offres", []):
            if offre.get("id") == id_offre:
                tarif        = float(offre.get("tarif_euro_m3_km", 0) or 0)
                etapes_offre = [e.get("ville", "") for e in offre.get("capacites_par_etape", [])]
                break

    ville_dep = donnees.get("ville_depart", "")
    ville_arr = donnees.get("ville_destination", "")

    if ville_dep in etapes_offre and ville_arr in etapes_offre:
        idx_dep  = etapes_offre.index(ville_dep)
        idx_arr  = etapes_offre.index(ville_arr)
        dist_km  = distance_troncon(etapes_offre[idx_dep:idx_arr + 1])
    else:
        dist_km  = distance_gps(ville_dep, ville_arr)

    prix_calcule = round(tarif * dist_km, 2)

    donnees["prix_calcule"] = prix_calcule
    donnees["distance_km"]  = dist_km
    payload["donnees"]      = donnees

    db["demandes"].append(payload)
    sauvegarder_db(db)
    return {"status": "success", "message": "Demande enregistree", "prix_calcule": prix_calcule, "distance_km": dist_km}

# --- ROUTE POUR RÉCUPÉRER TOUTES LES DEMANDES ---
@app.get("/api/demandes")
async def get_all_demandes():
    db = charger_db()
    return {"demandes": db.get("demandes", [])}

# --- ROUTE POUR METTRE À JOUR LE STATUT (ACCEPTER/REFUSER) ---
@app.post("/api/demandes/statut")
async def update_demande_statut(payload: dict = Body(...)):
    db = charger_db()
    demande_id = payload.get("id_demande")
    nouveau_statut = payload.get("statut")

    # Statuts qui déclenchent l'archivage définitif
    STATUTS_FINAUX = {"Acceptée", "Refusée"}

    # Trouver la demande dans le market actif
    demande_cible = None
    for d in db.get("demandes", []):
        if d.get("donnees", {}).get("id_demande") == demande_id:
            demande_cible = d
            break

    if not demande_cible:
        raise HTTPException(status_code=404, detail="Demande introuvable")

    # Mettre à jour le statut dans l'objet trouvé
    demande_cible["donnees"]["statut"] = nouveau_statut
    id_offre_liee    = demande_cible.get("id_offre")
    transporteur_nom = demande_cible.get("transporteur")
    expediteur_nom   = demande_cible.get("expediteur")

    if nouveau_statut in STATUTS_FINAUX:
        # --- ARCHIVAGE CHEZ LES DEUX UTILISATEURS ---
        archive_entry = dict(demande_cible)  # copie complète avec statut mis à jour

        def _archiver_chez(username):
            if username and username in db.get("users", {}):
                user = db["users"][username]
                if "demandes_archivees" not in user:
                    user["demandes_archivees"] = []
                # Éviter doublons si déjà archivée (cas contre-proposition)
                ids_existants = {a.get("donnees", {}).get("id_demande") for a in user["demandes_archivees"]}
                if demande_id not in ids_existants:
                    user["demandes_archivees"].append(archive_entry)

        _archiver_chez(expediteur_nom)
        # N'archiver qu'une fois si expéditeur == transporteur (même personne)
        if expediteur_nom != transporteur_nom:
            _archiver_chez(transporteur_nom)

        # --- SUPPRESSION DU MARKET ACTIF ---
        db["demandes"] = [
            d for d in db.get("demandes", [])
            if d.get("donnees", {}).get("id_demande") != demande_id
        ]

        # --- ACCEPTÉE : vérifier les capacités, déduire + verrouiller ---
        if nouveau_statut == "Acceptée" and id_offre_liee and transporteur_nom:
            if transporteur_nom in db.get("users", {}):
                for offre in db["users"][transporteur_nom].get("mes_offres", []):
                    if offre.get("id") == id_offre_liee:
                        donnees   = demande_cible.get("donnees", {})
                        ville_dep = donnees.get("ville_depart", "")
                        ville_arr = donnees.get("ville_destination", "")
                        poids_dem = float(donnees.get("poids_kg",  0) or 0)
                        long_dem  = float(donnees.get("longueur",  0) or 0)
                        larg_dem  = float(donnees.get("largeur",   0) or 0)
                        haut_dem  = float(donnees.get("hauteur",   0) or 0)

                        etapes = offre.get("capacites_par_etape", [])
                        villes = [e.get("ville", "") for e in etapes]

                        idx_dep = villes.index(ville_dep) if ville_dep in villes else 0
                        idx_arr = villes.index(ville_arr) if ville_arr in villes else len(etapes) - 1

                        # Dimensions fixes du camion (largeur et hauteur ne changent jamais)
                        snap = offre.get("snapshot_camion", {})
                        larg_camion = float(snap.get("larg", 0) or snap.get("largeur", 0))
                        haut_camion = float(snap.get("haut", 0) or snap.get("hauteur", 0))

                        # Tronçon occupé : de la ville de départ jusqu'à la ville avant l'arrivée (exclue)
                        # car la marchandise monte au départ et libère la place à l'arrivée
                        troncon = etapes[idx_dep:idx_arr]

                        # Vérification sur toutes les étapes traversées (départ inclus, destination exclue)
                        for etape in troncon:
                            cap_poids = float(etape.get("charge_disponible", 0))
                            cap_long  = float(etape.get("longueur", 0))

                            if poids_dem > cap_poids:
                                raise HTTPException(status_code=409, detail=f"Capacité de poids insuffisante à '{etape.get('ville')}' ({cap_poids} kg disponibles, {poids_dem} kg demandés).")
                            if long_dem > cap_long:
                                raise HTTPException(status_code=409, detail=f"Longueur insuffisante à '{etape.get('ville')}' ({cap_long} m disponibles, {long_dem} m demandés).")
                            if larg_camion > 0 and larg_dem > larg_camion:
                                raise HTTPException(status_code=409, detail=f"Largeur de la marchandise ({larg_dem} m) dépasse la largeur du camion ({larg_camion} m).")
                            if haut_camion > 0 and haut_dem > haut_camion:
                                raise HTTPException(status_code=409, detail=f"Hauteur de la marchandise ({haut_dem} m) dépasse la hauteur du camion ({haut_camion} m).")

                        # Déduction sur toutes les étapes traversées (départ inclus, destination exclue)
                        offre["statut"] = "Acceptée"
                        for i, etape in enumerate(etapes):
                            if idx_dep <= i < idx_arr:
                                etape["charge_disponible"] = max(0, float(etape.get("charge_disponible", 0)) - poids_dem)
                                etape["longueur"]          = max(0, float(etape.get("longueur",          0)) - long_dem)
                                etape["largeur"] = larg_camion
                                etape["hauteur"] = haut_camion
                        break
    else:
        # Statut intermédiaire (Contre-proposition…) : simple mise à jour dans demandes
        for d in db.get("demandes", []):
            if d.get("donnees", {}).get("id_demande") == demande_id:
                d["donnees"]["statut"] = nouveau_statut
                break

    sauvegarder_db(db)
    return {"status": "success", "message": f"Demande mise à jour en '{nouveau_statut}'"}


# --- ROUTE POUR RÉCUPÉRER LES DEMANDES ARCHIVÉES D'UN UTILISATEUR ---
@app.get("/api/demandes/archivees/{username}")
async def get_demandes_archivees(username: str):
    db = charger_db()
    if username not in db.get("users", {}):
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    archivees = db["users"][username].get("demandes_archivees", [])
    # Tri : plus récentes en premier
    archivees_sorted = sorted(archivees, key=lambda x: x.get("donnees", {}).get("date_demande_envoi", ""), reverse=True)
    return {"archivees": archivees_sorted}

@app.get("/api/offres/{username}")
async def get_offres(username: str):
    db = charger_db()
    return db["users"].get(username, {}).get("mes_offres", [])

@app.put("/api/demandes/modifier/{id_demande}")
async def modifier_demande(id_demande: str, updated_donnees: dict = Body(...)):
    db = charger_db()
    found = False
    
    for d in db.get("demandes", []):
        if d.get("donnees", {}).get("id_demande") == id_demande:
            nouveau_statut = updated_donnees.get("statut", d["donnees"].get("statut", "En attente"))
            d["donnees"].update(updated_donnees)
            d["donnees"]["statut"] = nouveau_statut 
            found = True
            break
            
    if not found:
        raise HTTPException(status_code=404, detail="Demande introuvable")
        
    sauvegarder_db(db)
    return {"status": "success", "message": "Demande mise à jour avec le statut: " + d["donnees"]["statut"]}

@app.delete("/api/demandes/supprimer/{id_demande}")
async def supprimer_demande_api(id_demande: str):
    db = charger_db()
    
    initial_count = len(db.get("demandes", []))
    
    db["demandes"] = [
        d for d in db.get("demandes", []) 
        if d.get("donnees", {}).get("id_demande") != id_demande
    ]
    
    if len(db["demandes"]) == initial_count:
        raise HTTPException(status_code=404, detail="Demande introuvable")
        
    sauvegarder_db(db)
    return {"status": "success", "message": "Demande supprimée avec succès"}

# --- ROUTE REMBOURSEMENT ---
@app.post("/api/demandes/rembourser/{id_demande}")
async def rembourser_demande(id_demande: str, payload: dict = Body(...)):
    """
    Rembourse une demande Acceptée :
    1. Passe le statut en "Remboursée" dans les archives des deux utilisateurs
    2. Restitue la longueur et le poids sur les étapes concernées de l'offre du transporteur
    3. Crédite l'expéditeur (logique métier : le statut suffit, le front recalcule)
    """
    db = charger_db()

    username = payload.get("username")  # l'utilisateur qui initie (transporteur)
    if not username or username not in db.get("users", {}):
        raise HTTPException(status_code=403, detail="Utilisateur invalide")

    # --- Trouver la demande dans les archives du transporteur ---
    demande_cible = None
    for archive in db["users"][username].get("demandes_archivees", []):
        if archive.get("donnees", {}).get("id_demande") == id_demande:
            demande_cible = archive
            break

    if not demande_cible:
        raise HTTPException(status_code=404, detail="Demande introuvable dans les archives")

    if demande_cible["donnees"].get("statut") != "Acceptée":
        raise HTTPException(status_code=400, detail="Seules les demandes Acceptées peuvent être remboursées")

    transporteur_nom = demande_cible.get("transporteur")
    expediteur_nom   = demande_cible.get("expediteur")
    id_offre_liee    = demande_cible.get("id_offre")

    # Seul le transporteur peut initier le remboursement
    if username != transporteur_nom:
        raise HTTPException(status_code=403, detail="Seul le transporteur peut initier un remboursement")

    donnees   = demande_cible.get("donnees", {})
    ville_dep = donnees.get("ville_depart", "")
    ville_arr = donnees.get("ville_destination", "")
    poids_dem = float(donnees.get("poids_kg",  0) or 0)
    long_dem  = float(donnees.get("longueur",  0) or 0)

    # --- 1. Mise à jour statut dans les archives des deux utilisateurs ---
    def _marquer_remboursee(nom_user):
        if nom_user and nom_user in db.get("users", {}):
            for archive in db["users"][nom_user].get("demandes_archivees", []):
                if archive.get("donnees", {}).get("id_demande") == id_demande:
                    archive["donnees"]["statut"] = "Remboursée"
                    break

    _marquer_remboursee(transporteur_nom)
    if expediteur_nom != transporteur_nom:
        _marquer_remboursee(expediteur_nom)

    # --- 2. Restitution des capacités sur l'offre du transporteur ---
    if id_offre_liee and transporteur_nom and transporteur_nom in db.get("users", {}):
        for offre in db["users"][transporteur_nom].get("mes_offres", []):
            if offre.get("id") == id_offre_liee:
                etapes = offre.get("capacites_par_etape", [])
                villes = [e.get("ville", "") for e in etapes]

                idx_dep = villes.index(ville_dep) if ville_dep in villes else None
                idx_arr = villes.index(ville_arr) if ville_arr in villes else None

                if idx_dep is not None and idx_arr is not None:
                    snap = offre.get("snapshot_camion", {})
                    long_max_camion  = float(snap.get("long", snap.get("longueur", 0)) or 0)
                    poids_max_camion = float(snap.get("poids", snap.get("charge_maximale_kg", 0)) or 0)

                    # Tronçon occupé : départ inclus, destination exclue (même logique qu'à l'acceptation)
                    for i, etape in enumerate(etapes):
                        if idx_dep <= i < idx_arr:
                            nouvelle_long  = min(long_max_camion,  float(etape.get("longueur", 0)) + long_dem)
                            nouveau_poids  = min(poids_max_camion, float(etape.get("charge_disponible", 0)) + poids_dem)
                            etape["longueur"]          = round(nouvelle_long, 4)
                            etape["charge_disponible"] = round(nouveau_poids, 4)

                # Si toutes les demandes sur cette offre sont remboursées/refusées, repasser en Planifiée
                toutes_archivees = []
                for u_data in db.get("users", {}).values():
                    for arch in u_data.get("demandes_archivees", []):
                        if arch.get("id_offre") == id_offre_liee and arch.get("transporteur") == transporteur_nom:
                            toutes_archivees.append(arch.get("donnees", {}).get("statut", ""))
                if all(s in ("Remboursée", "Refusée") for s in toutes_archivees):
                    offre["statut"] = "Planifiée"
                break

    sauvegarder_db(db)
    return {"status": "success", "message": f"Demande {id_demande} remboursée avec succès"}

# --- DÉMARRAGE ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
