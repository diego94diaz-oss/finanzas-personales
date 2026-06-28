from __future__ import annotations

import json
import re
import socketserver
import subprocess
import sys
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CRITICAL_ASSETS = ['index.html', 'manifest.json', 'icon.svg', 'sw.js', 'datos_cifrados.js']


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args):
        return


def compile_js(path: Path) -> None:
    proc = subprocess.run(['node', '--check', str(path)], text=True, capture_output=True, timeout=30)
    if proc.returncode != 0:
        raise SystemExit(f'NODE_CHECK FAIL {path.name}\n{(proc.stdout + proc.stderr)[-1200:]}')
    print(f'NODE_CHECK {path.name}: OK')


def serve_and_fetch() -> None:
    handler = partial(QuietHandler, directory=str(ROOT))
    with socketserver.TCPServer(('127.0.0.1', 0), handler) as httpd:
        port = int(httpd.server_address[1])
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        try:
            for rel in ['/', '/index.html', '/manifest.json', '/icon.svg', '/sw.js', '/datos_cifrados.js']:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}{rel}', timeout=5) as resp:
                    if resp.status != 200:
                        raise SystemExit(f'HTTP {resp.status} en {rel}')
                    print(f'HTTP {rel}: OK')
        finally:
            httpd.shutdown()
            thread.join(timeout=5)


def main() -> None:
    html = (ROOT / 'index.html').read_text(encoding='utf-8', errors='replace')
    if 'navigator.serviceWorker.register("sw.js")' not in html:
        raise SystemExit('index.html no registra sw.js')
    if 'manifest.json' not in html:
        raise SystemExit('index.html no referencia manifest.json')

    for asset in CRITICAL_ASSETS:
        path = ROOT / asset
        if not path.exists():
            raise SystemExit(f'Falta asset crítico: {asset}')
        print(f'ASSET {asset}: OK')

    refs = re.findall(r'(?:src|href)=["\']([^"\']+)["\']', html, flags=re.I)
    missing = []
    for ref in refs:
        if ref.startswith(('http://', 'https://', '#', 'mailto:', 'tel:', 'data:', '//')):
            continue
        path = (ROOT / ref.split('?', 1)[0].split('#', 1)[0]).resolve()
        if not path.exists():
            missing.append(ref)
    if missing:
        raise SystemExit('MISSING_ASSETS ' + ', '.join(missing[:20]))

    blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', html, flags=re.I | re.S)
    for i, block in enumerate(blocks, 1):
        if not block.strip():
            continue
        tmp = ROOT / f'.__smoke_index_{i}.js'
        tmp.write_text(block, encoding='utf-8')
        try:
            compile_js(tmp)
        finally:
            tmp.unlink(missing_ok=True)

    compile_js(ROOT / 'sw.js')
    compile_js(ROOT / 'datos_cifrados.js')

    manifest = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))
    icons = manifest.get('icons') or []
    if not icons:
        raise SystemExit('manifest.json sin icons[]')
    for icon in icons:
        icon_path = ROOT / str(icon.get('src') or '').split('?', 1)[0]
        if not icon_path.exists():
            raise SystemExit(f'Icono de manifest ausente: {icon}')

    sw = (ROOT / 'sw.js').read_text(encoding='utf-8', errors='replace')
    cache_match = re.search(r'const\s+CACHE\s*=\s*["\']([^"\']+)["\']', sw)
    if not cache_match:
        raise SystemExit('sw.js sin constante CACHE')
    assets_match = re.search(r'const\s+ASSETS\s*=\s*\[(.*?)\];', sw, flags=re.S)
    if not assets_match:
        raise SystemExit('sw.js sin lista ASSETS')
    cached_assets = re.findall(r'["\']([^"\']+)["\']', assets_match.group(1))
    required_cached = {'./', './index.html', './manifest.json', './icon.svg'}
    missing_cached = sorted(required_cached - set(cached_assets))
    if missing_cached:
        raise SystemExit('sw.js no cachea rutas esperadas: ' + ', '.join(missing_cached))
    obsolete = []
    for rel in cached_assets:
        clean = rel.split('?', 1)[0].split('#', 1)[0]
        if clean in {'./', '/'}:
            target = ROOT / 'index.html'
        else:
            target = (ROOT / clean.lstrip('./')).resolve()
        if not target.exists():
            obsolete.append(rel)
    if obsolete:
        raise SystemExit('sw.js contiene rutas obsoletas: ' + ', '.join(obsolete))
    print(f'SW_CACHE {cache_match.group(1)} assets={len(cached_assets)}')

    serve_and_fetch()


if __name__ == '__main__':
    main()
