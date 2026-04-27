# GAPS_BACKLOG — PWA Colaboradores

> Reporte priorizado de gaps detectados durante la auditoría del 2026-04-27 sobre el commit `52b7b5f`.
> Todas las entradas tienen evidencia. Cualquier gap sin link al archivo no entra a la tabla.
> Severidad: P0 bloquea producción · P1 bloquea uno o más roles · P2 funcionalidad parcial · P3 cosmético / deuda.

---

## Resumen ejecutivo

**Total de gaps emitidos:** 33 (15 obligatorios + 8 Fase 2 + 2 Fase 3 + 2 Fase 4 + 5 retroactivos PR #21–#27 + 1 nuevo G033). **Cerrados durante el ciclo de auditoría y los fixes operativos:** 13 (G002, G013, G014, G017, G025, G027 + G028–G032 retroactivos + G026 entró ya cerrado preventivamente). **Activos en backlog:** 20 (19 anteriores + G033 nuevo).

### Distribución por severidad (gaps activos)

| Severidad | Cantidad | Cambio en post-fixes 2026-04-27 |
|-----------|----------|----------------------------------|
| P0 — Bloquea producción | 0 | sin cambio |
| P1 — Bloquea rol(es) | 6 | sin cambio (G028–G032 nunca tuvieron ID activo; entran como Resueltos retroactivos) |
| P2 — Funcionalidad parcial / sistémico | 8 | sin cambio |
| P3 — Cosmético / deuda | 6 | **+1** (G033: `x_analytic_account_id` no viene en JWT, fallback RPC funciona pero suma latencia) |

### Distribución por categoría (activos)

| Categoría | Cantidad |
|-----------|----------|
| Implementación | 3 |
| Contrato | 1 |
| Permisos | 1 |
| Integración | 4 |
| Datos | 1 |
| Seguridad | 1 |
| Deuda | 6 |
| Despliegue | 2 |
| Tests | 1 |
| CI-CD | 1 |

### Top 10 a atacar primero (activos, post-cierre G002 y G013)

Los dos bloqueadores más críticos del ciclo (G002 privilege escalation, G013 inventory posting) están cerrados. La prioridad ahora se mueve a los P1 restantes:

1. **G001** — `/pwa-metabase-token` stub: KPIs degradan a mock para Gerente, Supervisor de Ventas y Jefe de Ruta. Decisiones operativas con datos falsos.
2. **G006** — `tareasService` y `notasService` con `IS_STUB` (localStorage): datos del Supervisor de Ventas se pierden al cambiar dispositivo.
3. **G016** — Cierre/liquidación de ruta persiste en localStorage: Jefe de Ruta pierde estado si cierra app antes del cierre final.
4. **G024** — Dominio custom `colaboradores.grupofrio.mx` no apunta al deploy real (`colaboradores-pwa.vercel.app`). Links operativos en SMS/WA/email no cargan.
5. **G003** — Tokens en bundle del cliente: requieren rotación periódica + migración a server-side proxy.
6. **G012** — PIN verification pendiente para Operador Rolito: riesgo de trazabilidad.
7. **G018** — Umbrales de cierre de caja validados solo en cliente: backend debe rechazar bypass directo de API.
8. **G019** — Pallet reject sin log de responsable: trazabilidad incompleta.
9. **G004** — Cero tests en módulos más críticos (admin, ruta, gerente, supervisor-ventas).
10. **G005** — Sin CI/CD: tests no corren en PRs.

### Tres preguntas críticas pendientes (post-cierre del ciclo)

1. **¿Cuándo se cargarán las dashboards reales en Metabase para cerrar G001?** Bloqueado en backend desde 2026-04-18. Decisiones operativas siguen apoyadas en mock.
2. **¿Por qué el dominio custom `colaboradores.grupofrio.mx` no está activo?** ¿Falta configurar DNS, o falta agregar el dominio en Vercel Project Settings, o el deploy productivo es intencionalmente subdominio default? Yamil/Carlos deciden.
3. **¿Cómo se diferencia el flujo de un Auxiliar de Producción vs su titular en runtime?** El `ProductionOperatorRoute` valida solo `operador_barra` y `operador_rolito`, pero `auxiliar_produccion` está en `MODULE_ROLE_VARIANTS`. Si un empleado tiene SOLO `auxiliar_produccion` sin `additional_job_keys`, ¿puede operar? Sebastián verifica.

---

## Tabla maestra de gaps

| ID | Título | Categoría | Severidad | Esfuerzo | Dueño | Dependencia | Evidencia | Acción concreta |
|----|--------|-----------|-----------|----------|-------|-------------|-----------|-----------------|
| G001 | `/pwa-metabase-token` es stub: KPIs reales no disponibles | Integración | P1 | M | Sebastián | Ninguna técnica; requiere `metabase.secret_key` configurado en Odoo + dashboards creados en Metabase | [`BACKEND_TODO.md:13-72`](../BACKEND_TODO.md), [`src/screens/ScreenKPIs.jsx:296`](../src/screens/ScreenKPIs.jsx) | Implementar controller `/pwa-metabase-token` en `gf_metabase_embed`, marcar `installable: True`, configurar `metabase.dashboard.<rol>` por cada job_key |
| G002 | ~~Privilege escalation en `gf_saleops` via `employee_id` no verificado en payload~~ | Seguridad | RESUELTO (cerrado por Sebastián 2026-05-05) | — | Sebastián | — | **Diagnóstico real** (verificado por Sebastián contra código backend, NO frontend): el sistema NO usa JWT (el título previo era incorrecto). Tokens reales son opacos: `gf_employee_token` (`secrets.token_urlsafe(32)`, validado contra BD, 30d sliding, por empleado) y `gf_salesops_token` (estático en `ir.config_parameter`, global compartido). **Vector real:** el guard de `gf_saleops/services/guard.py:52` derivaba el rol del `employee_id` enviado en el body del request; combinado con `gf_salesops_token` global, cualquier rol con sesión activa podía operar como Supervisor de Ventas o Gerente de Unidad mandando `employee_id` ajeno. **Endpoints expuestos al vector:** 16 con `required_role="supervisor_ventas"` + 1 con `required_role="gerente_unidad"` (`forecast/unlock`). **Endpoints NO expuestos:** `gf_logistics_ops/*`, `gf_production_ops/*` (validan `X-GF-Employee-Token` contra BD). **Evidencia de explotación previa:** 0 casos maliciosos confirmados en revisión de últimos 30 días; 1 caso ambiguo cuestionablemente legítimo. | **Movido a sección "Resueltos durante auditoría".** Fix completo en módulo `gf_saleops`: `controllers/main.py` y `controllers/supervisor.py` ahora resuelven el empleado desde `X-GF-Employee-Token`; `services/guard.py` overridea `role_key` desde el `_session_employee_id` (no del payload); flag `require_employee_token` para rollout gradual. Sistema de logging permanente `gf.saleops.guard.log` activo (G027 cerrado en simultáneo). Rollout: deploy 2026-04-29 22:00 CST en modo permisivo + monitoreo nocturno → 3 días limpios (2026-04-30/05-01/05-02) → modo estricto activado 2026-05-05 AM. |
| G003 | Tokens en bundle del cliente: `VITE_GF_SALESOPS_TOKEN`, `VITE_N8N_VOICE_TOKEN` | Seguridad | P2 | L | Carlos + Sebastián | Definir proxy server-side (n8n route o Vercel serverless) | [`src/lib/api.js:69-86`](../src/lib/api.js), [`.env.example:18-30`](../.env.example), [`src/modules/shared/voice/VoiceInputButton.jsx:40-41`](../src/modules/shared/voice/VoiceInputButton.jsx) | Documentar mitigación actual (rotación con `scripts/voice/init_token.mjs`); proponer migración: tokens viven server-side, frontend llama a un endpoint sin bearer y el server lo añade |
| G004 | Cero tests en módulos críticos: `admin/`, `ruta/`, `gerente/`, `supervisor-ventas/` | Tests | P2 | XL | TBD | Decidir framework (mantener `node:test` o migrar a Vitest para componentes) | [`tests/`](../tests/) (21 archivos, ninguno cubre esos módulos) | Crear plan de cobertura: priorizar `routeControlService.js`, `AdminContext.jsx`, `tareasService.js`, `notasService.js`, `gerente/api.js`. Meta inicial: ≥ 50% en cada módulo |
| G005 | Sin CI/CD: `.github/workflows/` ausente | CI-CD | P2 | S | Carlos | Ninguna | No existe `.github/workflows/` (verificado por glob) | Crear `.github/workflows/ci.yml` con jobs `npm install`, `npm run lint`, `npm test` corriendo en `pull_request` y `push` a `main`. Bloquear merge si fallan. |
| G006 | `tareasService.js` y `notasService.js` con `IS_STUB` usando localStorage | Implementación | P1 | M | Sebastián | Endpoints `/pwa-supv/tasks/*` y `/pwa-supv/notes/*` activos en Odoo | [`src/modules/supervisor-ventas/tareasService.js`](../src/modules/supervisor-ventas/tareasService.js), [`notasService.js`](../src/modules/supervisor-ventas/notasService.js), [`BACKEND_TODO.md:113-141`](../BACKEND_TODO.md) | 1) Implementar modelo Odoo `gf.supv.task` y `gf.supv.note` (sugerencia: `_inherit=['mail.thread']`); 2) habilitar endpoints; 3) cambiar `IS_STUB=false` y descomentar `api()` calls. La firma de los servicios no cambia, las pantallas no se tocan |
| G007 | `lib/api.js` con 6500+ líneas (god-object) | Deuda | P3 | XL | Sebastián | Ninguna técnica; coordinar para evitar conflictos en sprints | [`src/lib/api.js`](../src/lib/api.js) | Plan de refactor en pasos: 1) extraer handlers `directAdmin`, `directProduccion`, etc. a `src/lib/handlers/<modulo>.js`; 2) extraer helpers numéricos y de Odoo (`readModel`, `pickListResponse`) a `src/lib/odoo.js`; 3) dejar `api()` y `routeDirect()` como fachada delgada |
| G008 | `PhotoCapture` envía base64 inline en cada endpoint | Integración | P2 | M | Sebastián | Endpoint `/pwa/evidence/upload` activo y permisos en Odoo | [`src/components/PhotoCapture.jsx`](../src/components/PhotoCapture.jsx), [`BACKEND_TODO.md:158-169`](../BACKEND_TODO.md) | Implementar endpoint que reciba `{file_base64, mime_type, linked_model, linked_id}` y devuelva `{attachment_id, url}`. `PhotoCapture` migra a llamar este endpoint y devolver `attachment_id` para que las pantallas lo referencien |
| G009 | `README.md` desactualizado: dice "Intranet/RRHH" pero el código sirve los 9 roles operativos | Deuda | P3 | S | Yamil | Ninguna | [`README.md:1-3`](../README.md) | Reescribir el README para reflejar scope real: portal operativo de sucursal con 9 roles. Linkear al CODE_MANUAL.md |
| G010 | `ScreenTanque.jsx:84` con `eslint-disable react-hooks/exhaustive-deps` sin justificación | Deuda | P3 | S | Sebastián | Ninguna | [`src/modules/produccion/ScreenTanque.jsx:84`](../src/modules/produccion/ScreenTanque.jsx) | Revisar el effect: si los deps son realmente estables, agregar comentario justificando; si no, agregar los deps faltantes y validar comportamiento |
| G011 | `.env.example` con variables no usadas: `VITE_APP_NAME`, `VITE_APP_URL`, `VITE_APP_ID` | Deuda | P3 | S | Carlos | Ninguna | [`.env.example:33-35`](../.env.example) | Eliminar las 3 variables del `.env.example` y verificar que tampoco están en Vercel Project Settings |
| G012 | TODO en `SYSTEM_MAP.js:92`: PIN verification pendiente para Operador Rolito | Permisos | P2 | M | Sebastián | Endpoint backend que valide PIN durante operación crítica | [`src/modules/shared/SYSTEM_MAP.js:92`](../src/modules/shared/SYSTEM_MAP.js), referencia a [`ScreenCicloRolito.jsx:153`](../src/modules/produccion/ScreenCicloRolito.jsx) | Implementar reto de PIN antes de cerrar ciclo en flujo Rolito; backend valida contra `hr.employee.pin` con throttling |
| G013 | ~~`gf.inventory.posting` con 56% de registros en estado error~~ | Contrato | RESUELTO (cerrado por Sebastián 2026-04-27) | — | Sebastián | — | Hallazgo inicial 2026-04-27 vía `scripts/odoo_audit.py --check-g013`: modelo `gf.inventory.posting` (id=2400) en `gf_production_ops` v18.0.1.0.1; 73 de 130 registros (56.2%) en estado `error`. Causa raíz identificada y corregida el mismo día (4 sub-causas, todas en plaza Iguala). | **Movido a sección "Resueltos durante auditoría".** Resolución ejecutada por Sebastián 2026-04-27: 131 postings procesados (done), 0 en error post-fix, 0 reprocesamientos manuales. Validación de inventario físico pendiente durante rollout de capacitación con conteo aleatorio coordinado por Auxiliar Admin de Iguala. Aprendizaje sistémico documentado en G026 con mitigación preventiva. |
| G014 | ~~Clases duplicadas en `gf_logistics_ops`~~ | Deuda | RESUELTO (falsa alarma) | — | Sebastián (confirmación opcional) | — | **Verificación 2026-04-27 vía `scripts/odoo_audit.py --check-g014`:** módulo `gf_logistics_ops` v18.0.1.0.1; 28 modelos declarados; **0 duplicados intra-módulo**; 9 modelos cross-module overlap, todos consistentes con `_inherit` legítimo (ej. `res.partner` extendido por 75 módulos del ecosistema Odoo, `sale.order` por 42, `stock.picking` por 30). Los 17 records de `ir.model.inherit` confirman uso de herencia. Reporte completo en [`scripts/odoo_audit_all.json`](../scripts/odoo_audit_all.json). | **Movido a sección "Resueltos durante auditoría".** No se encontró evidencia de duplicación de clases. Sebastián puede confirmar opcionalmente con grep en filesystem. |
| G015 | Magic Link comentado pero conservado: 69/71 empleados sin `mobile_phone` | Datos | P3 | S (cuando se reactive) | Sebastián + RRHH | Cargar `mobile_phone` válido en 69 `hr.employee` | [`src/screens/ScreenLogin.jsx:189-245`](../src/screens/ScreenLogin.jsx), audit memoria del proyecto 2026-04-02 | Si NO se va a reactivar Magic Link en los próximos 3 meses, eliminar el bloque comentado para reducir confusión. Si SÍ, cargar los `mobile_phone` faltantes y validar el flujo end-to-end antes de descomentar |
| G016 | Corte y liquidación de ruta persisten en localStorage | Implementación | P1 | M | Sebastián | Endpoints `/pwa-ruta/corte-confirm` y `/pwa-ruta/liquidacion-confirm` activos | [`src/modules/ruta/routeControlService.js:332-407`](../src/modules/ruta/routeControlService.js), [`BACKEND_TODO.md:99-110`](../BACKEND_TODO.md) | Backend persiste `gf.route.plan.corte_done_at`, `corte_done_by_id`, `liquidacion_done_at`, `liquidacion_done_by_id`. Frontend en `saveCierreState()` envía a backend primero y solo usa localStorage como cache |
| G017 | ~~Deploy a `colaboradores.grupofrio.mx` no verificado runtime~~ | Despliegue | RESUELTO (cerrado por Yamil) | — | Yamil | — | Confirmación de Yamil 2026-04-27: deploy productivo activo en [`https://colaboradores-pwa.vercel.app/login`](https://colaboradores-pwa.vercel.app/login) | **Cerrado.** El subdominio default de Vercel está sirviendo correctamente. La discrepancia con el dominio custom esperado se trackea en G024. |
| G018 | Umbrales de cierre de caja validados solo en cliente | Permisos | P2 | M | Sebastián | Lógica server-side de autorización | [`src/modules/admin/forms/AdminCierreForm.jsx`](../src/modules/admin/forms/AdminCierreForm.jsx) (`CIERRE_THRESHOLDS`), [`BACKEND_TODO.md:76-99`](../BACKEND_TODO.md), [`CHANGES.md:65-79`](../CHANGES.md) | Backend rechaza POST `/pwa-admin/cash-closing` si `|difference| > 100` sin nota; marca `needs_manager_auth=True` para `> 1000` y `needs_director_auth=True` para `> 10000`. Implementar `/pwa-admin/cash-closing/authorize` para que gerente/dirección autorice |
| G019 | Rechazo de pallet sin log de responsable | Datos | P2 | S | Sebastián | Campos en `gf.stock.pallet` | [`src/modules/entregas/entregasService.js`](../src/modules/entregas/entregasService.js) (`rejectPallet`), [`BACKEND_TODO.md:179-184`](../BACKEND_TODO.md) | Backend añade `rejected_by_id`, `rejected_at`, `reject_reason` a `gf.stock.pallet`. Frontend ya envía estos campos cuando aplica |
| G020 | Branch `codex/requisition-receipt-cedis` activa pero no mergeada | Deuda | P3 | TBD | Sebastián | Información sobre estado real | `git branch -a` lista la branch en `remotes/origin/` | Sebastián confirma: ¿es trabajo en progreso, abandonado, o experimento? Si abandonado, eliminar. Si en progreso, agregar a sprint. Documentar en este backlog cuando se decida |
| G021 | Branches `feature/voice-*` (3 activas: adr-envelope, base-tests, catalogs-shared) | Deuda | P3 | TBD | Sebastián + Yamil | Información sobre estado real | `git branch -a` lista las 3 ramas en `remotes/origin/` | Para cada branch: ¿lista para merge, en progreso, abandonada? Documentar estado y, si en progreso, asignar fecha de merge tentativa. Si abandonadas, mergear lo rescatable y borrar |
| G022 | `xmlrpc` en `package.json` pero NO se usa en `src/` | Deuda | P3 | S | Carlos | Confirmar con grep en bundle final | [`package.json:33`](../package.json) (`xmlrpc: ^1.3.2` listado como devDep) | Verificar con `grep -r "require('xmlrpc')\|from 'xmlrpc'" src/`. Si no aparece, removerlo de `devDependencies` y `package-lock.json` para reducir surface |
| G023 | `selfDestroying: true` desactiva offline real del Service Worker (gap descubierto en Fase 2) | Despliegue | P3 | M | Sebastián + Yamil | Decisión de producto: ¿queremos modo offline para zonas con WiFi pobre? | [`vite.config.js:18`](../vite.config.js) | Documentar la decisión actual ("v1 sin offline real, SW se autoborra"). Si decidimos activar offline en v2: cambiar a `selfDestroying: false`, definir runtime caching strategy para Odoo (`NetworkOnly` ya está bien para n8n), validar con almacenistas y rutas en sucursal |
| G024 | Dominio custom `colaboradores.grupofrio.mx` no apunta al deploy real `colaboradores-pwa.vercel.app` (gap descubierto en Fase 3) | Despliegue | P2 | S | Carlos + Yamil | Acceso al panel Vercel + DNS de `grupofrio.mx` (GoDaddy/Cloudflare) | Confirmado por Yamil 2026-04-27. URL real: [`https://colaboradores-pwa.vercel.app/login`](https://colaboradores-pwa.vercel.app/login). [`vercel.json`](../vercel.json) y [`README.md:37`](../README.md) referencian dominio custom no configurado. [`.env.example:34`](../.env.example) define `VITE_APP_URL=https://colaboradores.grupofrio.mx`. | 1) En Vercel Project Settings → Domains, agregar `colaboradores.grupofrio.mx`; 2) configurar el CNAME/A record en DNS de `grupofrio.mx` apuntando a Vercel; 3) validar HTTPS auto-provisioned; 4) si la decisión es mantener el subdominio default, actualizar README, `.env.example` y `vercel.json` para reflejar `colaboradores-pwa.vercel.app`. Riesgo: si los operadores reciben links al dominio custom, no cargarán. |
| G025 | ~~Documentación inicial atribuyó `gf.inventory.posting` al módulo equivocado~~ | Deuda | RESUELTO (cerrado en este PR) | — | Claude | — | Verificación 2026-04-27 vía `scripts/odoo_audit.py`: el modelo `gf.inventory.posting` (id=2400) está declarado en módulo `gf_production_ops` v18.0.1.0.1, no en `gf_logistics_ops`. | **Movido a sección "Resueltos durante auditoría".** Corrección aplicada en `CODE_MANUAL.md` §7.7 y en el cuerpo de G013. No afecta endpoints frontend ni comportamiento. |
| G026 | `production_location_id` por defecto incorrecto en líneas de empresa 35 (FABRICACION DE CONGELADOS) — descubierto durante remediación de G013 | Configuración / Datos | P3 (preventivo) | S | Sebastián (cuando tenga ciclo libre) | Ninguna | Las líneas de producción de empresa 35 tenían `production_location_id` apuntando a la ubicación virtual de empresa CSC GF. Odoo 18 bloquea movimientos entre compañías incompatibles → fallos silenciosos en `_action_done()`. Ubicación correcta para empresa 35: `id=1085`. Riesgo de recurrencia al montar nuevas plantas (ej. León). | **Mitigación implementada (cierra el riesgo operativo):** documentación creada por Sebastián en `setup-plantas-produccion.md` (en repo backend de Odoo modules) con tabla de `production_location_id` por empresa, checklist de setup de nueva planta, e incidente de Iguala como caso de estudio. **Mejora futura sugerida (no bloqueante):** agregar validación en modelo `gf.production.line` que rechace guardado si `production_location_id` no pertenece a la company del registro. |
| G027 | ~~Sin audit trail en `gf_saleops` endpoints~~ | Seguridad | RESUELTO (cerrado simultáneamente con G002) | — | Sebastián | — | Endpoints de `gf_saleops` con `required_role` no tenían trazabilidad de quién hizo qué request. Sin observabilidad del vector de privilege escalation. | **Resuelto 2026-05-05.** Modelo Odoo `gf.saleops.guard.log` con campos `endpoint`, `payload_employee_id`, `session_employee_id`, `ip`, `mismatch` (computed), `date`. Cada request a endpoint con `required_role` escribe registro (con `try/except`, nunca bloquea). Cron diario 23:00 envía resumen a equipo de seguridad (mailing list interna). Purga automática a 90 días. **Movido a sección "Resueltos durante auditoría"** con referencia cruzada a G002. |
| G033 | Login service no incluye `x_analytic_account_id` en JWT (requiere RPC fallback en `forecast-create`) | Integración | P3 | S | Sebastián | Ningún bloqueo operativo (existe fallback) | [`src/lib/api.js:6065-6092`](../src/lib/api.js): fallback RPC sobre `hr.employee.x_analytic_account_id` cuando JWT no lo trae. Funciona pero suma ~200ms a la primera creación de forecast tras login. | Ampliar `/api/employee-sign-in` para incluir `x_analytic_account_id` en `result.employee` cuando RRHH lo tenga poblado. El fallback RPC seguiría como red de seguridad pero el camino normal sería 0 RPC adicionales. |

---

## Resueltos recientemente (post-fixes operativos PR #21–#27, ya en `main`)

Bloqueos operativos identificados por QA y resueltos en los PRs #21–#27 antes del PR #28 (auditoría inicial). Estos no llegaron a tener ID en el backlog original porque cuando se escribió la auditoría ya estaban arreglados, pero los listamos aquí explícitamente para trazabilidad.

| ID | Título | Cerrado por | Commit | QA |
|----|--------|-------------|--------|-----|
| G028 | Falso éxito en Merma de Entregas: backend respondía `ok:false` con diagnóstico estructurado pero el frontend lo trataba como éxito y descontaba mostrador en UI | PR #23 [`f94474c`](https://github.com/sebascm0906/colaboradores-pwa/commit/f94474c) | `f94474c` | Defensa `ok:false` agregada en [`ScreenMerma.jsx:130-145`](../src/modules/entregas/ScreenMerma.jsx). Backend devuelve diagnóstico estructurado para falta de stock. Merma positiva con stock libre real sigue pendiente de QA explícito si aplica. |
| G029 | Devoluciones no listaban líneas / no se podían aceptar (BFF usaba campos inexistentes en modelo de Odoo) | PR #24 [`efe5b6f`](https://github.com/sebascm0906/colaboradores-pwa/commit/efe5b6f) | `efe5b6f` | BFF reescrito en [`src/lib/api.js:5664-5800`](../src/lib/api.js) usando campos reales de `gf.route.stop.line`. Payload del cliente: `plan_id + lines[]`. Backend autoriza `almacenista_entregas` por `warehouse_id`. **QA PASS** con return picking creado (no validado automáticamente). |
| G030 | Carga por Forecast no ejecutaba: faltaba wrapper `/pwa-entregas/load-execute` que envuelva el envelope `gf_saleops` | PR #25 [`fa2dd91`](https://github.com/sebascm0906/colaboradores-pwa/commit/fa2dd91) | `fa2dd91` | Nuevo handler en [`src/lib/api.js:5547-5660`](../src/lib/api.js): wrapper sobre `POST /gf/salesops/warehouse/load/execute`, alias legacy `/pwa-entregas/confirm-load`, idempotencia con `already_done:true`. Backend resuelve `analytic_account_id` desde `warehouse_id`. `/pwa-ruta/accept-load` sella `load_sealed=true`. Fixes relacionados en el mismo PR: `ConfirmDialog open`, `/pwa-ruta/my-plan` filtra hoy, `/pwa-ruta/load-lines` cantidad correcta, header `X-GF-Token`. **QA PASS Héctor + Manuel** 2026-04-26. |
| G031 | Supervisor Ventas — `forecast-create` rechazaba con error críptico (`null value in column "analytic_account_id"`) porque la sesión no traía el campo | PR #26 [`2dd0b08`](https://github.com/sebascm0906/colaboradores-pwa/commit/2dd0b08) + commits [`b968e43`](https://github.com/sebascm0906/colaboradores-pwa/commit/b968e43) (RPC fallback) y [`46c262b`](https://github.com/sebascm0906/colaboradores-pwa/commit/46c262b) (channel lowercase) | `2dd0b08`, `b968e43`, `46c262b` | Cascada de resolución implementada en [`src/lib/api.js:6046-6145`](../src/lib/api.js): `body.analytic_account_id` → `body.sucursal` → JWT `employee.x_analytic_account_id` → **RPC fallback** sobre `hr.employee.x_analytic_account_id`. Si nada responde, lanza `ApiError` con `code: 'missing_x_analytic_account_id'` y mensaje accionable. Normaliza `channel` a lowercase. **QA PASS Aida** 2026-04-27 (forecast id=18, state=`draft`, analytic_account_id=820, channel=`van`). |
| G032 | Inventario Entregas no mostraba stock libre real (frontend recibía estructura cruda en lugar de items procesados) | PR #27 [`52b7b5f`](https://github.com/sebascm0906/colaboradores-pwa/commit/52b7b5f) | `52b7b5f` | BFF en [`src/lib/api.js:5858-5950`](../src/lib/api.js) ahora desempaca `readModelSorted` con `pickListResponse`; pantalla [`ScreenInventarioEntregas.jsx`](../src/modules/entregas/ScreenInventarioEntregas.jsx) muestra `on_hand_qty`, `reserved_qty`, `available_qty` (regla `available = quantity - reserved_quantity`). Domain `child_of(lot_stock_id)`. **QA PASS** con producto 760 contra totales reales. |

### Confirmaciones de fixes backend asociados (no aplican al PWA)

Estos fueron corregidos en backend Odoo (módulos `gf_saleops`, `gf_logistics_ops`) y no requieren cambios en el PWA. Se listan como **dependencia externa confirmada** para evitar re-abrirlos como gaps:

- **Tenancy split van + CEDIS para `accept-load`** (Sebastián, 2026-04-26): el guard ahora separa correctamente al jefe_ruta (van) del almacenista (CEDIS) en validaciones cruzadas.
- **`load/execute` resolviendo Branch Config por `warehouse_id`** (Sebastián, 2026-04-26): el endpoint ya no requiere que el BFF mande `analytic_account_id` explícito; lo deriva del warehouse.
- **Devoluciones permitiendo `almacenista_entregas` por warehouse** (Sebastián, 2026-04-26): autorización por warehouse en lugar de por rol global.
- **PT → Entregas funcionando end-to-end** (Sebastián, 2026-04-27): tras el cierre de G013 en `gf_production_ops`, el flujo completo de recepción → traspaso a Entregas opera sin errores.
- **Vehicle checklist backend validado** (Sebastián, 2026-04-25): endpoints `/pwa-ruta/vehicle-checklist*` con backend operativo, integrados en frontend en [`src/modules/ruta/api.js`](../src/modules/ruta/api.js).
- **`VITE_GF_SALESOPS_TOKEN` configurado en Vercel** (Sebastián, 2026-04-26): variable presente en Vercel Project Settings; el deploy actual la consume correctamente. Si falta, los endpoints `/gf/salesops/*` responden `UNAUTHORIZED: X-GF-Token inválido`.

---

## Resueltos durante auditoría

| ID | Título | Cerrado el | Evidencia | Notas |
|----|--------|-----------|-----------|-------|
| G002 | Privilege escalation en `gf_saleops` via `employee_id` no verificado en payload | 2026-05-05 (Fase 4, Sebastián) | Fix en módulo `gf_saleops`: `controllers/main.py` y `controllers/supervisor.py` ahora resuelven el empleado desde `X-GF-Employee-Token`; `services/guard.py` overridea `role_key` desde `_session_employee_id` (no del payload). Rollout gradual 2026-04-29 22:00 CST modo permisivo → 3 días limpios (cero mismatches, cero `session_employee=0` inesperados) → modo estricto activado 2026-05-05 AM con flag `require_employee_token=True`. | Originalmente P1 con título incorrecto ("JWT alg:none"). El sistema NO usa JWT — los tokens son opacos (`gf_employee_token` en BD) y estáticos (`gf_salesops_token` en `ir.config_parameter`). **Diagnóstico real:** guard derivaba rol del `employee_id` en body, no del token autenticado. Endpoints expuestos: 16 con `required_role="supervisor_ventas"` + 1 con `gerente_unidad`. Sistema de logging permanente `gf.saleops.guard.log` (ver G027). Detalle completo en cuerpo del backlog. |
| G013 | `gf.inventory.posting` con 73 de 130 registros (56.2%) en estado error | 2026-04-27 (Fase 3, Sebastián) | Hallazgo vía `scripts/odoo_audit.py --check-g013`; resolución por Sebastián el mismo día con 4 sub-causas corregidas. Post-fix: 131 done, 0 error, 0 reprocesamientos manuales. | **Causa raíz (4 sub-causas, todas en plaza Iguala):** (1) Líneas 1 y 2 con `production_location_id` apuntando a ubicación virtual de empresa CSC GF en lugar de FABRICACION DE CONGELADOS (empresa 35); Odoo 18 bloquea movimientos entre compañías incompatibles. Corregido a `id=1085`. (2) Turnos 21 y 25 sin línea asignada — corregido. (3) 10 entradas de packing sin línea resuelta — corregidas. (4) Línea 1 sin `mp_turno_location_id` configurado (`PIGU/MP-IGUALA/PROCESO-BARRA`) — corregido. **Validación de inventario físico:** pendiente, durante rollout de capacitación con conteo aleatorio coordinado por Auxiliar Admin de Iguala. **Aprendizaje sistémico:** ver G026. |
| G014 | Clases duplicadas en `gf_logistics_ops` | 2026-04-27 (Fase 3) | Verificación read-only contra producción vía [`scripts/odoo_audit.py --check-g014`](../scripts/odoo_audit.py). 28 modelos declarados; 0 duplicados intra-módulo; 9 cross-module overlaps consistentes con `_inherit` legítimo; 17 `ir.model.inherit` records lo confirman. Reporte completo en [`scripts/odoo_audit_all.json`](../scripts/odoo_audit_all.json) campo `g014`. | Originalmente P1. **Falsa alarma.** Sebastián puede confirmar opcionalmente con grep en filesystem si quiere certeza absoluta, pero la evidencia desde XMLRPC es suficiente. |
| G017 | Deploy a `colaboradores.grupofrio.mx` no verificado runtime | 2026-04-27 (Fase 3) | Confirmación de Yamil: deploy activo en `colaboradores-pwa.vercel.app/login`. | Subdominio default de Vercel funciona. La parte del dominio custom no configurado se trackea ahora en G024 con severidad P2. |
| G025 | Documentación inicial atribuyó `gf.inventory.posting` al módulo equivocado (`gf_logistics_ops` en lugar de `gf_production_ops`) | 2026-04-27 (Fase 3) | Verificación read-only contra producción vía `scripts/odoo_audit.py`. Corrección aplicada al manual y al cuerpo de G013. | No afecta endpoints frontend ni comportamiento — solo precisión documental. |
| G027 | Sin audit trail en `gf_saleops` endpoints con `required_role` | 2026-05-05 (Fase 4, Sebastián) | Modelo `gf.saleops.guard.log` activo permanentemente. Cada request a endpoint con `required_role` escribe registro (con `try/except`, nunca bloquea). Cron diario 23:00 envía resumen al equipo de seguridad. Purga automática a 90 días. | Cerrado en simultáneo con G002. Provee observabilidad permanente del vector y de cualquier intento futuro. |

## Notas de la Fase 2

### Gaps nuevos descubiertos (no estaban en el inventario inicial)

- **G017** — Deploy runtime no verificado (era nota, lo formalizamos como gap operativo). **Cerrado en Fase 3.**
- **G018** — Umbrales cierre solo cliente (estaba en BACKEND_TODO #1, lo elevo aquí con P2 + ID propio).
- **G019** — Pallet reject sin log (estaba en BACKEND_TODO #8, idem).
- **G020** — Branch `codex/*` (descubierto durante git inspect en Fase 0).
- **G021** — Branches `feature/voice-*` (idem).
- **G022** — Dependencia `xmlrpc` huérfana (descubierto leyendo `package.json` durante Fase 2).
- **G023** — SW `selfDestroying:true` (descubierto leyendo `vite.config.js` durante Fase 2 — afecta UX en zonas con WiFi pobre).

### Gaps nuevos descubiertos en Fase 3 (verificación P1 contra Odoo producción)

- **G024** — Dominio custom `colaboradores.grupofrio.mx` no apunta al deploy real (descubierto al confirmar URL real de Yamil). Severidad P2.
- **G025** — `gf.inventory.posting` está declarado en `gf_production_ops`, no en `gf_logistics_ops` como asumía la documentación inicial (descubierto vía `scripts/odoo_audit.py`). Severidad P3. **Cerrado en Fase 4.**

### Gaps nuevos descubiertos en Fase 4 (cierre del ciclo P0/P1)

- **G026** — `production_location_id` por defecto incorrecto en líneas de empresa 35 (descubierto durante la remediación de G013 por Sebastián). Severidad P3, **entró ya con mitigación implementada** (documentación de setup). Mejora futura sugerida: validador en modelo `gf.production.line`.
- **G027** — Sin audit trail en `gf_saleops` endpoints con `required_role` (descubierto al inspeccionar el guard durante el fix de G002). Severidad inicial P2. **Cerrado simultáneamente con G002** mediante el modelo `gf.saleops.guard.log` + cron diario.

### Reclasificaciones de Fase 4

- **G002** — Título original "JWT local unsigned (alg:'none')" era incorrecto. **El sistema NO usa JWT.** Los tokens son opacos (`gf_employee_token` en BD) y estáticos (`gf_salesops_token` en `ir.config_parameter`). El vector real era privilege escalation en `gf_saleops/services/guard.py:52` que derivaba el rol del `employee_id` enviado en body, combinado con `gf_salesops_token` global compartido. Renombrado y cerrado tras fix de Sebastián entre 2026-04-29 y 2026-05-05.

Todos marcados con su severidad propuesta. **Ninguno baja la severidad de los 15 obligatorios; G013, G014 y G016 mantienen P1 como pediste.**

### Restricciones cumplidas

- **No se marcó ningún gap como "resuelto" o "validado" sin evidencia.**
- **No se bajó la severidad mínima propuesta** para los 15 obligatorios. G016 que originalmente no estaba listado se incluyó con P1 porque la persistencia en localStorage afecta directamente al rol Jefe de Ruta (consistencia con la regla de "P1 = bloquea uno o más roles").
- **No se tocó código de la app durante la Fase 2.**
- **Roles fuera de scope** (`auxiliar_produccion`, `auxiliar_ruta`, `direccion_general`, `operador_torres`, `director_ti`, `auxiliar_ti`, `jefe_legal`) no fueron auditados con la misma profundidad. Documentados brevemente en `CODE_MANUAL.md §8.10`.

### Bloqueadores backend Odoo — formato pedido en confirmación 4

| Gap | Archivo Odoo a revisar | Endpoint frontend que lo detonaría | Test manual reproducible |
|-----|------------------------|-------------------------------------|---------------------------|
| G013 | `gf_logistics_ops/models/inventory_posting.py` (o el archivo que defina `gf.inventory.posting`) | `POST /pwa-pt/reception-create` (callers en [`src/modules/almacen-pt/ScreenRecepcion.jsx`](../src/modules/almacen-pt/ScreenRecepcion.jsx), [`ptService.js`](../src/modules/almacen-pt/ptService.js)) | 1) Login `almacenista_pt`; 2) `/almacen-pt/recepcion`, capturar recepción de N unidades del producto P en warehouse W; 3) consultar en Odoo `stock.quant` filtrando por `product_id=P, location_id ⊂ warehouse W`; 4) la diferencia esperada es N. Si no actualiza, el bug es real |
| G014 | todo `gf_logistics_ops/models/` (auditoría de clases con nombre repetido) | `/pwa-admin/liquidaciones/*`, `/pwa-ruta/liquidation`, `/pwa-pt/transfer-orchestrate` | 1) En Odoo dev/staging, `git log gf_logistics_ops` y buscar dos archivos que registren modelo con mismo `_name`; 2) ejecutar `odoo --test-enable -i gf_logistics_ops`; 3) si Odoo arranca pero un modelo redefine campos del otro, hay duplicidad efectiva |

---

## Anexo A — Mapeo de gaps activos a roles afectados (post-fixes operativos)

| Rol | Gaps activos que lo bloquean total/parcial |
|-----|---------------------------------------------|
| Gerente | G001 (KPIs mock), G018 (umbrales), G024 (dominio) |
| Auxiliar Admin | G018, G019, G024 |
| Operador Rolito | G012 (PIN), G024 |
| Operador Barra | G024 |
| Jefe de Producción | G024 |
| Almacenista PT | G008 (foto), G024 |
| Almacenista Entregas | G008, G019, G024 |
| Jefe de Ruta | G016 (corte/liquidación localStorage), G024 |
| Supervisor de Ventas | G001 (KPIs mock), G006 (tareas/notas), G024, G033 (latencia inicial al crear forecast hasta que JWT incluya `x_analytic_account_id`) |
| Auxiliar de Producción (secundario) | mismos que Operador Rolito + Operador Barra |
| Auxiliar de Ruta (secundario) | mismos que Jefe de Ruta |

## Anexo B — Próximos pasos sugeridos (actualizado tras post-fixes operativos PR #21–#27)

1. **Sprint 1 (esta semana):** **G024** (dominio custom) — Carlos/Yamil en < 1 día. **G001** (Metabase) — Sebastián cuando se priorice.
2. **Sprint 2 (1-2 semanas):** G003 (tokens en bundle), G006 (tareas/notas backend), G016 (corte/liquidación backend).
3. **Sprint 3 (2 semanas):** G018 (umbrales server-side), G019 (pallet reject log), G012 (PIN Rolito).
4. **Continuo:** G004, G005 — tests + CI.
5. **Limpieza paralela:** G007 (refactor api.js), G008 (evidence upload), G009 (README), G010 (eslint-disable), G011 (env vars), G015 (Magic Link), G020, G021, G022, G023, G026 (validador production_location_id), G033 (incluir `x_analytic_account_id` en JWT).

---

**Última actualización:** 2026-04-27 · Actualización post-fixes operativos PR #21–#29 · 5 gaps retroactivos cerrados (G028–G032), 1 nuevo gap abierto (G033) · auto-generado por Claude · necesita review humano antes de planeación.
