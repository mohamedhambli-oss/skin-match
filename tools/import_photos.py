#!/usr/bin/env python3
"""Ajoute les photos de produits (Open Beauty Facts) dans data/produits.xlsx.

Remplit la colonne « photo » des onglets Produits et Catalogue avec l'adresse de la photo
de face publiée sur Open Beauty Facts, quand elle existe. Une photo déjà renseignée (par
exemple une photo fournie par la marque) n'est jamais remplacée.

Photos Open Beauty Facts : licence CC BY-SA 3.0, à créditer dans l'app (mentions légales).

Usage :
  python3 tools/import_photos.py --obf export.csv   # export OBF (CSV, éventuellement .gz)
  python3 tools/import_photos.py                    # télécharge l'export du jour
Puis : python3 tools/build_data.py
"""
import argparse, csv, gzip, io, os, re, sys, tempfile, urllib.request
from openpyxl import load_workbook

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
XLSX = os.path.join(ROOT, 'data', 'produits.xlsx')
OBF_URL = 'https://static.openbeautyfacts.org/data/en.openbeautyfacts.org.products.csv.gz'
PREFIXE = 'https://images.openbeautyfacts.org/images/products/'


def norm(code):
    return re.sub(r'\D', '', str(code or '')).lstrip('0')


def lire_obf(chemin):
    csv.field_size_limit(10 ** 9)
    ouvrir = gzip.open if chemin.endswith('.gz') else open
    photos = {}
    with ouvrir(chemin, 'rt', encoding='utf-8', errors='replace') as f:
        for row in csv.DictReader(f, delimiter='\t'):
            url = (row.get('image_url') or '').strip()
            code = norm(row.get('code'))
            # « /invalid/ » : photo rangée sous un code-barres non valide, inutilisable
            if code and url.startswith(PREFIXE) and '/invalid/' not in url:
                photos[code] = url
    return photos


def remplir(ws, cols_codes, photos):
    entete = [c.value for c in ws[1]]
    if 'photo' not in entete:
        ws.cell(row=1, column=len(entete) + 1, value='photo')
        entete.append('photo')
    col = {h: i for i, h in enumerate(entete)}
    ajout = deja = 0
    for r in ws.iter_rows(min_row=2):
        if len(r) <= col['photo']:
            continue
        cellule = r[col['photo']]
        if str(cellule.value or '').strip():
            deja += 1
            continue
        codes = []
        for c in cols_codes:
            if c in col and col[c] < len(r):
                codes += [norm(x) for x in str(r[col[c]].value or '').split(';')]
        url = next((photos[c] for c in codes if c in photos), None)
        if url:
            cellule.value = url
            ajout += 1
    return ajout, deja


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--obf', help='export Open Beauty Facts (CSV ou CSV.gz)')
    a = ap.parse_args()
    chemin = a.obf
    if not chemin:
        chemin = os.path.join(tempfile.mkdtemp(), 'obf.csv.gz')
        print('Téléchargement de l\'export Open Beauty Facts…')
        urllib.request.urlretrieve(OBF_URL, chemin)
    photos = lire_obf(chemin)
    print(f'{len(photos)} photos disponibles sur Open Beauty Facts')
    wb = load_workbook(XLSX)
    for onglet, cols in (('Produits', ['code_barres', 'autres_codes']), ('Catalogue', ['code_barres'])):
        if onglet in wb.sheetnames:
            ajout, deja = remplir(wb[onglet], cols, photos)
            print(f'{onglet} : {ajout} photos ajoutées ({deja} déjà renseignées, conservées)')
    wb.save(XLSX)
    print('Enregistré. Puis : python3 tools/build_data.py')
    return 0


if __name__ == '__main__':
    sys.exit(main())
