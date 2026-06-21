# AGENTS.md — finanzas-personales

## Rol del repositorio

App HTML de finanzas personales con datos cifrados.

## Reglas específicas

- Tratar este repo como sensible.
- No subir datos financieros reales, exportaciones personales ni respaldos sin cifrado.
- No debilitar cifrado, autenticación local ni controles de privacidad.
- Cambios de UI o lógica deben probarse localmente antes de commit.
- PC A debe hacer revisión manual de cambios sensibles.
- PC B puede hacer auditoría no destructiva, lint, documentación y correcciones menores.

## Drive asociado sugerido

`Drive/Mercurio/proyectos/finanzas-personales/`

Subcarpetas:

- `respaldos/`
- `exportaciones/`

## Reglas generales para agentes

- Trabajar en ramas; no modificar `main` directamente salvo instrucción explícita.
- Antes de cambiar archivos: revisar `git status` y hacer `git pull --ff-only`.
- No tocar secretos, tokens, credenciales ni archivos `.env`.
- No subir datos personales/sensibles sin confirmación.
- Preferir cambios pequeños, verificables y con commit claro.
- Si hay duda entre reescribir o preguntar, preguntar.
- PC A se usa para cambios pesados y revisión visual.
- PC B/Hermes/OpenClaw se usa para auditoría, coordinación y cambios menores.
- Assets grandes o documentos de trabajo deben vivir en Google Drive, no en el repo.

## Convención de ramas

- `pc-a/...` para trabajo desde PC A con Claude Code.
- `mercurio/...` para trabajo desde Hermes/Mercurio en PC B.
- `openclaw/...` para tareas desde OpenClaw.
- `docs/...` para documentación.
- `fix/...` para correcciones pequeñas.
- `exp/...` para experimentos.

## Flujo mínimo

```bash
git pull --ff-only
git checkout -b mercurio/nombre-tarea
# cambios
git status
git add .
git commit -m "tipo: descripción clara"
git push -u origin HEAD
```
