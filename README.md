# Finanzas Personales

Dashboard HTML local para control de cuentas, movimientos, deudas, presupuesto y respaldo de datos personales.

## Estado actual

- App estática en `index.html`.
- Persistencia principal en `localStorage` del navegador.
- El repositorio es público, por lo que no debe contener saldos, movimientos, cartolas ni blobs cifrados reales.
- `datos_cifrados.js` queda como placeholder público con `window.FINANZAS_ENC = null`.

## Uso seguro

1. Abrir `index.html` en el navegador.
2. Ingresar una contraseña local.
3. Cargar o registrar datos desde la interfaz.
4. Exportar respaldos `.json` desde la pestaña **Respaldo** y guardarlos fuera del repositorio.

## Privacidad

- No subir datos financieros reales al repositorio.
- No confiar en GitHub como bóveda de datos cifrados: aunque AES-GCM + PBKDF2 protege razonablemente, el blob publicado puede ser atacado offline.
- Usar este repositorio como código de la app, no como almacenamiento de patrimonio personal.

## Desarrollo

No requiere build. Para probar localmente:

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000`.
