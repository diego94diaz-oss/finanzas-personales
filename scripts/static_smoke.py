from __future__ import annotations
import re
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
failed = False
html_files = sorted(root.glob('*.html'))
if not html_files:
    print('NO_HTML')
    sys.exit(1)
for f in html_files:
    text = f.read_text(encoding='utf-8', errors='replace')
    print(f'FILE {f.name} bytes={len(text)} scripts={text.lower().count("<script")}')
    refs = re.findall(r'(?:src|href)=["\']([^"\']+)["\']', text, flags=re.I)
    missing = []
    for ref in refs:
        if ref.startswith(('http://','https://','#','mailto:','tel:','data:','//')):
            continue
        path = (f.parent / ref.split('?',1)[0].split('#',1)[0]).resolve()
        if not path.exists():
            missing.append(ref)
    if missing:
        failed = True
        print('MISSING_ASSETS ' + ', '.join(missing[:20]))
    blocks = re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, flags=re.I|re.S)
    for i, block in enumerate(blocks, 1):
        if not block.strip():
            continue
        tmp = root / f'.__smoke_{f.stem}_{i}.js'
        tmp.write_text(block, encoding='utf-8')
        try:
            p = subprocess.run(['node','--check',str(tmp)], text=True, capture_output=True, timeout=30)
            status = 'OK' if p.returncode == 0 else 'FAIL'
            print(f'NODE_CHECK {f.name} script#{i}: {status}')
            if p.returncode != 0:
                failed = True
                print((p.stdout+p.stderr)[-800:])
        finally:
            tmp.unlink(missing_ok=True)
sys.exit(1 if failed else 0)
