#!/usr/bin/env python3
"""Génère index.html (grand public) et pharmacie.html (borne) depuis src/skinmatch.html.

Le code commun aux deux applications n'existe qu'une fois, dans le modèle. Les parties
propres à une version sont encadrées par des lignes de marqueurs :

    @@si public@@        lignes de l'app grand public
    @@sinon@@            lignes de la borne (facultatif)
    @@fin@@

    @@si borne@@         lignes de la borne uniquement
    @@fin@@

Usage :
  python3 tools/build_pages.py           écrit index.html et pharmacie.html
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


def main():
    lines = open(SRC, encoding='utf-8').read().split('\n')
    # Les 5 premières lignes sont l'en-tête explicatif du modèle
    if lines and lines[0].startswith('<!-- SOURCE UNIQUE'):
        end = next(i for i, l in enumerate(lines) if l.rstrip().endswith('-->'))
        lines = lines[end + 1:]
    check = '--check' in sys.argv
    stale = []
    for target, name in TARGETS.items():
        html = render(lines, target)
        path = os.path.join(ROOT, name)
        if check:
            if open(path, encoding='utf-8').read() != html:
                stale.append(name)
        else:
            open(path, 'w', encoding='utf-8').write(html)
            print(f'{name} : {html.count(chr(10)) + 1} lignes')
    if check:
        print('à régénérer : ' + ', '.join(stale) if stale else 'index.html et pharmacie.html sont à jour')
        return 1 if stale else 0
    return 0


if __name__ == '__main__':
    sys.exit(main())
