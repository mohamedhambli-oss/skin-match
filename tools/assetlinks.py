"""Génère .well-known/assetlinks.json : la preuve, pour Android, que l'application du Play Store
et le site web appartiennent au même éditeur. Sans ce fichier, l'application Android affiche
une barre d'adresse de navigateur en haut de l'écran.

Usage :
  python3 tools/assetlinks.py <nom_du_paquet> <empreinte_SHA256> [<empreinte_SHA256> ...]

Empreintes à indiquer (Play Console › Tester et publier › Configuration › Intégrité de l'application
› Signature de l'application) : la « clé de signature de l'application » ET la « clé d'importation ».
Exemple :
  python3 tools/assetlinks.py app.skinmatch.twa 14:6D:E9:...:A1 2B:7C:...:F0
Puis publier le site : le fichier doit répondre sur https://<domaine>/.well-known/assetlinks.json
"""
import json, os, re, sys

if len(sys.argv) < 3:
    sys.exit(__doc__)
paquet, empreintes = sys.argv[1], [e.strip().upper() for e in sys.argv[2:]]
if not re.fullmatch(r"[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+", paquet):
    sys.exit("Nom de paquet invalide : " + paquet)
for e in empreintes:
    if not re.fullmatch(r"([0-9A-F]{2}:){31}[0-9A-F]{2}", e):
        sys.exit("Empreinte SHA-256 invalide (32 octets séparés par « : ») : " + e)

racine = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
dossier = os.path.join(racine, ".well-known")
os.makedirs(dossier, exist_ok=True)
contenu = [{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {"namespace": "android_app", "package_name": paquet, "sha256_cert_fingerprints": empreintes},
}]
with open(os.path.join(dossier, "assetlinks.json"), "w", encoding="utf-8") as f:
    json.dump(contenu, f, indent=2)
    f.write("\n")
print("Écrit : .well-known/assetlinks.json (" + paquet + ", " + str(len(empreintes)) + " empreinte(s))")
