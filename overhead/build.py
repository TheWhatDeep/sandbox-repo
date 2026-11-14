#!/usr/bin/env python3
"""Bundle Overhead Studio into one HTML file (dist/overhead-studio.html).

The editor runs straight from index.html with no build step. This script is only for when
you want a single file to share or host: it inlines every stylesheet and script.
"""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

def css(m):
    return '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

def js(m):
    src = (root / m.group(1)).read_text(encoding='utf-8')
    assert '</script' not in src.lower(), m.group(1) + ' contains a closing script tag'
    return '<script>\n' + src + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="((?!https?:)[^"]+)">', css, html)
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
out = root / 'dist'
out.mkdir(exist_ok=True)
(out / 'overhead-studio.html').write_text(html, encoding='utf-8')
print('dist/overhead-studio.html', round(len(html.encode('utf-8')) / 1024), 'KB')
