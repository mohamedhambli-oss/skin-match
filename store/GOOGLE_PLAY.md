# Publier SkinMatch sur Google Play

L'application Android est une « Trusted Web Activity » (TWA) : une coquille Android qui ouvre
l'application web en plein écran, sans barre d'adresse. Toute mise à jour du site est donc
immédiatement dans l'application, sans republier sur le Play Store (sauf changement de nom,
d'icône ou de domaine).

Contenu de ce dossier :

| Fichier | Usage |
|---|---|
| `captures/1-accueil.png` … `5-scan.png` | Captures d'écran téléphone (1080 × 1920) pour la fiche |
| `image-presentation-1024x500.png` | Image de présentation (« feature graphic ») |
| `../icon-512.png` | Icône de la fiche (512 × 512) |

Pages web exigées par Google (déjà en ligne avec le site) :

| Exigence | Adresse |
|---|---|
| Politique de confidentialité | `https://<domaine>/confidentialite.html` |
| Suppression de compte sans l'application | `https://<domaine>/suppression-compte.html` |

---

## 0. Avant de commencer (décisions qui conditionnent tout le reste)

1. **Le domaine définitif.** L'application Android est liée à un domaine précis. Publier avec
   `skin-match-test.netlify.app` puis changer de domaine oblige à republier l'application et
   à refaire la liaison. Réservez le nom de domaine d'abord (même si le site reste sur Netlify).
2. **Le type de compte développeur (25 $, une fois).**
   - **Compte « organisation »** (société créée, numéro D-U-N-S gratuit à demander, compter
     quelques jours) : pas d'obligation de test fermé, publication possible dès la validation.
   - **Compte « personnel »** : avant la mise en production, Google impose un **test fermé
     avec au moins 12 testeurs inscrits pendant 14 jours d'affilée**. Prévoir 15 à 20 testeurs
     (famille, amis, pharmaciens) pour ne jamais passer sous 12.
   - Dans les deux cas, Google vérifie votre identité (pièce d'identité, et pour une
     organisation les documents de la société).
   → Si la société est créée sous peu, attendez-la et ouvrez directement un compte organisation.

## 1. Fabriquer l'application Android avec PWABuilder (15 minutes, sur ordinateur)

1. Aller sur https://www.pwabuilder.com, saisir l'adresse du site (domaine définitif), lancer l'analyse.
2. « Package for stores » › **Android** › « Generate Package » › **Options** :
   - Package ID : `app.skinmatch.twa` (définitif : ne pourra plus jamais changer)
   - App name : `SkinMatch` · Launcher name : `SkinMatch`
   - Couleur de thème `#C4726A`, fond `#FDF8F5`, barre de navigation `#FDF8F5`
   - Display mode : Standalone · Notification delegation : activé
   - **Signing key : « Create new »**, renseigner nom, organisation, pays, et deux mots de passe.
3. Télécharger le ZIP. Il contient le fichier `.aab` (à envoyer à Google), un `.apk` (pour
   essayer sur votre téléphone) et **la clé de signature** (`signing.keystore` + `signing-key-info.txt`).
4. **Sauvegarder la clé et ses mots de passe à deux endroits sûrs** (gestionnaire de mots de
   passe + clé USB / coffre). Sans elle, il faudra demander à Google de réinitialiser la clé
   d'importation, ce qui prend plusieurs jours. Ne jamais la mettre sur GitHub.

## 2. Créer l'application dans la Play Console

1. https://play.google.com/console › Créer une application › nom « SkinMatch », langue
   française, Application, Gratuite, accepter les déclarations.
2. Tester et publier › **Test interne** › Créer une version › envoyer le `.aab`
   (accepter la signature d'application par Google Play).
3. Récupérer les empreintes : Tester et publier › Configuration › **Intégrité de l'application**
   › Signature de l'application. Copier les deux empreintes **SHA-256** (« clé de signature de
   l'application » et « clé d'importation »).
4. Générer le fichier de liaison et republier le site :
   ```
   python3 tools/assetlinks.py app.skinmatch.twa <empreinte_signature> <empreinte_importation>
   ```
   Vérifier que `https://<domaine>/.well-known/assetlinks.json` s'affiche, puis contrôler avec
   https://developers.google.com/digital-asset-links/tools/generator (domaine + paquet + empreinte).
   Tant que ce fichier n'est pas en ligne, l'application affiche une barre d'adresse en haut.
5. Firebase › Authentication › Paramètres › **Domaines autorisés** : ajouter le domaine définitif
   (sinon la connexion échoue dans l'application).

## 3. Fiche du Play Store (Développer la croissance › Présence sur le Store)

**Nom de l'application** (30 caractères max) :
> SkinMatch : routine skincare

**Description courte** (80 caractères max) :
> Ta routine soin du visage sur-mesure, adaptée à ta peau, tes allergies et ta vie.

**Description complète** (4 000 caractères max) :
> SkinMatch te crée en 60 secondes une routine de soins du visage adaptée à ta peau.
>
> Réponds à 5 questions (type de peau, âge, préoccupations, allergies, budget) : SkinMatch
> sélectionne parmi des centaines de produits de pharmacie et de parapharmacie ceux qui
> correspondent vraiment à ton profil, et t'indique dans quel ordre les appliquer, matin et soir.
>
> CE QUE SKINMATCH PREND EN COMPTE
> • Ton type de peau (sèche, grasse, mixte, normale, sensible) et ton âge
> • Tes préoccupations : imperfections, taches, rides, pores, rougeurs, déshydratation…
> • Tes allergies : plus de 80 allergènes de parfum à déclarer selon le règlement européen
>   2023/1545, et les ingrédients que tu veux éviter
> • La grossesse et l'allaitement : les actifs déconseillés (rétinoïdes, certains acides…)
>   sont écartés automatiquement
> • Ton budget
>
> SCANNE TES PRODUITS
> Scanne le code-barres d'un soin en magasin ou dans ta salle de bain : SkinMatch lit sa
> composition et te dit s'il convient à ta peau, avec les ingrédients à surveiller.
>
> SUIS TA PEAU
> Note comment ta peau tolère chaque produit : un produit qui t'a fait réagir ne te sera plus
> proposé. Suis l'évolution de ta peau en photos, qui restent uniquement sur ton téléphone.
>
> TES DONNÉES T'APPARTIENNENT
> Pas de publicité, aucune revente de données. Les informations de santé ne sont enregistrées
> dans ton compte qu'avec ton accord explicite. Compte supprimable à tout moment, depuis
> l'application ou depuis notre site.
>
> SkinMatch donne des conseils cosmétiques et ne remplace pas l'avis d'un médecin,
> d'un dermatologue ou d'un pharmacien.

**Catégorie** : Beauté · **Tags** : Beauté, Soins de la peau · **E-mail de contact** : contact@skinmatch.app
**Visuels** : icône `icon-512.png`, image de présentation, 5 captures du dossier `captures/`.

> Les captures montrent des noms de marques de produits réels (affichage factuel des
> produits analysés). C'est en principe admis, mais évitez de mettre une marque en avant
> dans le titre ou l'icône.

## 4. Contenu de l'application (Règles › Contenu de l'application)

| Formulaire | Réponse |
|---|---|
| Règles de confidentialité | `https://<domaine>/confidentialite.html` |
| Annonces | Non, l'application ne contient pas d'annonces |
| Accès à l'application | Certaines fonctions nécessitent un compte : fournir un compte de test (e-mail + mot de passe) créé pour Google, sans données réelles |
| Classification du contenu | Questionnaire IARC, catégorie « Utilitaire, productivité… » ; répondre Non partout ; l'app contient des achats ? Non. Résultat attendu : PEGI 3 / Tout public |
| Public cible | 16-17 ans et 18 ans et plus (la politique de confidentialité vise les 15 ans et plus ; ne pas cocher les moins de 13 ans) |
| Applications d'actualités | Non |
| Applications de santé | Remplir la déclaration : cocher les fonctions réellement présentes, notamment le **suivi du cycle menstruel** ; l'application n'est **pas un dispositif médical** et ne pose pas de diagnostic |
| Applications financières, gouvernementales | Non |
| Contenu généré par IA | Oui (analyse de peau par photo et Skin Coach). Signalement dans l'app : « Signaler un problème avec cette analyse » et « Signaler » sous chaque réponse du coach |

### Sécurité des données (Data safety)

Questions générales : données chiffrées en transit **Oui** ; l'utilisateur peut demander la
suppression **Oui**, lien : `https://<domaine>/suppression-compte.html`.

Les prestataires agissant pour notre compte (Google Firebase, Google Gemini) ne comptent pas
comme un « partage » au sens du formulaire.

| Type de données (libellé Google) | Collectée | Partagée | Facultative | Finalité |
|---|---|---|---|---|
| Informations personnelles › Nom | Oui | Non | Non (compte) | Fonctionnement, gestion du compte |
| Informations personnelles › Adresse e-mail | Oui | Non | Non (compte) | Fonctionnement, gestion du compte |
| Santé et remise en forme › Informations sur la santé (grossesse, allergies, carnation, retours de tolérance) | Oui | Non | Oui | Fonctionnement, personnalisation |
| Photos et vidéos › Photos (analyse de peau par IA, traitement éphémère, non conservées) | Oui, traitée de façon éphémère | Non | Oui | Fonctionnement |
| Activité dans les applis › Interactions avec l'application (jours d'utilisation ; mesure d'audience si acceptée) | Oui | Non | Non | Statistiques (analyse) |
| Activité dans les applis › Autre contenu généré par l'utilisateur (codes-barres proposés) | Oui | Non | Oui | Fonctionnement |
| Position › Position approximative (conseils météo, arrondie à ~10 km) | Oui, éphémère | Non | Oui | Fonctionnement |
| Identifiants de l'appareil ou autres (identifiant Google Analytics, si accepté) | Oui | Non | Oui | Statistiques (analyse) |
| Identifiants de l'appareil ou autres (jeton de notification, si les rappels sont activés) | Oui | Non | Oui | Fonctionnement (rappels) |

Le suivi du cycle et les photos du suivi avant/après restent sur le téléphone : non collectés.

> Ces réponses reflètent l'application au moment de la rédaction. À relire avec la personne
> qui validera la politique de confidentialité ; toute nouvelle collecte doit y être ajoutée.

## 5. Tests puis production

1. Test interne : installer depuis le lien de test, vérifier qu'il n'y a **pas de barre
   d'adresse** (sinon : assetlinks), la connexion, le scan (autorisation caméra), les notifications.
2. Compte personnel : passer en **test fermé**, inviter les testeurs (liste d'e-mails ou groupe
   Google), attendre 14 jours avec au moins 12 inscrits, puis « Demander l'accès à la production ».
3. Production : déploiement progressif conseillé (20 %, puis 100 %).

## 6. Ce qui reste à faire côté application avant la soumission

- Renseigner les champs juridiques surlignés en jaune (éditeur, adresse, SIREN…) : ils
  apparaissent dans la politique de confidentialité publique.
- Adresse `contact@skinmatch.app` réelle et relevée (citée dans la fiche et la politique).
- Fonctions serveur et règles Firestore déployées (connexion, IA, suppression de compte).
