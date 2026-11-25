#!/usr/bin/env python3
"""Remplit l'onglet « Catalogue » de data/produits.xlsx depuis Open Beauty Facts.

Le Catalogue regroupe les produits reconnus au scan qui n'ont pas (encore) de fiche
complète dans l'onglet « Produits » :
  · les références d'un catalogue de parapharmacie (code-barres, marque, type, libellé) ;
  · les produits d'Open Beauty Facts vendus en France dont la composition est connue.
Quand Open Beauty Facts connaît la composition d'une référence, elle est ajoutée :
l'app peut alors analyser les allergènes au scan.

Usage :
  python3 tools/import_obf.py                       # télécharge l'export OBF du jour
  python3 tools/import_obf.py --obf export.csv.gz   # utilise un export déjà téléchargé
  python3 tools/import_obf.py --pharma-index pharma-index.json   # ajoute aussi un catalogue

Les lignes modifiées à la main (source contenant « manuel » ou « emballage ») ne sont
jamais écrasées. Données Open Beauty Facts : licence ODbL, citer la source dans l'app.
Puis : python3 tools/build_data.py
"""
import argparse, csv, gzip, io, json, os, sys, tempfile, time, urllib.request
from openpyxl import load_workbook
from openpyxl.styles import Font

OBF_URL = 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz'
COLS = ['code_barres', 'marque', 'nom', 'type_produit', 'composition_inci', 'source', 'date_source', 'libelle_pharmacie', 'remarque']
PROTECTED = ('manuel', 'emballage', 'marque')   # sources saisies à la main : jamais écrasées


def norm(code):
    code = ''.join(ch for ch in str(code or '') if ch.isdigit())
    return code.lstrip('0') or ('0' if code else '')


def read_obf(path):
    csv.field_size_limit(10 ** 8)
    opener = gzip.open if path.endswith('.gz') else open
    out = {}
    with opener(path, 'rt', encoding='utf-8', errors='replace', newline='') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            code = (row.get('code') or '').strip()
            if not code.isdigit() or not 8 <= len(code) <= 14:
                continue
            inci = ' '.join((row.get('ingredients_text') or '').split())
            ts = row.get('last_modified_t') or ''
            out[norm(code)] = {
                'code': code,
                'nom': ' '.join((row.get('product_name') or '').split())[:160],
                'marque': (row.get('brands') or '').split(',')[0].strip()[:60],
                'inci': inci if len(inci) > 20 else '',
                'france': 'en:france' in (row.get('countries_tags') or ''),
                'date': time.strftime('%Y-%m-%d', time.gmtime(int(ts))) if ts.isdigit() else '',
            }
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--xlsx', default=os.path.join(os.path.dirname(__file__), '..', 'data', 'produits.xlsx'))
    ap.add_argument('--obf', help='export CSV(.gz) Open Beauty Facts ; téléchargé si absent')
    ap.add_argument('--pharma-index', help='JSON [{e, m, t, l}] d’un catalogue de parapharmacie à intégrer')
    a = ap.parse_args()

    obf_path = a.obf
    if not obf_path:
        obf_path = os.path.join(tempfile.mkdtemp(), 'obf.csv.gz')
        print('Téléchargement de', OBF_URL)
        urllib.request.urlretrieve(OBF_URL, obf_path)
    obf = read_obf(obf_path)
    print(f'Open Beauty Facts : {len(obf)} produits, {sum(1 for v in obf.values() if v["inci"])} avec composition')

    wb = load_workbook(a.xlsx)
    prod = wb['Produits']
    hdr = [c.value for c in prod[1]]
    ci = hdr.index('code_barres')
    curated = {norm(r[ci]) for r in prod.iter_rows(min_row=2, values_only=True) if r[ci]}

    cat = wb['Catalogue']
    rows = {}
    for r in cat.iter_rows(min_row=2, values_only=True):
        if r and r[0]:
            rows[norm(r[0])] = dict(zip(COLS, [('' if v is None else str(v)) for v in r]))

    if a.pharma_index:
        for it in json.load(open(a.pharma_index, encoding='utf-8')):
            k = norm(it.get('e'))
            if not k or k in curated:
                continue
            r = rows.setdefault(k, dict.fromkeys(COLS, ''))
            r['code_barres'] = r['code_barres'] or str(it['e'])
            r['marque'] = r['marque'] or it.get('m', '')
            r['type_produit'] = r['type_produit'] or it.get('t', '')
            r['libelle_pharmacie'] = it.get('l', '')
            if 'pharmacie' not in r['source']:
                r['source'] = ' + '.join(x for x in ('pharmacie', r['source']) if x)

    stats = {'compo_ajoutees': 0, 'nouveaux_obf': 0}
    # 1. Compléter les références connues
    for k, r in rows.items():
        o = obf.get(k)
        if not o or any(p in r['source'] for p in PROTECTED):
            continue
        if o['nom'] and (not r['nom'] or r['nom'] == r['libelle_pharmacie']):
            r['nom'] = o['nom']
        if o['marque'] and not r['marque']:
            r['marque'] = o['marque']
        if o['inci'] and r['composition_inci'] != o['inci']:
            if not r['composition_inci']:
                stats['compo_ajoutees'] += 1
            r['composition_inci'] = o['inci']
            r['date_source'] = o['date']
        if 'obf' not in r['source']:
            r['source'] = ' + '.join(x for x in (r['source'], 'obf') if x)
    # 2. Ajouter les produits OBF vendus en France avec composition
    for k, o in obf.items():
        if k in rows or k in curated or not (o['inci'] and o['france'] and o['nom']):
            continue
        rows[k] = dict(zip(COLS, [o['code'], o['marque'], o['nom'], '', o['inci'], 'obf', o['date'], '', '']))
        stats['nouveaux_obf'] += 1
    for r in rows.values():
        if not r['nom']:
            r['nom'] = r['libelle_pharmacie']

    # Réécriture de l'onglet (tri par marque puis nom)
    cat.delete_rows(2, cat.max_row)
    font = Font(name='Arial', size=10)
    for i, r in enumerate(sorted(rows.values(), key=lambda r: (r['marque'].lower(), r['nom'].lower())), 2):
        for j, col in enumerate(COLS, 1):
            c = cat.cell(i, j, r[col])
            c.font = font
            if col == 'code_barres':
                c.number_format = '@'
            if isinstance(r[col], str) and r[col].startswith('='):
                c.data_type = 's'        # texte, jamais une formule
    cat.auto_filter.ref = f'A1:{chr(64 + len(COLS))}{len(rows) + 1}'
    wb.save(a.xlsx)
    avec = sum(1 for r in rows.values() if r['composition_inci'])
    print(f"Catalogue : {len(rows)} références, dont {avec} avec composition "
          f"(+{stats['compo_ajoutees']} compositions, +{stats['nouveaux_obf']} produits OBF France)")


if __name__ == '__main__':
    sys.exit(main())
