from __future__ import annotations
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
data_file = root / 'datos_cifrados.js'
if not data_file.exists():
    print('datos_cifrados.js no existe')
    sys.exit(1)
text = data_file.read_text(encoding='utf-8', errors='replace')
patterns = {
    'rut_chileno': r'\b\d{1,2}\.\d{3}\.\d{3}-[\dkK]\b',
    'tarjeta_16_digitos': r'\b(?:\d[ -]*?){13,19}\b',
    'email': r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    'iban_or_long_account': r'\b\d{20,}\b',
}
hits = []
for name, pat in patterns.items():
    for m in re.finditer(pat, text):
        hits.append((name, m.group(0)[:32]))
if hits:
    print('POSIBLES_DATOS_EN_CLARO')
    for name, sample in hits[:20]:
        print(f'- {name}: {sample}')
    sys.exit(1)
if 'FINANZAS_SEED' not in text:
    print('WARN: no se encontró FINANZAS_SEED; revisar formato de datos cifrados')
print('OK privacidad básica: sin RUT/tarjetas/emails/cuentas largas obvias en claro')
