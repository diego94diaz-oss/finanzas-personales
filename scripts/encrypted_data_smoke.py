from __future__ import annotations

import base64
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data_file = root / "datos_cifrados.js"

if not data_file.exists():
    print("datos_cifrados.js no existe")
    sys.exit(1)

text = data_file.read_text(encoding="utf-8", errors="replace").strip()
match = re.fullmatch(r"window\.FINANZAS_ENC\s*=\s*(\{.*\})\s*;?", text, flags=re.S)
if not match:
    print("FORMATO_INVALIDO: se esperaba window.FINANZAS_ENC={...}")
    sys.exit(1)

try:
    payload = json.loads(match.group(1))
except json.JSONDecodeError as exc:
    print(f"JSON_INVALIDO: {exc}")
    sys.exit(1)

required = ["salt", "iv", "ct"]
missing = [key for key in required if not payload.get(key)]
if missing:
    print("CAMPOS_FALTANTES: " + ", ".join(missing))
    sys.exit(1)

for key in required:
    if not isinstance(payload.get(key), str):
        print(f"CAMPO_NO_STRING: {key}")
        sys.exit(1)
    try:
        raw = base64.b64decode(payload[key], validate=True)
    except Exception:
        print(f"BASE64_INVALIDO: {key}")
        sys.exit(1)
    if key in {"salt", "iv"} and len(raw) < 12:
        print(f"CAMPO_DEMASIADO_CORTO: {key}")
        sys.exit(1)
    if key == "ct" and len(raw) < 64:
        print("CIPHERTEXT_DEMASIADO_CORTO")
        sys.exit(1)

try:
    iterations = int(payload.get("iter") or 200000)
except (TypeError, ValueError):
    print("ITERACIONES_INVALIDAS")
    sys.exit(1)
if iterations < 100000:
    print(f"ITERACIONES_BAJAS: {iterations}")
    sys.exit(1)

print("OK datos cifrados: estructura FINANZAS_ENC válida; no se descifró ni se expusieron secretos")
