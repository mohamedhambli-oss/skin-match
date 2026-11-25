# Base produits SkinMatch

**Le fichier à modifier est `produits.xlsx`.** L'application ne le lit pas directement :
elle lit les deux fichiers générés à partir de lui.

| Fichier | Rôle |
|---|---|
| `produits.xlsx` › onglet **Produits** | Fiches complètes : routines, scan, comparateur. |
| `produits.xlsx` › onglet **Catalogue** | Produits reconnus au scan, avec ou sans composition. |
| `products.js` | Généré : fiches complètes, chargé au démarrage de l'app. |
| `catalogue.json` | Généré : catalogue, chargé au premier scan d'un produit inconnu. |

## Après avoir modifié le tableur

```bash
python3 tools/build_data.py
```

Le script vérifie le tableur (identifiants, codes-barres, colonnes obligatoires) et
n'écrit rien en cas d'erreur. Publier ensuite les trois fichiers.

## Rafraîchir le catalogue depuis Open Beauty Facts

```bash
python3 tools/import_obf.py   # télécharge l'export du jour, complète l'onglet Catalogue
python3 tools/build_data.py
```

Les lignes dont la source est `manuel`, `emballage` ou `marque` ne sont jamais écrasées.

## Licence des données

Les compositions issues d'Open Beauty Facts sont sous licence ODbL : l'application
cite la source, et `catalogue.json` reste diffusé sous la même licence.
