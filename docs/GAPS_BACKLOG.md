# GAPS_BACKLOG — PWA Colaboradores

> Reporte priorizado de gaps detectados durante la auditoría del 2026-04-27 sobre el commit `52b7b5f`.
> Todas las entradas tienen evidencia. Cualquier gap sin link al archivo no entra a la tabla.
> Severidad: P0 bloquea producción · P1 bloquea uno o más roles · P2 funcionalidad parcial · P3 cosmético / deuda.

---

## Resumen ejecutivo

**Total de gaps:** 25 (15 obligatorios + 8 Fase 2 + 2 Fase 3 verificación). De ellos, **2 cerrados durante esta sesión** (G014 falsa alarma, G017 confirmado) → 23 gaps activos en backlog.

### Distribución por severidad (gaps activos)

| Severidad | Cantidad | Cambios respecto versión inicial |
|-----------|----------|----------------------------------|
| P0 — Bloquea producción | 0 | sin cambio |
| P1 — Bloquea rol(es) | 7 | -1 (G014 movido a resueltos) |
| P2 — Funcionalidad parcial / sistémico | 8 | +1 (G024 dominio custom) |
| P3 — Cosmético / deuda | 8 | +1 (G025 corrección documental), -1 (G017 cerrado) |

### Distribución por categoría (activos)

| Categoría | Cantidad |
|-----------|----------|
| Implementación | 3 |
| Contrato | 2 |
| Permisos | 1 |
| Integración | 3 |
| Datos | 1 |
| Seguridad | 3 |
| Deuda | 8 |
| Despliegue | 2 |
| Tests | 1 |
| CI-CD | 1 |

### Top 10 a atacar primero

1. **G013** — **CONFIRMADO BLOQUEADOR REAL EN PRODUCCIÓN 2026-04-27.** 73 de 130 registros (56.2%) de `gf.inventory.posting` en estado `error`. `_action_done()` falla en más de la mitad de las recepciones PT. Bloquea Almacenista PT, Almacenista Entregas y Operador Barra (depende de harvest+reception).
2. **G001** — `/pwa-metabase-token` stub: KPIs degradan a mock para Gerente, Supervisor de Ventas y Jefe de Ruta. Decisiones operativas con datos falsos.
3. **G002** — JWT local unsigned (`alg:"none"`): escalada de privilegios trivial por cualquiera con DevTools.
4. **G024** — Dominio custom `colaboradores.grupofrio.mx` no apunta al deploy real (`colaboradores-pwa.vercel.app`). Links operativos en SMS/WA/email no cargan.
5. **G006** — `tareasService` y `notasService` con `IS_STUB` (localStorage): datos del Supervisor de Ventas se pierden al cambiar dispositivo.
6. **G016** — Cierre/liquidación de ruta persiste en localStorage: Jefe de Ruta pierde estado si cierra app antes del cierre final.
7. **G003** — Tokens en bundle del cliente: requieren rotación periódica + migración a server-side proxy.
8. **G012** — PIN verification pendiente para Operador Rolito: riesgo de trazabilidad.
9. **G004** — Cero tests en módulos más críticos (admin, ruta, gerente, supervisor-ventas).
10. **G005** — Sin CI/CD: tests no corren en PRs.

### Tres preguntas críticas pendientes

1. **¿Por qué falla `gf.inventory.posting._action_done()` en 56% de los registros recientes?** El modelo está declarado en módulo `gf_production_ops` (no `gf_logistics_ops` como asumía la documentación inicial — corregido en G025). Ver IDs muestra en G013. Sebastián debe inspeccionar logs de error en backend Odoo y el código del método.
2. **¿Por qué el dominio custom `colaboradores.grupofrio.mx` no está activo?** ¿Falta configurar DNS en GoDaddy/Cloudflare, o falta agregar el dominio en Vercel Project Settings, o el deploy productivo es intencionalmente subdominio default? Yamil decide.
3. **¿Cómo se diferencia el flujo de un Auxiliar de Producción vs su titular en runtime?** El `ProductionOperatorRoute` valida solo `operador_barra` y `operador_rolito`, pero `auxiliar_produccion` está en `MODULE_ROLE_VARIANTS`. Si un empleado tiene SOLO `auxiliar_produccion` sin `additional_job_keys`, ¿puede operar? Sebastián verifica.

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
| G013 | **CONFIRMADO BLOQUEADOR REAL** en producción: `gf.inventory.posting` con 56% de registros en estado error | Contrato | P1 | M | Sebastián | Acceso a logs de `gf_production_ops` en Odoo | **Verificación 2026-04-27 vía `scripts/odoo_audit.py --check-g013`:** modelo `gf.inventory.posting` (id=2400) declarado en módulo **`gf_production_ops` v18.0.1.0.1** (NO `gf_logistics_ops` como se asumía); 130 registros totales; **distribución de estado: 73 en `error` (56.2%), 57 en `done` (43.8%)**; 4 stuck (>7d sin done); IDs de error muestra: `[778, 777, 776, 775, 774, 773, 772, 771, 770, 769, 768, 767, 766, 765, 764, 763, 747, 625, 623, 622]`. Reporte completo en [`scripts/odoo_audit_all.json`](../scripts/odoo_audit_all.json). | **Archivo Odoo a revisar:** `gf_production_ops/models/inventory_posting.py` (modelo `gf.inventory.posting`) — específicamente el método que transiciona de `processing`/`pending` a `done`. **Endpoint frontend que detona el bug:** `POST /pwa-pt/reception-create`. **Test manual reproducible:** 1) abrir un registro en error de los IDs listados; 2) revisar campo de error/log en chatter; 3) intentar `_action_done()` manual y capturar excepción; 4) corregir root cause y revalidar 73 registros pendientes. **Acción inmediata:** revisar el chatter o `error_message` (si el modelo lo tiene) de los IDs 778-763 para identificar la excepción común. |
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
| G025 | Documentación inicial atribuyó `gf.inventory.posting` al módulo equivocado (gap descubierto en Fase 3 verificación) | Deuda | P3 | S | Claude (este PR) | Ninguna | Verificación 2026-04-27 vía `scripts/odoo_audit.py`: el modelo `gf.inventory.posting` (id=2400) está declarado en módulo `gf_production_ops` v18.0.1.0.1, no en `gf_logistics_ops` como asumían los comentarios en [`src/lib/api.js`](../src/lib/api.js) y la documentación inicial. | Ya corregido en `CODE_MANUAL.md` §7.7 y en G013. Sebastián puede agregar comentario explícito en código frontend si quiere reforzar (no urgente). Esta corrección no afecta los endpoints frontend ni el comportamiento. |

---

## Resueltos durante auditoría

| ID | Título | Cerrado el | Evidencia | Notas |
|----|--------|-----------|-----------|-------|
| G014 | Clases duplicadas en `gf_logistics_ops` | 2026-04-27 (Fase 3) | Verificación read-only contra producción vía [`scripts/odoo_audit.py --check-g014`](../scripts/odoo_audit.py). 28 modelos declarados; 0 duplicados intra-módulo; 9 cross-module overlaps consistentes con `_inherit` legítimo; 17 `ir.model.inherit` records lo confirman. Reporte completo en [`scripts/odoo_audit_all.json`](../scripts/odoo_audit_all.json) campo `g014`. | Originalmente P1. **Falsa alarma.** Sebastián puede confirmar opcionalmente con grep en filesystem si quiere certeza absoluta, pero la evidencia desde XMLRPC es suficiente. |
| G017 | Deploy a `colaboradores.grupofrio.mx` no verificado runtime | 2026-04-27 (Fase 3) | Confirmación de Yamil: deploy activo en `colaboradores-pwa.vercel.app/login`. | Subdominio default de Vercel funciona. La parte del dominio custom no configurado se trackea ahora en G024 con severidad P2. |

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
- **G025** — `gf.inventory.posting` está declarado en `gf_production_ops`, no en `gf_logistics_ops` como asumía la documentación inicial (descubierto vía `scripts/odoo_audit.py`). Severidad P3 (corrección documental, ya aplicada al manual).

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
| Gerente | G001 (KPIs mock), G002 (seguridad JWT), G018 (umbrales), G024 (dominio) |
| Auxiliar Admin | G002, G018, G019, G024 |
| Operador Rolito | G002, G012 (PIN), G024 |
| Operador Barra | G002, G013 (recepción PT 56% en error), G024 |
| Jefe de Producción | G002, G013 (afecta supervisión PT), G024 |
| Almacenista PT | G002, G008 (foto), G013 (CONFIRMADO 56% error), G024 |
| Almacenista Entregas | G002, G008, G013 (depende de recepción PT funcional), G019, G024 |
| Jefe de Ruta | G002, G016 (corte/liquidación localStorage), G024 |
| Supervisor de Ventas | G001 (KPIs mock), G002, G006 (tareas/notas), G024 |
| Auxiliar de Producción (secundario) | mismos que Operador Rolito + Operador Barra |
| Auxiliar de Ruta (secundario) | mismos que Jefe de Ruta |

## Anexo B — Próximos pasos sugeridos (actualizado tras Fase 3)

1. **Sprint 1 — URGENTE (esta semana):** **G013** (CONFIRMADO 56% error) — Sebastián diagnostica los IDs de error documentados, identifica root cause de `_action_done()` en `gf_production_ops`, parchea. Sin esto, almacén PT está roto. **G024** (dominio) — Carlos/Yamil resuelven en < 1 día.
2. **Sprint 2 (1-2 semanas):** G001 (Metabase), G002 (JWT seguridad), G003 (tokens en bundle).
3. **Sprint 3 (2 semanas):** G006, G016, G018, G019 — completar persistencia backend faltante.
4. **Continuo:** G004, G005 — tests + CI.
5. **Limpieza paralela:** G009, G010, G011, G015, G020, G021, G022, G025 — deuda menor que cualquier dev junior puede tomar.

---

**Última actualización:** 2026-04-27 · Fase 3: verificación P1 contra Odoo producción + ajustes de scope · auto-generado por Claude · necesita review humano antes de planeación.
