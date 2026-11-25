#!/usr/bin/env python3
"""Transforme data/produits.xlsx en fichiers lus par l'application.

  data/products.js    — onglet « Produits » : fiches complètes (routines, scan, comparateur).
                        Chargé au démarrage : window.SKINMATCH_DATA = {DB, INCI_DB}.
  data/catalogue.json — onglet « Catalogue » : produits reconnus au scan (avec ou sans
                        composition). Chargé seulement au premier scan inconnu.

Usage : python3 tools/build_data.py   (à relancer après chaque modification du tableur)
Le script s'arrête sans rien écrire si le tableur contient une erreur bloquante.
"""
import json, os, re, sys, time
from openpyxl import load_workbook

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
XLSX = os.path.join(ROOT, 'data', 'produits.xlsx')

LISTS = {'actifs_cles': 'ak', 'composition_inci': 'comp', 'regions': 'region', 'types_peau': 'sk',
         'problemes': 'c', 'ages': 'age'}
TEXTS = {'marque': 'marque', 'nom': 'nom', 'type_produit': 'usage', 'texture': 'texture', 'moment': 'moment',
         'pour_qui': 'pq', 'benefices_fr': 'ben', 'benefices_en': 'ben_en', 'application': 'app', 'prix': 'prix',
         'lien_achat': 'link', 'categorie': 'cat', 'video': 'video', 'label_yuka': 'yl'}
BOOLS = {'vegan': 'vegan', 'clean': 'clean', 'teinte': 'teinte', 'fiche_incomplete': 'incomplet'}
FLAGS = ['retinol', 'parfum', 'paraben', 'alcohol', 'sulfate', 'silicone', 'vitc', 'salicylic', 'aha_bha']
REQUIRED = ['id', 'marque', 'nom', 'moment']


def s(v):
    return '' if v is None else str(v).strip()


def norm(code):
    code = re.sub(r'\D', '', s(code))
    return code.lstrip('0') or ('0' if code else '')


def main():
    wb = load_workbook(XLSX, read_only=True)
    errors, warnings = [], []

    # ── Produits ──
    rows = list(wb['Produits'].iter_rows(values_only=True))
    hdr = [s(h) for h in rows[0]]
    DB, INCI_DB, seen_ean = {}, {}, {}
    for n, r in enumerate(rows[1:], 2):
        row = dict(zip(hdr, r))
        k = s(row.get('id'))
        if not k and not any(s(v) for v in r):
            continue                                      # ligne vide
        for col in REQUIRED:
            if not s(row.get(col)):
                errors.append(f'Produits ligne {n} : colonne « {col} » vide')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*', k):
            errors.append(f'Produits ligne {n} : id « {k} » invalide (minuscules, chiffres, tirets)')
            continue
        if k in DB:
            errors.append(f'Produits ligne {n} : id « {k} » en double')
            continue
        p = {}
        ean = re.sub(r'\D', '', s(row.get('code_barres')))
        if s(row.get('code_barres')) and not 8 <= len(ean) <= 14:
            errors.append(f'Produits ligne {n} : code-barres « {row.get("code_barres")} » invalide')
        if ean:
            p['ean'] = ean
            if norm(ean) in seen_ean:
                warnings.append(f'code-barres {ean} sur « {seen_ean[norm(ean)]} » et « {k} »')
            seen_ean.setdefault(norm(ean), k)
        for col, key in TEXTS.items():
            if s(row.get(col)):
                p[key] = s(row.get(col))
        for col, key in LISTS.items():
            if s(row.get(col)):
                p[key] = [x.strip() for x in s(row.get(col)).split(' ; ') if x.strip()]
        for col, key in BOOLS.items():
            v = s(row.get(col)).upper()
            if v in ('OUI', 'NON'):
                p[key] = v == 'OUI'
        src = s(row.get('source'))
        if src and src != 'manuel':
            p['source'] = src
        if s(row.get('note_yuka')):
            try:
                p['yuka'] = int(float(s(row.get('note_yuka'))))
            except ValueError:
                warnings.append(f'Produits ligne {n} : note_yuka non numérique')
        p.setdefault('ak', []); p.setdefault('comp', [])
        for key in ('usage', 'texture', 'pq', 'ben', 'app'):   # textes lus sans test par l'app
            p.setdefault(key, '')
        if len(p['comp']) < 3:
            warnings.append(f'« {k} » : composition absente ou très courte')
        DB[k] = p
        flags = {f: s(row.get('contient_' + f)).upper() for f in FLAGS}
        if any(v in ('OUI', 'NON') for v in flags.values()):
            INCI_DB[k] = {f: v == 'OUI' for f, v in flags.items()}
            if ean:
                INCI_DB[k]['ean'] = ean

    # ── Catalogue ──
    cat_rows = list(wb['Catalogue'].iter_rows(values_only=True)) if 'Catalogue' in wb.sheetnames else [()]
    chdr = [s(h) for h in cat_rows[0]]
    items, avec = {}, 0
    for n, r in enumerate(cat_rows[1:], 2):
        row = dict(zip(chdr, r))
        ean = re.sub(r'\D', '', s(row.get('code_barres')))
        if not ean:
            continue
        if not 8 <= len(ean) <= 14:
            warnings.append(f'Catalogue ligne {n} : code-barres « {ean} » ignoré'); continue
        if norm(ean) in seen_ean:
            continue                                      # la fiche complète prime
        inci = s(row.get('composition_inci'))
        avec += bool(inci)
        items[ean] = [s(row.get('marque')), s(row.get('nom')), s(row.get('type_produit')), inci, s(row.get('source'))]

    if errors:
        print('ERREURS (rien n’a été écrit) :\n  ' + '\n  '.join(errors[:50]))
        return 1
    version = time.strftime('%Y-%m-%d %H:%M')
    js = ('// Généré par tools/build_data.py depuis data/produits.xlsx — ne pas modifier à la main.\n'
          'window.SKINMATCH_DATA = ' + json.dumps({'version': version, 'DB': DB, 'INCI_DB': INCI_DB},
                                                  ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(os.path.join(ROOT, 'data', 'products.js'), 'w', encoding='utf-8').write(js)
    json.dump({'version': version, 'champs': ['marque', 'nom', 'type', 'inci', 'source'], 'produits': items},
              open(os.path.join(ROOT, 'data', 'catalogue.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print(f'products.js : {len(DB)} fiches ({sum(1 for p in DB.values() if p.get("ean"))} avec code-barres)')
    print(f'catalogue.json : {len(items)} références, dont {avec} avec composition')
    if warnings:
        print(f'{len(warnings)} avertissement(s) :\n  ' + '\n  '.join(warnings[:30]) + ('\n  …' if len(warnings) > 30 else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
