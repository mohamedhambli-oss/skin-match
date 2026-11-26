# SkinMatch

Application web (PWA) de recommandation skincare : questionnaire, routine personnalisée,
scan de codes-barres, détection des allergènes réglementaires (règlement UE 2023/1545),
filtres grossesse et allaitement. Deux versions :

| Version | Fichier publié | Pour qui |
|---|---|---|
| Grand public | `index.html` | Le consommateur, sur son téléphone (compte, suivi, scan) |
| Borne pharmacie | `pharmacie.html` | La cliente en officine, sur une tablette (sans compte, données effacées entre deux passages, statistiques, produits en rayon) |

## Où modifier quoi

| Je veux modifier… | Fichier à éditer | Puis lancer |
|---|---|---|
| L'application (écrans, logique, styles) | `src/skinmatch.html` | `python3 tools/build_pages.py` |
| Les produits | `data/produits.xlsx` | `python3 tools/build_data.py` |
| Le catalogue depuis Open Beauty Facts | — | `python3 tools/import_obf.py` puis `tools/build_data.py` |
| Les photos de produits (Open Beauty Facts) | colonne `photo` du tableur (une photo saisie à la main n'est jamais remplacée) | `python3 tools/import_photos.py` puis `tools/build_data.py` |
| Le proxy IA ou le nettoyage de compte | `functions/` | `firebase deploy --only functions` |
| Les règles de sécurité Firestore | `firestore.rules` | `firebase deploy --only firestore:rules` |
| Le tableau de bord (indicateurs) | `admin.html` (affichage), `functions/stats-core.js` (calculs) | `firebase deploy --only functions` |

## Tableau de bord

`admin.html` : utilisateurs actifs (7 et 30 jours), inscriptions, rétention par semaine
d'inscription, taux de réaction par produit (retours de tolérance anonymes). Accès réservé :
compte à e-mail vérifié listé dans `ADMIN_EMAILS` (fichier `functions/.env`, non commité,
par exemple `ADMIN_EMAILS=moi@exemple.fr`). La fonction `stats` ne lit que des dates
d'inscription et d'activité, jamais de données de santé, et ne renvoie que des agrégats.

**Ne jamais modifier `index.html`, `pharmacie.html` ni `confidentialite.html` à la main** : ils sont générés depuis
`src/skinmatch.html` (`confidentialite.html` est la politique de confidentialité de l'app, en
page web autonome pour Google Play). Le code commun n'y figure qu'une fois ; les passages propres à une
version sont encadrés par `@@si public@@ … @@sinon@@ … @@fin@@` ou `@@si borne@@ … @@fin@@`.
`python3 tools/build_pages.py --check` vérifie que les pages publiées sont à jour.

## Skin Coach (assistant IA)

Le coach passe par le proxy IA (`functions/coach-core.js`, tâche « coach », 20 messages par jour
et par compte). Garde-fous : il ne cite que des produits de la base envoyés par l'app (déjà
filtrés allergies et grossesse), ne pose pas de diagnostic, oriente vers le pharmacien, le
médecin ou le 15/112 (détection par mots-clés aussi côté serveur et téléphone). Sans compte,
sans accord pour l'IA ou quand le quota est atteint : réponses automatiques prudentes.
**Avant de l'ouvrir au public**, lancer l'évaluation avec le vrai Gemini (14 questions pièges) :
`cd functions && GEMINI_KEY=… node test/coach.eval.js`, et relire les réponses.

## Rappels de routine (notifications)

Le serveur (fonction `reminders`, toutes les 15 minutes) envoie les rappels matin et soir, même
application fermée. Pour l'activer : Firebase › Paramètres du projet › Cloud Messaging ›
Certificats Web Push › Générer, puis coller la clé publique dans `SKINMATCH_VAPID_KEY`
(`src/skinmatch.html`), régénérer les pages et déployer les fonctions. Sans cette clé, les
rappels ne s'affichent que si l'application est ouverte.

## App Check (protection contre les abus)

Prouve aux serveurs que les requêtes viennent de l'application. Activation, dans l'ordre :
1. Firebase › App Check › Applications › application web › **reCAPTCHA Enterprise** : copier la
   clé du site dans `SKINMATCH_RECAPTCHA_KEY` (`src/skinmatch.html`, `suppression-compte.html`,
   `admin.html`), régénérer les pages, publier.
2. Proxy IA : mode `monitor` par défaut (appels sans preuve journalisés, « appcheck_absent »
   dans les journaux). Après quelques jours sans anomalie : `APPCHECK_MODE=enforce` dans
   `functions/.env`, puis `firebase deploy --only functions`.
3. Firestore et Authentification : dans la console App Check, regarder les métriques puis
   cliquer « Appliquer » quand presque toutes les requêtes sont vérifiées.
Sans clé, rien ne change.

## Google Play

Guide pas à pas, textes de la fiche, réponses aux formulaires et visuels : `store/GOOGLE_PLAY.md`.
Pages web exigées par Google : `confidentialite.html`, `suppression-compte.html`.
Liaison application ↔ site : `python3 tools/assetlinks.py <paquet> <empreintes SHA-256>`.

## Tests

- Proxy IA : `cd functions && npm test`
- Règles Firestore, nettoyage de compte et tableau de bord (émulateurs, Java requis) : `cd firestore-tests && npm test`

## Publication

Sites Netlify : publier `index.html`, `pharmacie.html`, `admin.html`, `confidentialite.html`,
`suppression-compte.html`, `.well-known/` (une fois l'app Android créée), `store/captures/` (cités par le manifeste), `sw.js`, les manifestes, `_headers`,
les icônes, `vendor/` et `data/products.js` + `data/catalogue.json` (pas le tableur ni `src/`).
