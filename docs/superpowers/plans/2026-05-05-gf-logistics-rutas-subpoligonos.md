# GF Logistics Rutas Subpoligonos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add archived logistics routes, route planning by polygon/subpolygon/customer filters, manual customer insertion into active route plans, and polygon designer support for subpolygons.

**Architecture:** Odoo is the source of truth for route, polygon, subpolygon, customer filtering, geometry validation, and `gf.route.stop` generation. The PWA captures planning criteria, displays operational errors, and consumes backend endpoints without creating stops through generic ORM fallbacks. The polygon/subpolygon designer exists only in Odoo; this PWA repo must not implement a designer.

**Tech Stack:** React 18, Vite, local `api()` wrapper in `src/lib/api.js`, Odoo JSON/RPC helpers in `src/lib/api.js`, Odoo Python models/controllers/views for backend work, `node:test` for PWA unit tests.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-05-05-gf-logistics-rutas-subpoligonos-design.md`
- Existing route planning helper: `src/modules/supervisor-ventas/routePlanning.js`
- Existing supervisor route planning screen: `src/modules/supervisor-ventas/ScreenPronostico.jsx`
- Existing supervisor API wrappers: `src/modules/supervisor-ventas/api.js`
- Existing PWA BFF: `src/lib/api.js`
- Existing route load acceptance screen: `src/modules/ruta/ScreenAceptarCarga.jsx`

## Scope Split

This is a multi-subsystem change. Execute in this order:

1. PWA pure helpers and API contract tests.
2. PWA BFF wrappers that delegate to official Odoo endpoints and surface errors.
3. PWA screens for planning criteria and manual customer insertion.
4. Route load acceptance state reflection.
5. Odoo backend models/controllers/views in the backend repo.
6. End-to-end QA against Odoo.

Do not implement geometry or stop generation in the PWA. If an Odoo endpoint is missing, surface a clear error and stop.

## File Structure

### PWA repo

- Modify: `src/modules/supervisor-ventas/routePlanning.js`
  - Add pure helpers for planning criteria payloads, time windows, functional error messages, active plan normalization, customer search normalization, and map marker metadata.
- Modify: `tests/supervisorRoutePlanning.test.mjs`
  - Extend tests for new helpers.
- Modify: `src/modules/supervisor-ventas/api.js`
  - Add wrappers for polygon catalog, subpolygon catalog, time windows, channels, active plans, customer search, and add-customer endpoint.
- Modify: `src/lib/api.js`
  - Add or adjust `/pwa-supv/*` handlers that proxy to official Odoo endpoints.
  - Remove unsafe direct ORM route-plan creation fallback for this new flow.
- Modify: `src/modules/supervisor-ventas/ScreenPronostico.jsx`
  - Capture route, polygon, optional subpolygon, channels, optional visit days, and time window defaulting to "Cualquier hora".
  - Pass planning criteria to `ensureDailyRoutePlan`.
- Create: `src/modules/supervisor-ventas/ScreenPlanDiarioClientes.jsx`
  - Let Supervisor select an active route plan and add a customer manually.
- Modify: `src/App.jsx` and/or `src/modules/registry.js`
  - Register route for the manual customer insertion screen.
- Modify: `src/modules/ruta/ScreenAceptarCarga.jsx`
  - Update local `plan.state` to `in_progress` after successful `acceptLoad`.
- Modify: `docs/manuales-fabrica/supervisor-ventas.md`
  - Document new planning and manual add flow.

### Odoo backend repo

Exact paths depend on the backend checkout. Use the module that owns `gf.route`, `gf.route.plan`, `gf.route.stop`, and the existing polygon designer. Expected files:

- Modify/Create: `gf_logistics_ops/models/gf_route.py`
  - Ensure `gf.route.active` exists.
- Create: `gf_logistics_ops/models/gf_route_subpolygon.py`
  - New `gf.route.subpolygon` model.
- Modify/Create: `gf_logistics_ops/models/gf_route_time_window.py`
  - Catalog values: any time, morning, afternoon, night.
- Modify: `gf_logistics_ops/models/res_partner.py`
  - Confirm/add customer fields for geo, channels, visit days, and time window.
- Modify: `gf_logistics_ops/controllers/supervisor.py` or `gf_saleops/controllers/supervisor.py`
  - Add/update route plan ensure, active plans, add customer, catalogs, and customer search endpoints.
- Modify: existing Odoo polygon designer JS/XML/Python files
  - Add subpolygon drawing under selected polygon.
  - Add larger customer markers, per-polygon colors, black markers for customers without polygon, letter labels for subpolygons, and dynamic legend.
- Add tests under backend test framework
  - Unit/integration tests for geometry containment, filtering, stop generation, manual add, and archiving.

---

### Task 1: Extend PWA Planning Helpers

**Files:**
- Modify: `src/modules/supervisor-ventas/routePlanning.js`
- Modify: `tests/supervisorRoutePlanning.test.mjs`

- [ ] **Step 1: Write failing helper tests**

Append tests:

```js
import {
  buildRoutePlanCriteriaPayload,
  getDefaultTimeWindow,
  normalizeActiveRoutePlan,
  normalizeCustomerSearchResult,
  getSupervisorRouteErrorMessage,
  buildPolygonMarkerStyle,
} from '../src/modules/supervisor-ventas/routePlanning.js'

test('buildRoutePlanCriteriaPayload defaults to any time and all visit days', () => {
  assert.deepEqual(buildRoutePlanCriteriaPayload({
    routeId: '10',
    dateTarget: '2026-05-06',
    polygonId: '20',
    subpolygonId: '',
    channelIds: ['1', '2'],
    visitDays: [],
    timeWindowId: '',
  }), {
    route_id: 10,
    date_target: '2026-05-06',
    polygon_id: 20,
    subpolygon_id: null,
    channel_ids: [1, 2],
    visit_days: [],
    time_window_id: null,
  })
})

test('getDefaultTimeWindow returns any time semantics', () => {
  assert.deepEqual(getDefaultTimeWindow(), {
    id: null,
    key: 'any',
    label: 'Cualquier hora',
  })
})

test('normalizeActiveRoutePlan maps backend plan fields for manual customer insertion', () => {
  assert.deepEqual(normalizeActiveRoutePlan({
    id: 100,
    name: 'Ruta Centro',
    route_id: [10, 'Centro'],
    driver_employee_id: [7, 'Luis'],
    state: 'in_progress',
    stops_total: 12,
  }), {
    id: 100,
    name: 'Ruta Centro',
    route_id: 10,
    route_name: 'Centro',
    driver_id: 7,
    driver_name: 'Luis',
    state: 'in_progress',
    stops_total: 12,
  })
})

test('normalizeCustomerSearchResult keeps customer planning fields', () => {
  assert.deepEqual(normalizeCustomerSearchResult({
    id: 55,
    name: 'Abarrotes Sol',
    street: 'Av 1',
    channel_ids: [[1, 'Mayoreo']],
    visit_days: ['monday'],
    time_window_id: [3, 'Tarde'],
    latitude: 20.1,
    longitude: -103.1,
  }), {
    id: 55,
    name: 'Abarrotes Sol',
    address: 'Av 1',
    channels: ['Mayoreo'],
    visit_days: ['monday'],
    time_window: 'Tarde',
    latitude: 20.1,
    longitude: -103.1,
  })
})

test('getSupervisorRouteErrorMessage maps backend functional errors', () => {
  assert.match(getSupervisorRouteErrorMessage({ code: 'polygon_not_found' }), /poligono/i)
  assert.match(getSupervisorRouteErrorMessage({ code: 'customer_already_in_plan' }), /ya esta/i)
})

test('buildPolygonMarkerStyle uses polygon color and black for unassigned customers', () => {
  assert.deepEqual(buildPolygonMarkerStyle({ polygonColor: '#2f80ed', subpolygonLetter: 'A' }), {
    background: '#2f80ed',
    color: '#ffffff',
    label: 'A',
    size: 18,
  })
  assert.deepEqual(buildPolygonMarkerStyle({ hasPolygon: false }), {
    background: '#000000',
    color: '#ffffff',
    label: '',
    size: 18,
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
node --test tests/supervisorRoutePlanning.test.mjs
```

Expected: FAIL with missing exports.

- [ ] **Step 3: Implement minimal helpers**

Add to `src/modules/supervisor-ventas/routePlanning.js`:

```js
function toNumberList(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter(Boolean)
}

export function getDefaultTimeWindow() {
  return { id: null, key: 'any', label: 'Cualquier hora' }
}

export function buildRoutePlanCriteriaPayload({
  routeId,
  dateTarget,
  polygonId,
  subpolygonId,
  channelIds,
  visitDays,
  timeWindowId,
}) {
  return {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
    polygon_id: Number(polygonId || 0),
    subpolygon_id: subpolygonId ? Number(subpolygonId) : null,
    channel_ids: toNumberList(channelIds),
    visit_days: Array.isArray(visitDays) ? visitDays.filter(Boolean) : [],
    time_window_id: timeWindowId ? Number(timeWindowId) : null,
  }
}

export function normalizeActiveRoutePlan(row = {}) {
  return {
    id: Number(row.id || 0),
    name: row.name || '',
    route_id: toM2oId(row.route_id),
    route_name: toM2oName(row.route_id),
    driver_id: toM2oId(row.driver_employee_id),
    driver_name: toM2oName(row.driver_employee_id),
    state: row.state || '',
    stops_total: Number(row.stops_total || 0),
  }
}

export function normalizeCustomerSearchResult(row = {}) {
  return {
    id: Number(row.id || 0),
    name: row.name || '',
    address: row.street || row.contact_address || '',
    channels: (Array.isArray(row.channel_ids) ? row.channel_ids : []).map((item) => Array.isArray(item) ? item[1] : String(item || '')).filter(Boolean),
    visit_days: Array.isArray(row.visit_days) ? row.visit_days : [],
    time_window: toM2oName(row.time_window_id),
    latitude: Number(row.latitude || row.partner_latitude || 0) || null,
    longitude: Number(row.longitude || row.partner_longitude || 0) || null,
  }
}

export function getSupervisorRouteErrorMessage(error = {}) {
  const code = error.code || error?.data?.code
  const messages = {
    polygon_required: 'Selecciona un poligono para generar la ruta.',
    polygon_not_found: 'No se encontro el poligono o no pertenece a tu CEDIS.',
    subpolygon_outside_polygon: 'El subpoligono no pertenece al poligono seleccionado.',
    no_customers_found: 'No hay clientes para los filtros seleccionados. Avisa al administrador que revise poligonos y datos de clientes.',
    missing_customer_geo: 'El cliente no tiene ubicacion geografica suficiente.',
    customer_already_in_plan: 'El cliente ya esta en este plan diario.',
    plan_not_editable: 'Este plan ya no permite agregar clientes.',
  }
  return messages[code] || error.message || error.error || 'No se pudo completar la operacion.'
}

export function buildPolygonMarkerStyle({ hasPolygon = true, polygonColor = '#2f80ed', subpolygonLetter = '' } = {}) {
  return {
    background: hasPolygon ? polygonColor : '#000000',
    color: '#ffffff',
    label: subpolygonLetter || '',
    size: 18,
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
node --test tests/supervisorRoutePlanning.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/supervisor-ventas/routePlanning.js tests/supervisorRoutePlanning.test.mjs
git commit -m "test: extend logistics route planning helpers"
```

---

### Task 2: Add PWA Supervisor API Wrappers

**Files:**
- Modify: `src/modules/supervisor-ventas/api.js`

- [ ] **Step 1: Add API wrapper declarations**

Add:

```js
export function getPlanningPolygons() {
  return api('GET', '/pwa-supv/polygons')
}

export function getPlanningSubpolygons(polygonId) {
  const qs = polygonId ? `?polygon_id=${encodeURIComponent(polygonId)}` : ''
  return api('GET', `/pwa-supv/subpolygons${qs}`)
}

export function getPlanningChannels() {
  return api('GET', '/pwa-supv/customer-channels')
}

export function getPlanningTimeWindows() {
  return api('GET', '/pwa-supv/time-windows')
}

export function getActiveRoutePlans(dateTarget) {
  const qs = dateTarget ? `?date_target=${encodeURIComponent(dateTarget)}` : ''
  return api('GET', `/pwa-supv/active-route-plans${qs}`)
}

export function searchPlanningCustomers(query) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : ''
  return api('GET', `/pwa-supv/customers/search${qs}`)
}

export function addCustomerToRoutePlan(routePlanId, customerId, notes = '') {
  return api('POST', '/pwa-supv/route-plan-add-customer', {
    route_plan_id: Number(routePlanId || 0),
    customer_id: Number(customerId || 0),
    notes: String(notes || '').trim(),
  })
}
```

- [ ] **Step 2: Extend `ensureDailyRoutePlan` signature**

Change it to accept optional criteria:

```js
export function ensureDailyRoutePlan(routeId, dateTarget, criteria = {}) {
  return api('POST', '/pwa-supv/route-plan-ensure', {
    route_id: Number(routeId || 0),
    date_target: dateTarget,
    ...criteria,
  })
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/supervisor-ventas/api.js
git commit -m "feat: add supervisor planning api wrappers"
```

---

### Task 3: Add PWA BFF Proxy Endpoints

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add catalog proxy handlers in `directSupervisorVentas()`**

Add handlers for:

```js
if (cleanPath === '/pwa-supv/polygons' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/polygons', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: {},
  })
}

if (cleanPath === '/pwa-supv/subpolygons' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/subpolygons', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: { polygon_id: Number(query.get('polygon_id') || 0) || undefined },
  })
}

if (cleanPath === '/pwa-supv/customer-channels' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/customer_channels', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: {},
  })
}

if (cleanPath === '/pwa-supv/time-windows' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/time_windows', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: {},
  })
}
```

- [ ] **Step 2: Add active plans and customer search proxy handlers**

Add:

```js
if (cleanPath === '/pwa-supv/active-route-plans' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/route_plan/active', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: { date_target: query.get('date_target') || undefined },
  })
}

if (cleanPath === '/pwa-supv/customers/search' && method === 'GET') {
  return odooJson('/gf/salesops/supervisor/v2/customers/search', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: { q: query.get('q') || '' },
  })
}

if (cleanPath === '/pwa-supv/route-plan-add-customer' && method === 'POST') {
  return odooJson('/gf/salesops/supervisor/v2/route_plan/add_customer', {
    meta: { employee_id: getEmployeeId() || undefined, warehouse_id: getWarehouseId() || undefined },
    data: {
      route_plan_id: Number(body?.route_plan_id || 0),
      customer_id: Number(body?.customer_id || 0),
      notes: String(body?.notes || '').trim(),
    },
  })
}
```

- [ ] **Step 3: Update `/pwa-supv/route-plan-ensure`**

Ensure it forwards criteria:

```js
data: {
  route_id: routeId,
  date_target: dateTarget,
  polygon_id: Number(body?.polygon_id || 0) || undefined,
  subpolygon_id: body?.subpolygon_id ? Number(body.subpolygon_id) : null,
  channel_ids: Array.isArray(body?.channel_ids) ? body.channel_ids.map(Number).filter(Boolean) : [],
  visit_days: Array.isArray(body?.visit_days) ? body.visit_days.filter(Boolean) : [],
  time_window_id: body?.time_window_id ? Number(body.time_window_id) : null,
}
```

Important: for this new flow, do not create route plans through generic ORM fallback if the Odoo endpoint fails. Return the Odoo functional error or a clear `route_plan_endpoint_unavailable` error.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: proxy supervisor route planning endpoints"
```

---

### Task 4: Update Supervisor Planning Screen

**Files:**
- Modify: `src/modules/supervisor-ventas/ScreenPronostico.jsx`

- [ ] **Step 1: Add state and load catalog data**

Add state for polygons, subpolygons, channels, time windows, selected polygon/subpolygon/channel IDs, visit days, and time window. Default time window is `null` / "Cualquier hora".

- [ ] **Step 2: Write UI for criteria**

Add compact controls above product forecast:

- route selector already exists;
- polygon selector;
- subpolygon selector with `Ninguno`;
- channel multi-select;
- optional day chips;
- time window select defaulted to `Cualquier hora`.

Do not add any polygon/subpolygon drawing UI to the PWA. This screen only selects Odoo-created polygons/subpolygons and uses customer filters for plan generation.

- [ ] **Step 3: Build criteria payload before plan ensure**

Use:

```js
const criteria = buildRoutePlanCriteriaPayload({
  routeId: route.route_id,
  dateTarget,
  polygonId: selectedPolygonId,
  subpolygonId: selectedSubpolygonId,
  channelIds: selectedChannelIds,
  visitDays: selectedVisitDays,
  timeWindowId: selectedTimeWindowId,
})
await ensureDailyRoutePlan(route.route_id, dateTarget, criteria)
```

- [ ] **Step 4: Show functional errors**

Use `getSupervisorRouteErrorMessage(error)` for `polygon_not_found`, `no_customers_found`, `missing_customer_geo`, and similar codes.

- [ ] **Step 5: Run lint/build**

Run:

```bash
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervisor-ventas/ScreenPronostico.jsx
git commit -m "feat: add route planning criteria to forecast"
```

---

### Task 5: Add Manual Customer Insertion Screen

**Files:**
- Create: `src/modules/supervisor-ventas/ScreenPlanDiarioClientes.jsx`
- Modify: `src/App.jsx`
- Modify: `src/modules/registry.js` if needed by navigation

- [ ] **Step 1: Create screen skeleton**

Create a supervisor screen that:

- loads active route plans via `getActiveRoutePlans(dateTarget)`;
- lets user select a plan;
- searches customers via `searchPlanningCustomers(query)`;
- shows customer name, address, channels, visit days, time window, and geo availability;
- posts to `addCustomerToRoutePlan(planId, customerId, notes)`.

- [ ] **Step 2: Add route registration**

Register a route such as:

```jsx
<Route path="/equipo/planes/clientes" element={<SupervisorRoute><ScreenPlanDiarioClientes /></SupervisorRoute>} />
```

Use the same guard pattern as existing supervisor screens.

- [ ] **Step 3: Link from supervisor module**

Add a navigation entry from Supervisor Ventas hub or Pronostico, depending on existing patterns.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/supervisor-ventas/ScreenPlanDiarioClientes.jsx src/App.jsx src/modules/registry.js
git commit -m "feat: let supervisors add customers to route plans"
```

---

### Task 6: Reflect Route Plan State After Load Acceptance

**Files:**
- Modify: `src/modules/ruta/ScreenAceptarCarga.jsx`
- Modify: `tests/routeFlowState.test.mjs` if pure behavior needs coverage

- [ ] **Step 1: Add regression test if helper coverage is needed**

Existing `routeFlowState` already treats `state='in_progress'` and `load_sealed=true` as started. If no new helper is created, use manual screen-level verification.

- [ ] **Step 2: Update local plan on accept success**

In `handleAccept`, after success:

```js
setPlan(prev => prev
  ? {
      ...prev,
      state: data.state || 'in_progress',
      load_sealed: data.load_sealed === true ? true : prev.load_sealed,
    }
  : prev)
```

- [ ] **Step 3: Preserve load update**

Keep the existing `setLoad` update, including `load_sealed_at` and `load_sealed_by`.

- [ ] **Step 4: Run route tests and build**

Run:

```bash
node --test tests/routeFlowState.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/ruta/ScreenAceptarCarga.jsx tests/routeFlowState.test.mjs
git commit -m "fix: reflect route plan start after load acceptance"
```

---

### Task 7: Odoo Backend Models

**Files:** Backend repo, expected `gf_logistics_ops` module.

- [ ] **Step 1: Add `active` to `gf.route` if missing**

```python
active = fields.Boolean(default=True, index=True)
```

- [ ] **Step 2: Add `gf.route.subpolygon`**

Fields:

```python
name = fields.Char(required=True)
polygon_id = fields.Many2one('gf.route.polygon', required=True, ondelete='cascade', index=True)
geometry = fields.GeoMultiPolygon(required=True)  # or existing geometry field type
active = fields.Boolean(default=True, index=True)
company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company)
warehouse_id = fields.Many2one('stock.warehouse')
```

Use the actual polygon model and geometry field type used by the current polygon designer.

- [ ] **Step 3: Validate containment**

Add constraint:

```python
@api.constrains('geometry', 'polygon_id')
def _check_geometry_inside_parent(self):
    for rec in self:
        if rec.geometry and rec.polygon_id.geometry and not rec._geometry_inside(rec.geometry, rec.polygon_id.geometry):
            raise ValidationError(_('El subpoligono debe estar dentro del poligono padre.'))
```

Use existing GIS helpers. Do not invent WKT parsing if the module already has geometry utilities.

- [ ] **Step 4: Add time windows**

Catalog:

- `any`: Cualquier hora, default, no filter.
- `morning`: 01:00-12:00.
- `afternoon`: 12:00-19:00.
- `night`: 19:00-24:00.

- [ ] **Step 5: Confirm/add customer fields**

On `res.partner`, confirm or add:

- geo fields used by polygon containment;
- channel many2many;
- visit days;
- time window many2one or many2many, depending final business decision.

- [ ] **Step 6: Add backend tests**

Test:

- subpolygon outside parent is rejected;
- archived route is hidden from planning domain;
- default time window has no filter effect.

- [ ] **Step 7: Commit backend model task**

```bash
git add gf_logistics_ops/models
git commit -m "feat: add route subpolygons and planning fields"
```

---

### Task 8: Odoo Route Planning Controllers

**Files:** Backend repo, expected controller module.

- [ ] **Step 1: Implement catalogs**

Endpoints:

- `POST /gf/salesops/supervisor/v2/polygons`
- `POST /gf/salesops/supervisor/v2/subpolygons`
- `POST /gf/salesops/supervisor/v2/customer_channels`
- `POST /gf/salesops/supervisor/v2/time_windows`

Return `status:'ok'` and `data` arrays.

- [ ] **Step 2: Update `route_plan/ensure`**

Input:

```python
route_id = data.get('route_id')
polygon_id = data.get('polygon_id')
subpolygon_id = data.get('subpolygon_id')
channel_ids = data.get('channel_ids') or []
visit_days = data.get('visit_days') or []
time_window_id = data.get('time_window_id')
```

Behavior:

- validate supervisor scope;
- validate route is active and belongs to warehouse/company;
- validate polygon;
- validate subpolygon belongs to polygon if provided;
- resolve matching customers:
  - inside subpolygon if provided;
  - otherwise inside parent polygon;
  - channel in selected channels;
  - if `visit_days` empty, do not filter by day;
  - if time window is `null` or `any`, do not filter by window;
- create/reuse `gf.route.plan`;
- regenerate or sync planned stops according to existing business rule;
- return `stops_total`.

- [ ] **Step 3: Implement active plans endpoint**

Return plans in editable states: `draft`, `in_progress`.

- [ ] **Step 4: Implement customer search endpoint**

Search by name/address/phone, scoped by company/warehouse where applicable. Return fields needed by PWA.

- [ ] **Step 5: Implement add customer endpoint**

Endpoint: `POST /gf/salesops/supervisor/v2/route_plan/add_customer`

Rules:

- plan exists and belongs to supervisor scope;
- plan state in `draft`, `in_progress`;
- customer exists and belongs to scope;
- duplicate stop is idempotent or returns `customer_already_in_plan`;
- create `gf.route.stop` at end of sequence;
- mark origin as `manual` if supported.

- [ ] **Step 6: Ensure accept-load sets plan `in_progress`**

In existing route load accept controller, ensure successful acceptance writes:

```python
plan.write({'state': 'in_progress'})
```

only after load validation succeeds.

- [ ] **Step 7: Backend tests**

Test:

- route plan ensure with no visit days includes all matching days;
- route plan ensure with subpolygon only includes customers inside it;
- add customer creates one stop;
- duplicate add is handled;
- closed plan rejects add customer;
- accept-load moves draft to in_progress.

- [ ] **Step 8: Commit**

```bash
git add gf_logistics_ops/controllers gf_saleops/controllers gf_logistics_ops/tests
git commit -m "feat: generate route plans from polygon filters"
```

---

### Task 9: Odoo-Only Polygon Designer UI

**Files:** Backend/Odoo repo only, existing polygon designer assets/views. Do not modify the PWA for polygon drawing.

- [ ] **Step 1: Locate existing polygon designer**

Search backend repo:

```bash
rg -n "polygon|poligono|Geo|geometry|map|leaflet|draw" .
```

- [ ] **Step 2: Add subpolygon drawing mode**

In the current designer:

- user selects parent polygon;
- user clicks "Nuevo subpoligono";
- user draws only geometry;
- user enters name;
- no day/channel/time window fields are shown.

- [ ] **Step 3: Add client marker styles**

Markers:

- larger than current markers;
- polygon-owned clients use polygon color;
- clients without polygon are black;
- subpolygon clients use parent polygon color plus letter label.

- [ ] **Step 4: Add dynamic legend**

Legend entries:

```text
A - Nombre del subpoligono
B - Nombre del subpoligono
Sin poligono - Negro
```

Update legend when subpolygon name changes.

- [ ] **Step 5: Validate containment before save**

Client-side precheck for UX, server-side check as source of truth.

- [ ] **Step 6: UI QA**

Verify:

- subpolygon cannot be saved outside parent polygon;
- customers outside selected polygon are muted;
- unassigned customers are black;
- labels `A`, `B` remain readable on marker color.

- [ ] **Step 7: Commit**

```bash
git add gf_logistics_ops/static gf_logistics_ops/views
git commit -m "feat: support subpolygons in polygon designer"
```

---

### Task 10: Documentation and Final Verification

**Files:**
- Modify: `docs/manuales-fabrica/supervisor-ventas.md`
- Modify: `docs/CODE_MANUAL.md` if endpoint inventory is maintained there.

- [ ] **Step 1: Document Supervisor flow**

Add:

- route plan criteria;
- subpolygon "Ninguno";
- no day selected means all days;
- "Cualquier hora" means no time filter;
- manual customer add flow.

- [ ] **Step 2: Document Admin/Odoo flow**

Add:

- archive route behavior;
- subpolygon designer behavior;
- customer fields are the only source for channel/day/window filtering.

- [ ] **Step 3: Run full PWA verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run backend verification**

In backend repo, run the module test command used for Odoo addons. Record exact command and output in final handoff.

- [ ] **Step 5: Commit docs**

```bash
git add docs/manuales-fabrica/supervisor-ventas.md docs/CODE_MANUAL.md
git commit -m "docs: update route planning operations"
```

---

## Manual QA Script

1. Archive a `gf.route`; verify it disappears from PWA planning but historical plans remain.
2. Create a plan with polygon and no subpolygon; verify stops include all matching customers in polygon.
3. Create a plan with subpolygon; verify stops only include customers inside subpolygon.
4. Create a plan with no selected visit day; verify all matching customers are included regardless of day.
5. Create a plan with selected channels; verify channel filtering.
6. Create a plan with "Cualquier hora"; verify no time-window filtering.
7. Add a customer manually to an active route plan; verify it appears in the driver's route app.
8. Try adding the same customer again; verify idempotent success or clear duplicate error.
9. Accept route load as driver; verify `gf.route.plan.state = in_progress`.
10. In polygon designer, create two subpolygons; verify markers are larger, colored by polygon, black for no polygon, and labeled `A`/`B` with dynamic legend.

## Risks and Decisions

- Backend model names for polygons are unknown in this PWA repo. Confirm before coding Odoo tasks.
- The current polygon designer is not present in this PWA repo. Locate it in the Odoo/backend repo before implementation.
- Customer fields for channels, visit days, and time windows may not exist. Do not fake them in PWA; add or map them in Odoo.
- If the official Odoo route-plan endpoints are unavailable, PWA must show actionable errors and not create incomplete route plans via generic ORM.
