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

text = data_file.read_text(encoding="utf-8", errors="replace")

# datos_cifrados.js debe contener solo el blob cifrado actual.
# FINANZAS_SEED legacy queda rechazado porque representa datos financieros en claro.
enc_match = re.fullmatch(r"\s*window\.FINANZAS_ENC\s*=\s*(\{.*\})\s*;?\s*", text, flags=re.S)
if not enc_match:
    print("FORMATO_INVALIDO: se esperaba solo FINANZAS_ENC cifrado; FINANZAS_SEED/plaintext no está permitido")
    sys.exit(1)

try:
    payload = json.loads(enc_match.group(1))
except json.JSONDecodeError as exc:
    print(f"FINANZAS_ENC_JSON_INVALIDO: {exc}")
    sys.exit(1)

required = ["salt", "iv", "ct"]
missing = [key for key in required if not payload.get(key)]
if missing:
    print("FINANZAS_ENC_CAMPOS_FALTANTES: " + ", ".join(missing))
    sys.exit(1)

for key in required:
    if not isinstance(payload.get(key), str):
        print(f"FINANZAS_ENC_CAMPO_NO_STRING: {key}")
        sys.exit(1)
    try:
        raw = base64.b64decode(payload[key], validate=True)
    except Exception:
        print(f"FINANZAS_ENC_BASE64_INVALIDO: {key}")
        sys.exit(1)
    if key in {"salt", "iv"} and len(raw) < 12:
        print(f"FINANZAS_ENC_CAMPO_CORTO: {key}")
        sys.exit(1)
    if key == "ct" and len(raw) < 64:
        print("FINANZAS_ENC_CIPHERTEXT_CORTO")
        sys.exit(1)

try:
    iterations = int(payload.get("iter") or 200000)
except (TypeError, ValueError):
    print("FINANZAS_ENC_ITERACIONES_INVALIDAS")
    sys.exit(1)
if iterations < 100000:
    print(f"FINANZAS_ENC_ITERACIONES_BAJAS: {iterations}")
    sys.exit(1)

# No escanear ciphertext base64 como texto financiero; sí escanear metadatos.
scan_payload = {k: v for k, v in payload.items() if k != "ct"}
scan_text = json.dumps(scan_payload, ensure_ascii=False)
patterns = {
    "rut_chileno": r"\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b",
    "tarjeta_16_digitos": r"\b(?:\d[ -]*?){13,19}\b",
    "email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    "iban_or_long_account": r"\b\d{20,}\b",
}
hits = []
for name, pat in patterns.items():
    for m in re.finditer(pat, scan_text):
        hits.append((name, m.group(0)[:32]))
if hits:
    print("POSIBLES_DATOS_EN_CLARO")
    for name, sample in hits[:20]:
        print(f"- {name}: {sample}")
    sys.exit(1)

print("OK privacidad básica: FINANZAS_ENC válido; sin RUT/tarjetas/emails/cuentas obvias en metadatos")
