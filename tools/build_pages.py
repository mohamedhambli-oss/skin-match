#!/usr/bin/env python3
"""Génère index.html (grand public) et pharmacie.html (borne) depuis src/skinmatch.html.

Le code commun aux deux applications n'existe qu'une fois, dans le modèle. Les parties
propres à une version sont encadrées par des lignes de marqueurs :

    @@si public@@        lignes de l'app grand public
    @@sinon@@            lignes de la borne (facultatif)
    @@fin@@

    @@si borne@@         lignes de la borne uniquement
    @@fin@@

Génère aussi confidentialite.html : la politique de confidentialité de l'app grand public
en page web autonome (adresse exigée par Google Play), extraite du même texte.

Usage :
  python3 tools/build_pages.py           écrit index.html, pharmacie.html et confidentialite.html
  python3 tools/build_pages.py --check   vérifie qu'ils sont à jour (code de sortie 1 sinon)
"""
import os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'src', 'skinmatch.html')
TARGETS = {'public': 'index.html', 'borne': 'pharmacie.html'}


def render(lines, target):
    out, stack = [], []          # stack : (version du bloc, ligne courante incluse ?)
    for n, line in enumerate(lines, 1):
        m = line.strip()
        if m.startswith('@@si ') and m.endswith('@@'):
            version = m[5:-2].strip()
            if version not in TARGETS:
                raise SystemExit(f'ligne {n} : version inconnue « {version} »')
            if stack:
                raise SystemExit(f'ligne {n} : blocs imbriqués non pris en charge')
            stack.append([version, version == target])
        elif m == '@@sinon@@':
            if not stack:
                raise SystemExit(f'ligne {n} : @@sinon@@ sans @@si@@')
            stack[-1][1] = stack[-1][0] != target
        elif m == '@@fin@@':
            if not stack:
                raise SystemExit(f'ligne {n} : @@fin@@ sans @@si@@')
            stack.pop()
        elif not stack or stack[-1][1]:
            out.append(line)
    if stack:
        raise SystemExit('bloc @@si@@ non fermé')
    return '\n'.join(out)


PRIVACY_PAGE = """<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; base-uri 'none'; form-action 'none';">
<title>SkinMatch — Politique de confidentialité</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet">
<style>
  /* Page générée par tools/build_pages.py depuis src/skinmatch.html : ne pas modifier à la main. */
  body { margin: 0; background: #FDF8F5; color: #3D2B1F; font-family: Outfit, system-ui, sans-serif; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 28px 16px 60px; }
  .logo { font-family: Georgia, serif; font-size: 24px; font-weight: 700; margin-bottom: 18px; }
  .logo span { color: #C4726A; }
  a { color: #C4726A; }
</style>
</head>
<body>
<div class="wrap">
<div class="logo">Skin<span>Match</span></div>
%s
</div>
</body>
</html>
"""


def privacy_page(public_html):
    debut = public_html.index('<div id="sc-privacy"')
    contenu = public_html.index('<div class="content"', debut)
    contenu = public_html.index('>', contenu) + 1
    fin = public_html.index('<!-- ══ PAGE CONDITIONS', contenu)
    corps = public_html[contenu:fin].rstrip()
    for _ in range(2):                         # fermetures de .content et de #sc-privacy
        assert corps.endswith('</div>'), 'structure de la page de confidentialité inattendue'
        corps = corps[:-len('</div>')].rstrip()
    assert 'onclick=' not in corps and '<script' not in corps, 'la politique ne doit contenir aucun script'
    return PRIVACY_PAGE % corps


def main():
    lines = open(SRC, encoding='utf-8').read().split('\n')
    # Les 5 premières lignes sont l'en-tête explicatif du modèle
    if lines and lines[0].startswith('<!-- SOURCE UNIQUE'):
        end = next(i for i, l in enumerate(lines) if l.rstrip().endswith('-->'))
        lines = lines[end + 1:]
    check = '--check' in sys.argv
    stale = []
    pages = {name: render(lines, target) for target, name in TARGETS.items()}
    pages['confidentialite.html'] = privacy_page(pages['index.html'])
    for name, html in pages.items():
        path = os.path.join(ROOT, name)
        if check:
            if open(path, encoding='utf-8').read() != html:
                stale.append(name)
        else:
            open(path, 'w', encoding='utf-8').write(html)
            print(f'{name} : {html.count(chr(10)) + 1} lignes')
    if check:
        print('à régénérer : ' + ', '.join(stale) if stale else 'pages publiées à jour')
        return 1 if stale else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
