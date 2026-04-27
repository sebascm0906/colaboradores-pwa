# CLAUDE.md — PWA Colaboradores (KOLD OS)

Punto de entrada para sesiones de Claude Code. Lee esto antes de explorar el código.

## 1. Identificación del proyecto

- **Nombre:** PWA Colaboradores (KOLD OS).
- **Stack:** Vite 5 + React 18 + React Router v6 + Tailwind v4 + vite-plugin-pwa + Workbox. Sin TypeScript.
- **Dominio activo:** `colaboradores-pwa.vercel.app`. Dominio custom esperado pero no configurado: `colaboradores.grupofrio.mx` (ver gap G024).
- **Backend:** Odoo producción `grupofrio.odoo.com` (db `grupofrio`).

## 2. Documentación clave

- [`docs/CODE_MANUAL.md`](docs/CODE_MANUAL.md) — manual de arquitectura y operación. **Leer antes de cualquier cambio sustancial.**
- [`docs/GAPS_BACKLOG.md`](docs/GAPS_BACKLOG.md) — backlog técnico priorizado. **Revisar antes de iniciar cualquier sprint.**
- `/GrupoFrio/docs/setup-plantas-produccion.md` (en repo backend de Odoo modules) — referencia obligatoria para setup de nuevas plantas. Documenta `production_location_id` y `mp_turno_location_id` por empresa.

## 3. Roles operativos del sistema (11)

- **Primarios (9):** Gerente, Auxiliar Admin, Operador Rolito, Operador Barra, Jefe de Producción, Almacenista PT, Almacenista Entregas, Jefes de Ruta, Supervisor de Ventas.
- **Secundarios (2):** Auxiliar de Producción (cubre Rolito y Barra), Auxiliar de Ruta (cubre Jefes de Ruta).
- Detalle de permisos por rol en §8 del CODE_MANUAL.md.

## 4. Estándares no negociables

- Variable Odoo: `ODOO_PASSWORD` (NUNCA `ODOO_PASS`).
- Variables prohibidas: `META_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `ODOO_PASS`, `kold-secret-dev`.
- Webhook base n8n: `https://yamilestebanh.app.n8n.cloud/webhook/`.
- Cero `style={{}}` inline. Touch targets mínimo 44px.
- Autorización en `gf_saleops`: derivar rol del header `X-GF-Employee-Token`, NUNCA del payload (ver ADR-08 en CODE_MANUAL.md §14).

## 5. Trampas conocidas

- `lib/api.js` es un god-object de 6500+ líneas. No agregar más funcionalidad ahí — refactorizar progresivamente.
- Webhooks de n8n no se re-registran tras `n8n_update_full_workflow`. Toggle manual OFF→ON requerido.
- Tareas y notas de supervisores viven en `localStorage` (flag `IS_STUB`), no en backend. Migración pendiente (gap G006).
- Auth NO usa JWT — son tokens opacos (`gf_employee_token`, `gf_salesops_token`) validados contra BD. Ver §4.3 del manual.

## 6. Antes de cualquier sesión

- `git status` y `git pull` para empezar al día.
- Leer `docs/GAPS_BACKLOG.md` para entender qué está abierto.
- Si la tarea toca un módulo, leer la sección correspondiente del CODE_MANUAL.md primero.
