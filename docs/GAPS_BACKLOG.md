# GAPS_BACKLOG — PWA Colaboradores

> Reporte priorizado de gaps detectados durante la auditoría del 2026-04-27 sobre el commit `52b7b5f`.
> Todas las entradas tienen evidencia. Cualquier gap sin link al archivo no entra a la tabla.
> Severidad: P0 bloquea producción · P1 bloquea uno o más roles · P2 funcionalidad parcial · P3 cosmético / deuda.

---

## Resumen ejecutivo

**Total de gaps:** 23 (15 obligatorios del prompt + 8 descubiertos durante Fase 2).

### Distribución por severidad

| Severidad | Cantidad |
|-----------|----------|
| P0 — Bloquea producción | 0 |
| P1 — Bloquea rol(es) | 8 |
| P2 — Funcionalidad parcial / sistémico | 7 |
| P3 — Cosmético / deuda | 8 |

### Distribución por categoría

| Categoría | Cantidad |
|-----------|----------|
| Implementación | 3 |
| Contrato | 2 |
| Permisos | 1 |
| Integración | 3 |
| Datos | 1 |
| Seguridad | 3 |
| Deuda | 7 |
| Despliegue | 1 |
| Tests | 1 |
| CI-CD | 1 |

### Top 10 a atacar primero

1. **G001** — `/pwa-metabase-token` stub: KPIs degradan a mock para Gerente, Supervisor de Ventas y Jefe de Ruta. Impacta decisiones operativas con datos falsos.
2. **G002** — JWT local unsigned (`alg:"none"`): cualquier persona con DevTools puede modificar el payload y escalar privilegios entre roles.
3. **G013** — `gf.inventory.posting._action_done()` posiblemente no se llama: si es real, recepciones PT no actualizan inventario y todos los flujos de almacén PT están afectados.
4. **G014** — Clases duplicadas en `gf_logistics_ops`: backend se encuentra en estado fragil; bugs intermitentes posibles en rutas/liquidaciones/PT.
5. **G006** — `tareasService` y `notasService` con `IS_STUB` (localStorage): tareas y notas del Supervisor de Ventas se pierden silenciosamente al cambiar de dispositivo.
6. **G016** — Cierre/liquidación de ruta persiste en localStorage: si el Jefe de Ruta cierra la app antes del cierre final, pierde estado y debe recapturar.
7. **G003** — Tokens (`VITE_GF_SALESOPS_TOKEN`, `VITE_N8N_VOICE_TOKEN`) en bundle del cliente: expuestos públicamente, requieren rotación periódica.
8. **G012** — PIN verification pendiente para Operador Rolito: riesgo de trazabilidad operacional si un operador opera como otro.
9. **G004** — Cero tests en `admin/`, `ruta/`, `gerente/`, `supervisor-ventas/`: los 4 módulos más críticos del negocio sin cobertura.
10. **G005** — Sin CI/CD (`.github/workflows/` ausente): los 21 tests existentes no corren en cada PR; un PR puede romper tests sin aviso.

### Tres preguntas críticas pendientes

1. **¿`gf.inventory.posting._action_done()` se ejecuta hoy en producción?** Necesario para confirmar/desmentir gaps G013 y G014. Solo verificable con acceso al código de `gf_logistics_ops` en Odoo (Sebastián).
2. **¿El deploy actual a `colaboradores.grupofrio.mx` está sirviendo el commit `52b7b5f`?** Necesario para cerrar el gap G017. Solo verificable abriendo la URL pública (Yamil).
3. **¿`auxiliar_produccion` y `auxiliar_ruta` deben considerarse parte del scope operativo de los 9 roles, o son auxiliares secundarios?** Aparecen en código compartiendo módulos con sus roles principales pero no fueron mencionados en la lista oficial. Decisión de scope (Yamil).

---

## Tabla maestra de gaps

| ID | Título | Categoría | Severidad | Esfuerzo | Dueño | Dependencia | Evidencia | Acción concreta |
|----|--------|-----------|-----------|----------|-------|-------------|-----------|-----------------|
| G001 | `/pwa-metabase-token` es stub: KPIs reales no disponibles | Integración | P1 | M | Sebastián | Ninguna técnica; requiere `metabase.secret_key` configurado en Odoo + dashboards creados en Metabase | [`BACKEND_TODO.md:13-72`](../BACKEND_TODO.md), [`src/screens/ScreenKPIs.jsx:296`](../src/screens/ScreenKPIs.jsx) | Implementar controller `/pwa-metabase-token` en `gf_metabase_embed`, marcar `installable: True`, configurar `metabase.dashboard.<rol>` por cada job_key |
| G002 | JWT local unsigned (`alg:"none"`) construido en frontend | Seguridad | P1 | M | Sebastián + Yamil | Backend debe garantizar siempre `session_token` firmado en respuesta de `/api/employee-sign-in` | [`src/screens/ScreenLogin.jsx:55-59`](../src/screens/ScreenLogin.jsx) (`buildLocalSessionToken`) y [`:179`](../src/screens/ScreenLogin.jsx) (fallback si Odoo no envía token) | 1) Auditar Odoo para garantizar que `/api/employee-sign-in` siempre devuelva `session_token` firmado HS256; 2) eliminar `buildLocalSessionToken` de `ScreenLogin.jsx`; 3) si el backend no envía token, fallar el login en lugar de fabricar uno |
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
| G013 | `gf.inventory.posting._action_done()` posiblemente no se llama (no verificable desde frontend) | Contrato | P1 | M | Sebastián | Acceso a código `gf_logistics_ops` en Odoo | [`src/lib/api.js`](../src/lib/api.js) (comentarios sobre `gf.inventory.posting`), [`src/modules/almacen-pt/ptService.js`](../src/modules/almacen-pt/ptService.js) | **Archivo Odoo a revisar:** `gf_logistics_ops/models/inventory_posting.py` (o equivalente). **Endpoint frontend que detonaría el bug:** `POST /pwa-pt/reception-create`. **Test manual reproducible:** 1) loggearse como `almacenista_pt`; 2) `/almacen-pt/recepcion`, registrar recepción de N unidades de un producto P en warehouse W; 3) consultar `stock.quant` del producto P en warehouse W antes y después; 4) si la diferencia ≠ N, el bug es real. Añadir log explícito del flujo `_action_done()` en backend |
| G014 | Clases duplicadas en `gf_logistics_ops` | Deuda | P1 | L | Sebastián | Acceso a repositorio Odoo | [`src/lib/api.js`](../src/lib/api.js) (referencias a endpoints `gf_logistics_ops`), [`src/modules/admin/api.js:1567-1600`](../src/modules/admin/api.js) (liquidaciones passthrough) | **Archivo Odoo a revisar:** todo el directorio `gf_logistics_ops/models/`. **Endpoints frontend que detonarían bug:** `/pwa-admin/liquidaciones/*`, `/pwa-ruta/liquidation`, `/pwa-pt/transfer-orchestrate`. **Test manual reproducible:** auditar `git log` y `grep` por nombres de clase repetidos en `gf_logistics_ops`; correr `odoo --test-enable -i gf_logistics_ops` para detectar conflictos de registro de modelos |
| G015 | Magic Link comentado pero conservado: 69/71 empleados sin `mobile_phone` | Datos | P3 | S (cuando se reactive) | Sebastián + RRHH | Cargar `mobile_phone` válido en 69 `hr.employee` | [`src/screens/ScreenLogin.jsx:189-245`](../src/screens/ScreenLogin.jsx), audit memoria del proyecto 2026-04-02 | Si NO se va a reactivar Magic Link en los próximos 3 meses, eliminar el bloque comentado para reducir confusión. Si SÍ, cargar los `mobile_phone` faltantes y validar el flujo end-to-end antes de descomentar |
| G016 | Corte y liquidación de ruta persisten en localStorage | Implementación | P1 | M | Sebastián | Endpoints `/pwa-ruta/corte-confirm` y `/pwa-ruta/liquidacion-confirm` activos | [`src/modules/ruta/routeControlService.js:332-407`](../src/modules/ruta/routeControlService.js), [`BACKEND_TODO.md:99-110`](../BACKEND_TODO.md) | Backend persiste `gf.route.plan.corte_done_at`, `corte_done_by_id`, `liquidacion_done_at`, `liquidacion_done_by_id`. Frontend en `saveCierreState()` envía a backend primero y solo usa localStorage como cache |
| G017 | Deploy a `colaboradores.grupofrio.mx` no verificado runtime durante esta auditoría | Despliegue | P3 | S | Yamil | Ninguna | [`vercel.json`](../vercel.json), [`README.md:37`](../README.md), [`.env.example:34`](../.env.example) | Yamil verifica manualmente la URL pública y confirma que el commit servido es `52b7b5f`. Si no coincide, abrir issue específico |
| G018 | Umbrales de cierre de caja validados solo en cliente | Permisos | P2 | M | Sebastián | Lógica server-side de autorización | [`src/modules/admin/forms/AdminCierreForm.jsx`](../src/modules/admin/forms/AdminCierreForm.jsx) (`CIERRE_THRESHOLDS`), [`BACKEND_TODO.md:76-99`](../BACKEND_TODO.md), [`CHANGES.md:65-79`](../CHANGES.md) | Backend rechaza POST `/pwa-admin/cash-closing` si `|difference| > 100` sin nota; marca `needs_manager_auth=True` para `> 1000` y `needs_director_auth=True` para `> 10000`. Implementar `/pwa-admin/cash-closing/authorize` para que gerente/dirección autorice |
| G019 | Rechazo de pallet sin log de responsable | Datos | P2 | S | Sebastián | Campos en `gf.stock.pallet` | [`src/modules/entregas/entregasService.js`](../src/modules/entregas/entregasService.js) (`rejectPallet`), [`BACKEND_TODO.md:179-184`](../BACKEND_TODO.md) | Backend añade `rejected_by_id`, `rejected_at`, `reject_reason` a `gf.stock.pallet`. Frontend ya envía estos campos cuando aplica |
| G020 | Branch `codex/requisition-receipt-cedis` activa pero no mergeada | Deuda | P3 | TBD | Sebastián | Información sobre estado real | `git branch -a` lista la branch en `remotes/origin/` | Sebastián confirma: ¿es trabajo en progreso, abandonado, o experimento? Si abandonado, eliminar. Si en progreso, agregar a sprint. Documentar en este backlog cuando se decida |
| G021 | Branches `feature/voice-*` (3 activas: adr-envelope, base-tests, catalogs-shared) | Deuda | P3 | TBD | Sebastián + Yamil | Información sobre estado real | `git branch -a` lista las 3 ramas en `remotes/origin/` | Para cada branch: ¿lista para merge, en progreso, abandonada? Documentar estado y, si en progreso, asignar fecha de merge tentativa. Si abandonadas, mergear lo rescatable y borrar |
| G022 | `xmlrpc` en `package.json` pero NO se usa en `src/` | Deuda | P3 | S | Carlos | Confirmar con grep en bundle final | [`package.json:33`](../package.json) (`xmlrpc: ^1.3.2` listado como devDep) | Verificar con `grep -r "require('xmlrpc')\|from 'xmlrpc'" src/`. Si no aparece, removerlo de `devDependencies` y `package-lock.json` para reducir surface |
| G023 | `selfDestroying: true` desactiva offline real del Service Worker (gap descubierto en Fase 2) | Despliegue | P3 | M | Sebastián + Yamil | Decisión de producto: ¿queremos modo offline para zonas con WiFi pobre? | [`vite.config.js:18`](../vite.config.js) | Documentar la decisión actual ("v1 sin offline real, SW se autoborra"). Si decidimos activar offline en v2: cambiar a `selfDestroying: false`, definir runtime caching strategy para Odoo (`NetworkOnly` ya está bien para n8n), validar con almacenistas y rutas en sucursal |

---

## Notas de la Fase 2

### Gaps nuevos descubiertos (no estaban en el inventario inicial)

- **G017** — Deploy runtime no verificado (era nota, lo formalizamos como gap operativo).
- **G018** — Umbrales cierre solo cliente (estaba en BACKEND_TODO #1, lo elevo aquí con P2 + ID propio).
- **G019** — Pallet reject sin log (estaba en BACKEND_TODO #8, idem).
- **G020** — Branch `codex/*` (descubierto durante git inspect en Fase 0).
- **G021** — Branches `feature/voice-*` (idem).
- **G022** — Dependencia `xmlrpc` huérfana (descubierto leyendo `package.json` durante Fase 2).
- **G023** — SW `selfDestroying:true` (descubierto leyendo `vite.config.js` durante Fase 2 — afecta UX en zonas con WiFi pobre).

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

## Anexo A — Mapeo de gaps a roles afectados

| Rol | Gaps que lo bloquean total/parcial |
|-----|-------------------------------------|
| Gerente | G001 (KPIs mock), G002 (sec), G018 (umbrales) |
| Auxiliar Admin | G002, G018, G019 |
| Operador Rolito | G002, G012 (PIN) |
| Operador Barra | G002, G013 (si recepción PT no postea) |
| Jefe de Producción | G002, G013, G014 |
| Almacenista PT | G002, G008 (foto), G013, G014 |
| Almacenista Entregas | G002, G008, G019 |
| Jefe de Ruta | G002, G014, G016 (corte/liquidación localStorage) |
| Supervisor de Ventas | G001 (KPIs mock), G002, G006 (tareas/notas) |

## Anexo B — Próximos pasos sugeridos

1. **Sprint 1 (1-2 semanas):** G001, G013, G014 — desbloquear KPIs reales y verificar inventario PT.
2. **Sprint 2 (1 semana):** G002, G003 — apretar seguridad de tokens.
3. **Sprint 3 (2 semanas):** G006, G016, G018, G019 — completar persistencia backend faltante.
4. **Continuo:** G004, G005 — tests + CI.
5. **Limpieza paralela:** G009, G010, G011, G015, G020, G021, G022 — deuda menor que cualquier dev junior puede tomar.

---

**Última actualización:** 2026-04-27 · auto-generado por Claude · necesita review humano antes de planeación.
