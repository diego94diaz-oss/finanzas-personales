# Seguridad y privacidad

Este repositorio es público. No debe contener información financiera real.

## Datos que NO deben commitearse

- Saldos bancarios reales.
- Cartolas o movimientos.
- RUT, números de cuenta, tarjetas o deuda individualizada.
- Blobs cifrados generados a partir de datos reales (`FINANZAS_ENC`).
- Respaldos exportados desde la app.

## Modelo seguro recomendado

- Código público.
- Datos privados solo en el navegador local o en respaldos externos cifrados.
- Si se necesita sincronización, usar un backend privado con autenticación; no GitHub Pages como almacenamiento.

## Checklist antes de publicar

- `datos_cifrados.js` debe tener `window.FINANZAS_ENC = null` o datos ficticios.
- Revisar `git diff` antes de cada commit.
- Buscar palabras sensibles: `saldo`, `cuenta`, `rut`, `token`, `password`, `secret`.
