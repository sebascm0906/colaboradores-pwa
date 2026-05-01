# Supervisor Ventas Route Planning by CEDIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Supervisor Ventas `Pronostico` into route-first daily planning, using the supervisor session CEDIS to list assigned `gf.route` records and create/reuse tomorrow `gf.route.plan` records that feed Almacenista Entregas load blocks.

**Architecture:** Add a small pure planning helper module for date/state/payload logic, extend supervisor API wrappers, add BFF endpoints under `directSupervisorVentas()`, then refactor `ScreenPronostico.jsx` to show route cards before the forecast editor. Keep `ScreenCargaUnidades.jsx` unchanged; it remains the downstream consumer of `gf.route.plan` filtered by `route_id.warehouse_dispatch_id`.

**Tech Stack:** React 18, Vite, local `api()` wrapper in `src/lib/api.js`, Odoo JSON/RPC helpers already present in `src/lib/api.js`, `node:test` for unit tests.

---

## File Structure

- Create: `src/modules/supervisor-ventas/routePlanning.js`
  - Pure helpers: tomorrow date, route planning normalization, route card state, payload builder.
- Create: `tests/supervisorRoutePlanning.test.mjs`
  - Unit tests for the pure helpers.
- Modify: `src/modules/supervisor-ventas/api.js`
  - Add route planning API wrappers.
  - Extend forecast create/upsert wrapper payload docs to support `route_id` and `route_plan_id`.
- Modify: `src/lib/api.js`
  - Add BFF handlers:
    - `GET /pwa-supv/route-templates`
    - `POST /pwa-supv/route-plan-ensure`
  - Update `/pwa-supv/forecast-create` to pass optional `route_id` / `route_plan_id`.
- Modify: `src/modules/supervisor-ventas/ScreenPronostico.jsx`
  - Replace vendor/global-first flow with route-first planning.
  - Keep product line editor and forecast list affordances where useful.
- Modify: `docs/manuales-fabrica/supervisor-ventas.md`
  - Update operator instructions to say forecast starts from route cards filtered by CEDIS session.

## Backend Assumptions and Safety

The BFF can read `gf.route` and `gf.route.plan` via existing helpers. Creating a real plan must delegate to a backend endpoint when available. The implementation should first try an official endpoint, proposed as `/gf/salesops/supervisor/v2/route_plan/ensure`. If unavailable or returns an error envelope, surface an actionable error and do not attempt fragile generic writes that could create incomplete plans or broken stock pickings.

Use `modelHasField()` already present in `src/lib/api.js` before reading optional `gf.route` fields such as `active`, employee assignment fields, or vehicle fields. Known stable field from existing code: `warehouse_dispatch_id`.

---

### Task 1: Add Pure Route Planning Helpers

**Files:**
- Create: `src/modules/supervisor-ventas/routePlanning.js`
- Test: `tests/supervisorRoutePlanning.test.mjs`

- [ ] **Step 1: Write failing tests for date, state, and normalization**

Create `tests/supervisorRoutePlanning.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getTomorrowDateString,
  getRoutePlanningState,
  normalizeRoutePlanningRow,
  buildRouteForecastPayload,
} from '../src/modules/supervisor-ventas/routePlanning.js'

test('getTomorrowDateString returns local YYYY-MM-DD for the next day', () => {
  const base = new Date(2026, 4, 1, 10, 30, 0)
  assert.equal(getTomorrowDateString(base), '2026-05-02')
})

test('getRoutePlanningState maps route lifecycle to card states', () => {
  assert.equal(getRoutePlanningState({ plan_id: 0 }), 'sin_plan')
  assert.equal(getRoutePlanningState({ plan_id: 10, forecast_state: 'draft' }), 'plan_draft')
  assert.equal(getRoutePlanningState({ plan_id: 10, forecast_state: 'confirmed' }), 'forecast_confirmed')
  assert.equal(getRoutePlanningState({ plan_id: 10, load_picking_id: 55 }), 'load_ready')
  assert.equal(getRoutePlanningState({ plan_id: 10, load_picking_id: 55, load_sealed: true }), 'load_executed')
  assert.equal(getRoutePlanningState({ blocked: true }), 'blocked')
})

test('normalizeRoutePlanningRow preserves route and employee fields', () => {
  assert.deepEqual(normalizeRoutePlanningRow({
    route_id: 7,
    route_name: 'Ruta 07',
    employee_id: [123, 'Aida'],
    plan_id: [44, 'Plan'],
    load_picking_id: false,
    load_sealed: false,
    date_target: '2026-05-02',
  }), {
    route_id: 7,
    route_name: 'Ruta 07',
    employee_id: 123,
    employee_name: 'Aida',
    plan_id: 44,
    plan_state: '',
    forecast_id: 0,
    forecast_state: '',
    load_picking_id: 0,
    load_sealed: false,
    date_target: '2026-05-02',
    state: 'plan_draft',
    blocked: false,
    block_reason: '',
  })
})

test('buildRouteForecastPayload filters invalid lines and includes route context', () => {
  assert.deepEqual(buildRouteForecastPayload({
    routeId: 7,
    planId: 44,
    dateTarget: '2026-05-02',
    lines: [
      { product_id: '10', channel: 'Van', qty: '3' },
      { product_id: '', channel: 'Van', qty: '5' },
      { product_id: '11', channel: 'Mostrador', qty: '0' },
    ],
  }), {
    route_id: 7,
    route_plan_id: 44,
    date_target: '2026-05-02',
    lines: [{ product_id: 10, channel: 'Van', qty: 3 }],
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
node --test tests/supervisorRoutePlanning.test.mjs
```

Expected: fails because `src/modules/supervisor-ventas/routePlanning.js` does not exist.

- [ ] **Step 3: Implement helper module**

Create `src/modules/supervisor-ventas/routePlanning.js`:

```js
function toM2oId(value) {
  if (Array.isArray(value)) return Number(value[0] || 0) || 0
  if (value && typeof value === 'object') return Number(value.id || 0) || 0
  return Number(value || 0) || 0
}

function toM2oName(value, fallback = '') {
  if (Array.isArray(value)) return String(value[1] || fallback || '')
  if (value && typeof value === 'object') return String(value.name || fallback || '')
  return String(fallback || '')
}

export function getTomorrowDateString(baseDate = new Date()) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + 1)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function getRoutePlanningState(row = {}) {
  if (row.blocked) return 'blocked'
  if (row.load_sealed) return 'load_executed'
  if (toM2oId(row.load_picking_id)) return 'load_ready'
  if (String(row.forecast_state || '').toLowerCase() === 'confirmed') return 'forecast_confirmed'
  if (toM2oId(row.plan_id)) return 'plan_draft'
  return 'sin_plan'
}

export function normalizeRoutePlanningRow(row = {}) {
  const employeeId = toM2oId(row.employee_id || row.salesperson_employee_id || row.driver_employee_id)
  const employeeName = toM2oName(row.employee_id || row.salesperson_employee_id || row.driver_employee_id, row.employee_name || '')
  const normalized = {
    route_id: toM2oId(row.route_id) || Number(row.route_id || 0) || 0,
    route_name: row.route_name || row.name || '',
    employee_id: employeeId,
    employee_name: employeeName,
    plan_id: toM2oId(row.plan_id),
    plan_state: row.plan_state || '',
    forecast_id: toM2oId(row.forecast_id),
    forecast_state: row.forecast_state || '',
    load_picking_id: toM2oId(row.load_picking_id),
    load_sealed: row.load_sealed === true,
    date_target: row.date_target || row.date || '',
    blocked: row.blocked === true,
    block_reason: row.block_reason || '',
  }
  normalized.state = getRoutePlanningState(normalized)
  return normalized
}

export function buildRouteForecastPayload({ routeId, planId, dateTarget, lines }) {
  return {
    route_id: Number(routeId || 0),
    route_plan_id: Number(planId || 0),
    date_target: dateTarget,
    lines: (Array.isArray(lines) ? lines : [])
      .filter((l) => l?.product_id && Number(l.qty) > 0)
      .map((l) => ({
        product_id: Number(l.product_id),
        channel: l.channel || 'Van',
        qty: Number(l.qty),
      })),
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
node --test tests/supervisorRoutePlanning.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit helper task**

```bash
git add src/modules/supervisor-ventas/routePlanning.js tests/supervisorRoutePlanning.test.mjs
git commit -m "test: add supervisor route planning helpers"
```

---

### Task 2: Add Supervisor API Wrappers

**Files:**
- Modify: `src/modules/supervisor-ventas/api.js`
- Test: covered manually by BFF/UI tasks; wrappers are thin.

- [ ] **Step 1: Add wrappers to API module**

Append near the Pronostico section in `src/modules/supervisor-ventas/api.js`:

```js
export function getRouteTemplatesForPlanning(dateTarget) {
  const qs = dateTarget ? `?date_target=${encodeURIComponent(dateTarget)}` : ''
  return api('GET', `/pwa-supv/route-templates${qs}`)
}

export function ensureDailyRoutePlan(routeId, dateTarget) {
  return api('POST', '/pwa-supv/route-plan-ensure', {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
  })
}
```

Update the `createForecast(data)` JSDoc to document optional `route_id` and `route_plan_id`.

- [ ] **Step 2: Run lint/build smoke**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit API wrappers**

```bash
git add src/modules/supervisor-ventas/api.js
git commit -m "feat: add supervisor route planning api wrappers"
```

---

### Task 3: Add BFF Route Template Endpoint

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add route field helpers inside `directSupervisorVentas()` scope**

Use existing `modelHasField(model, fieldName)` to build safe field lists. Add local helpers near the `/pwa-supv/team-routes` handler:

```js
async function getSupportedFields(model, candidates) {
  const supported = []
  for (const field of candidates) {
    if (await modelHasField(model, field)) supported.push(field)
  }
  return supported
}

function firstM2o(row, fields) {
  for (const field of fields) {
    const value = row?.[field]
    const id = Array.isArray(value) ? Number(value[0] || 0) : Number(value || 0)
    if (id) return value
  }
  return null
}
```

If this creates repeated helper definitions on every call, that is acceptable for a small BFF handler; avoid a broad refactor of `src/lib/api.js`.

- [ ] **Step 2: Implement `GET /pwa-supv/route-templates`**

Add before `/pwa-supv/forecast-products`:

```js
if (cleanPath === '/pwa-supv/route-templates' && method === 'GET') {
  const warehouseId = getWarehouseId()
  if (!warehouseId) {
    throw new ApiError('Tu usuario no tiene CEDIS asignado. Pide a administracion que configure warehouse_id.', {
      status: 400,
      code: 'missing_warehouse_id',
    })
  }

  const dateTarget = /^\d{4}-\d{2}-\d{2}$/.test(query.get('date_target') || '')
    ? query.get('date_target')
    : (() => {
        const d = new Date(); d.setDate(d.getDate() + 1)
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
      })()

  const employeeFields = await getSupportedFields('gf.route', [
    'salesperson_employee_id',
    'driver_employee_id',
    'employee_id',
    'user_employee_id',
  ])
  const routeFields = [
    'id',
    'name',
    'warehouse_dispatch_id',
    ...(await modelHasField('gf.route', 'company_id') ? ['company_id'] : []),
    ...(await modelHasField('gf.route', 'active') ? ['active'] : []),
    ...employeeFields,
  ]

  const domain = [['warehouse_dispatch_id', '=', warehouseId]]
  if (companyId && await modelHasField('gf.route', 'company_id')) domain.push(['company_id', '=', companyId])
  if (await modelHasField('gf.route', 'active')) domain.push(['active', '=', true])

  const routeRows = pickListResponse(await readModelSorted('gf.route', {
    fields: routeFields,
    domain,
    sort_column: 'name',
    sort_desc: false,
    limit: 200,
    sudo: 1,
  }))

  const assignedRoutes = routeRows
    .map((route) => ({ route, employeeRef: firstM2o(route, employeeFields) }))
    .filter((item) => item.employeeRef)

  const routeIds = assignedRoutes.map((item) => Number(item.route.id || 0)).filter(Boolean)
  const planRows = routeIds.length
    ? pickListResponse(await readModelSorted('gf.route.plan', {
        fields: ['id', 'name', 'date', 'route_id', 'state', 'driver_employee_id', 'salesperson_employee_id', 'load_picking_id', 'load_sealed'],
        domain: [['route_id', 'in', routeIds], ['date', '=', dateTarget]],
        sort_column: 'id',
        sort_desc: false,
        limit: routeIds.length,
        sudo: 1,
      }))
    : []
  const planByRouteId = new Map(planRows.map((plan) => [Number(plan.route_id?.[0] || plan.route_id || 0), plan]))

  return assignedRoutes.map(({ route, employeeRef }) => {
    const routeId = Number(route.id || 0)
    const plan = planByRouteId.get(routeId) || null
    return {
      route_id: routeId,
      route_name: route.name || '',
      warehouse_id: route.warehouse_dispatch_id?.[0] || warehouseId,
      warehouse_name: route.warehouse_dispatch_id?.[1] || '',
      employee_id: Array.isArray(employeeRef) ? employeeRef[0] : employeeRef,
      employee_name: Array.isArray(employeeRef) ? employeeRef[1] : '',
      plan_id: plan?.id || 0,
      plan_name: plan?.name || '',
      plan_state: plan?.state || '',
      load_picking_id: plan?.load_picking_id || null,
      load_sealed: plan?.load_sealed === true,
      date_target: dateTarget,
    }
  })
}
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit BFF read endpoint**

```bash
git add src/lib/api.js
git commit -m "feat: list supervisor routes by session cedis"
```

---

### Task 4: Add BFF Ensure Plan Wrapper and Forecast Context

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add failing manual contract note**

Before implementing, write a short inline comment above the new handler explaining that plan creation delegates to backend and must not generic-create route plans.

- [ ] **Step 2: Implement `POST /pwa-supv/route-plan-ensure` as backend wrapper**

Add before forecast handlers:

```js
if (cleanPath === '/pwa-supv/route-plan-ensure' && method === 'POST') {
  const warehouseId = getWarehouseId()
  const employeeId = getEmployeeId()
  const routeId = Number(body?.route_id || 0)
  const dateTarget = body?.date_target || ''
  if (!warehouseId) throw new ApiError('Tu usuario no tiene CEDIS asignado.', { status: 400, code: 'missing_warehouse_id' })
  if (!routeId) return { ok: false, error: 'route_id requerido', code: 'route_id_required' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTarget)) return { ok: false, error: 'date_target invalida', code: 'invalid_date_target' }

  const routeRows = pickListResponse(await readModelSorted('gf.route', {
    fields: ['id', 'name', 'warehouse_dispatch_id'],
    domain: [['id', '=', routeId], ['warehouse_dispatch_id', '=', warehouseId]],
    sort_column: 'id',
    sort_desc: false,
    limit: 1,
    sudo: 1,
  }))
  if (!routeRows.length) return { ok: false, error: 'Ruta fuera del CEDIS de la sesion.', code: 'route_not_in_warehouse' }

  const envelope = await odooJson('/gf/salesops/supervisor/v2/route_plan/ensure', {
    meta: {
      employee_id: employeeId || undefined,
      warehouse_id: warehouseId,
    },
    data: {
      route_id: routeId,
      date_target: dateTarget,
    },
  })

  const status = String(envelope?.status || '').toLowerCase()
  if (status === 'ok' || envelope?.ok === true) {
    return { ok: true, ...(envelope?.data || envelope) }
  }
  return {
    ok: false,
    error: envelope?.user_message || envelope?.message || 'No se pudo crear el plan diario; endpoint no disponible.',
    code: envelope?.code || 'route_plan_ensure_failed',
    data: envelope?.data || {},
  }
}
```

If `readModelSorted('gf.route', fields: ['warehouse_dispatch_id'])` fails in QA because the field name differs, stop and inspect `ir.model.fields` for `gf.route`; do not guess alternate writes.

- [ ] **Step 3: Pass route context through forecast-create**

In `/pwa-supv/forecast-create`, extend `upsertData`:

```js
if (body?.route_id) upsertData.route_id = Number(body.route_id)
if (body?.route_plan_id) upsertData.route_plan_id = Number(body.route_plan_id)
```

Keep existing `employee_id` behavior for backward compatibility.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit ensure wrapper**

```bash
git add src/lib/api.js
git commit -m "feat: wrap supervisor route plan ensure"
```

---

### Task 5: Refactor Pronostico Screen to Route-First UI

**Files:**
- Modify: `src/modules/supervisor-ventas/ScreenPronostico.jsx`

- [ ] **Step 1: Import new APIs and helpers**

Update imports:

```js
import {
  getForecastProducts,
  createForecast,
  getForecasts,
  confirmForecast,
  cancelForecast,
  deleteForecast,
  getRouteTemplatesForPlanning,
  ensureDailyRoutePlan,
} from './api'
import {
  buildRouteForecastPayload,
  getTomorrowDateString,
  normalizeRoutePlanningRow,
} from './routePlanning'
```

Remove `getTeam` and vendor selector state unless preserving it as hidden fallback.

- [ ] **Step 2: Replace vendor state with route planning state**

Use:

```js
const [dateTarget] = useState(() => getTomorrowDateString())
const [routes, setRoutes] = useState([])
const [selectedRouteId, setSelectedRouteId] = useState(null)
const [routeLoading, setRouteLoading] = useState(null)
```

Derived:

```js
const selectedRoute = useMemo(
  () => routes.find((r) => Number(r.route_id) === Number(selectedRouteId)) || null,
  [routes, selectedRouteId],
)
```

- [ ] **Step 3: Update `loadData()`**

Fetch products, forecasts, and route templates:

```js
const [p, f, routeRows] = await Promise.all([
  getForecastProducts().catch(...),
  getForecasts().catch(...),
  getRouteTemplatesForPlanning(dateTarget).catch(...),
])
setProducts(p || [])
setForecasts(f || [])
setRoutes((Array.isArray(routeRows) ? routeRows : []).map(normalizeRoutePlanningRow))
```

- [ ] **Step 4: Add route plan action**

Add:

```js
async function handleEnsurePlan(route) {
  if (!route?.route_id) return
  setRouteLoading(route.route_id)
  try {
    const res = await ensureDailyRoutePlan(route.route_id, dateTarget)
    if (res?.ok === false) {
      flashMsg(res.error || 'No se pudo crear el plan diario', 5000)
      return
    }
    await loadData()
    setSelectedRouteId(route.route_id)
    flashMsg('Plan diario listo')
  } catch (e) {
    flashMsg(e.message || 'No se pudo crear el plan diario', 5000)
  } finally {
    setRouteLoading(null)
  }
}
```

- [ ] **Step 5: Update submit payload**

Replace vendor payload in `handleSubmit()`:

```js
if (!selectedRoute) {
  setMsg('Selecciona una ruta')
  return
}
const planId = selectedRoute.plan_id
if (!planId) {
  setMsg('Primero crea el plan diario de la ruta')
  return
}
const forecastData = buildRouteForecastPayload({
  routeId: selectedRoute.route_id,
  planId,
  dateTarget,
  lines: validLines,
})
await createForecast(forecastData)
```

- [ ] **Step 6: Render route cards above editor**

Add a route section before product lines:

```jsx
<p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>
  RUTAS DEL CEDIS - {dateTarget}
</p>
<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
  {routes.map((route) => {
    const selected = Number(selectedRouteId) === Number(route.route_id)
    const needsPlan = !route.plan_id
    return (
      <button key={route.route_id} type="button" onClick={() => setSelectedRouteId(route.route_id)} style={{ /* follow existing card style */ }}>
        <div>
          <p>{route.route_name}</p>
          <p>{route.employee_name || 'Sin empleado'}</p>
        </div>
        {needsPlan ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); handleEnsurePlan(route) }}>
            {routeLoading === route.route_id ? 'Creando...' : 'Crear plan'}
          </button>
        ) : (
          <span>{route.state}</span>
        )}
      </button>
    )
  })}
</div>
```

Avoid nested clickable conflicts in final JSX: if the route card is a button, make the "Crear plan" control a sibling or use a non-button card with two buttons. Keep markup valid.

- [ ] **Step 7: Remove vendor sheet UI**

Remove `vendorSheetOpen`, `vendorOptions`, `selectedVendor`, and the vendor `SearchableSheet` call. Keep `SearchableSheet` for product selection.

- [ ] **Step 8: Empty and error states**

If route template fetch fails with `missing_warehouse_id`, show:

`Tu usuario no tiene CEDIS asignado. Pide a administracion que configure warehouse_id.`

If routes array is empty, show:

`No hay rutas asignadas para el CEDIS de tu sesion.`

- [ ] **Step 9: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 10: Commit UI refactor**

```bash
git add src/modules/supervisor-ventas/ScreenPronostico.jsx
git commit -m "feat: make supervisor forecast route-first"
```

---

### Task 6: Update Supervisor Manual

**Files:**
- Modify: `docs/manuales-fabrica/supervisor-ventas.md`

- [ ] **Step 1: Update forecast instructions**

Replace the forecast section with:

```md
### 2. Hacer la planeacion por ruta

> La pantalla toma automaticamente el CEDIS de tu usuario. Si no ves rutas, avisa a administracion para revisar tu CEDIS o las rutas en Odoo.

1. Toca **Pronostico**.
2. Revisa las rutas del CEDIS que aparecen en pantalla.
3. Para cada ruta que se va a operar manana:
   1. Toca **Crear plan** si todavia no existe plan diario.
   2. Abre la ruta.
   3. Captura producto, canal y cantidad.
   4. Toca **Guardar Pronostico**.
   5. Confirma el pronostico cuando las cantidades esten revisadas.
4. Cuando el pronostico queda confirmado, CEDIS Entregas puede preparar la carga.
```

- [ ] **Step 2: Commit docs**

```bash
git add docs/manuales-fabrica/supervisor-ventas.md
git commit -m "docs: update supervisor route planning workflow"
```

---

### Task 7: End-to-End Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 3: Run local browser smoke**

Run:

```bash
npm run dev
```

Open the local URL in the in-app browser and verify:

- `/equipo/pronostico` loads.
- route cards render for the session CEDIS when backend data exists.
- missing `warehouse_id` shows the configured error.
- product selector still opens.
- forecast submit blocks until a route with plan is selected.

- [ ] **Step 4: Manual backend QA in staging/prod**

With real users/data:

1. Login as Supervisora with `warehouse_id`.
2. Confirm only routes for that CEDIS appear.
3. Create/reuse tomorrow plan for one route.
4. Capture and confirm forecast by route.
5. Login as Almacenista Entregas for same CEDIS.
6. Confirm `Cargar Unidades` shows the route block.
7. Confirm load detail and stock render.

- [ ] **Step 5: Final commit if smoke changes were needed**

If verification required small fixes:

```bash
git add <changed-files>
git commit -m "fix: polish supervisor route planning"
```

---

## Rollback Plan

If backend route plan ensure is not deployed, keep route template listing read-only and show the actionable endpoint error. Do not restore the old vendor-global UI unless the supervisor workflow is blocked in production; if rollback is required, revert the UI commit only and leave helper/API commits if harmless.
