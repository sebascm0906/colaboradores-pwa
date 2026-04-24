# Traspaso de Materia Prima y Custodia de Bolsas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `Salida a Rolito` por un flujo de `TRASPASO MATERIA PRIMA` con dos destinos configurables por sucursal desde Odoo, y agregar custodia de bolsas gerente↔trabajador con diferencias permitidas y adeudo automático por faltantes.

**Architecture:** Odoo será la autoridad real para configuración por warehouse, resolución de destinos, custodia de bolsas y creación de adeudos. La PWA solo consumirá esos contratos, limitará la UI a dos destinos válidos (`rolito`, `pt`) y separará el traspaso de materia prima del flujo de custodia de bolsas para no seguir mezclando `line_id` libre con ubicaciones reales ni con conciliación de bolsas.

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, passthrough Odoo en `src/lib/api.js`, módulo Odoo externo no incluido en este workspace.

---

## Scope Note
Este plan cubre:
- el repo actual de la PWA
- el contrato backend requerido en Odoo

El addon de Odoo no está en este workspace. Por eso el plan deja una compuerta explícita para congelar rutas, modelos y vistas exactas antes de codificar allá.

## Backend Dependency Gate
Antes o en paralelo a las tareas de este repo, Odoo debe exponer estos contratos:
- configuración de despacho y bolsas por `warehouse_id`
- creación de traspaso de materia prima por `destination_key`
- creación de entrega de bolsas por gerente
- declaración de devolución por trabajador
- validación final por gerente
- creación de adeudo cuando exista faltante

Shape mínimo esperado:
- `GET /api/production/materials/dispatch-config?warehouse_id=N`
- `POST /api/production/materials/dispatch-transfer`
- `GET /api/production/bags/custody/pending?warehouse_id=N&employee_id=N`
- `POST /api/production/bags/custody/issue`
- `POST /api/production/bags/custody/declare`
- `POST /api/production/bags/custody/validate`

Errores semánticos esperados:
- `DISPATCH_CONFIG_MISSING`
- `INVALID_DISPATCH_DESTINATION`
- `BAG_COST_NOT_CONFIGURED`
- `BAG_CUSTODY_ALREADY_EXISTS`
- `BAG_CUSTODY_NOT_FOUND`
- `BAG_CUSTODY_ALREADY_VALIDATED`

## File Structure

### PWA files
- Create: `src/modules/almacen-pt/materialDispatchConfig.js`
  - Normalización de configuración remota de destinos y política de bolsas.
- Create: `tests/materialDispatchConfig.test.mjs`
  - Cobertura del helper de configuración.
- Create: `src/modules/almacen-pt/bagCustodyService.js`
  - Servicio de custodia de bolsas para gerente y trabajador.
- Create: `tests/bagCustodyService.test.mjs`
  - Cobertura de normalización y cálculo monetario.
- Create: `src/modules/admin/ScreenTraspasoMateriaPrima.jsx`
  - Nueva pantalla admin para destino fijo por configuración Odoo.
- Create: `src/modules/admin/ScreenValidacionBolsas.jsx`
  - Validación final de gerente y visualización de adeudo.
- Create: `src/modules/produccion/ScreenDeclaracionBolsas.jsx`
  - Declaración de devolución de bolsas para `operador_rolito`.
- Create: `src/modules/almacen-pt/ScreenDeclaracionBolsasPT.jsx`
  - Declaración de devolución de bolsas para `almacenista_pt`.
- Modify: `src/App.jsx`
  - Rutas nuevas y reemplazo del acceso anterior.
- Modify: `src/modules/admin/ScreenAdminPanel.jsx`
  - Renombre y nueva navegación.
- Modify: `src/modules/admin/components/AdminShell.jsx`
  - Renombre y nueva navegación.
- Modify: `src/modules/almacen-pt/materialsService.js`
  - Dejar de depender solo de `line_id` cuando el flujo venga de admin.
- Modify: `src/lib/api.js`
  - Passthrough a contratos nuevos y preservación de errores semánticos.
- Modify: `src/modules/produccion/ScreenCierreRolito.jsx`
  - Enlazar a declaración de bolsas y dejar de ser la única fuente de verdad.
- Modify: `src/modules/almacen-pt/ScreenAlmacenPT.jsx`
  - Entrada a declaración de bolsas PT.

### Odoo files
Los paths exactos deben confirmarse antes de editar. Este plan asume un addon propio, pero la primera tarea congela esos paths reales. Se esperan al menos:
- Confirm path: `<odoo-addon>/models/stock_warehouse.py`
- Confirm path: `<odoo-addon>/models/material_dispatch_config.py`
- Confirm path: `<odoo-addon>/models/bag_custody.py`
- Confirm path: `<odoo-addon>/models/employee_bag_debt.py`
- Confirm path: `<odoo-addon>/controllers/material_dispatch.py`
- Confirm path: `<odoo-addon>/views/stock_warehouse_views.xml`

## Implementation Order
1. Congelar contratos y rutas reales de Odoo.
2. Añadir helpers puros de configuración y custodia con tests.
3. Reemplazar el acceso admin por la nueva pantalla de `TRASPASO MATERIA PRIMA`.
4. Agregar declaración de bolsas para trabajador.
5. Agregar validación final de gerente y adeudo.
6. Integrar el flujo nuevo con los accesos existentes de rolito y PT.

### Task 1: Freeze Odoo Paths and Backend Contracts

**Files:**
- Create: `docs/superpowers/specs/2026-04-24-traspaso-materia-prima-bolsas-design.md`
- Create: `docs/superpowers/plans/2026-04-24-traspaso-materia-prima-bolsas.md`
- Modify: external Odoo paths to be confirmed in the target addon repo

- [ ] **Step 1: Confirm the exact addon paths and model names in Odoo**

Record the real files and models that will own:
- warehouse-level dispatch config
- bag custody transaction
- employee debt record
- REST controllers

Minimum checklist to freeze:

```text
Addon name:
Config model:
Bag custody model:
Debt model:
Config controller path:
Bag custody controller path:
Warehouse form view path:
```

- [ ] **Step 2: Freeze the request and response contracts**

Write the canonical payloads in the Odoo repo or implementation notes:

```json
{
  "destination_key": "rolito",
  "worker_employee_id": 123,
  "bags_issued": 50,
  "bag_unit_cost": 3.5
}
```

and:

```json
{
  "bags_declared_by_worker": 43,
  "bags_validated_by_manager": 41,
  "difference_bags": 9,
  "difference_amount": 31.5,
  "debt_created": true
}
```

- [ ] **Step 3: Confirm failure semantics**

Document exact backend error codes and when they fire:
- config missing
- destination invalid
- duplicate custody
- cost missing
- already validated

- [ ] **Step 4: Do not start PWA UI work until these names are frozen**

Expected outcome:
- no guessing in `src/lib/api.js`
- no hardcoded location names in frontend

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-traspaso-materia-prima-bolsas-design.md docs/superpowers/plans/2026-04-24-traspaso-materia-prima-bolsas.md
git commit -m "docs: freeze mp dispatch and bag custody contracts"
```

### Task 2: Add Pure Frontend Helpers for Dispatch Config and Bag Custody

**Files:**
- Create: `src/modules/almacen-pt/materialDispatchConfig.js`
- Create: `src/modules/almacen-pt/bagCustodyService.js`
- Create: `tests/materialDispatchConfig.test.mjs`
- Create: `tests/bagCustodyService.test.mjs`

- [ ] **Step 1: Write the failing tests**

`tests/materialDispatchConfig.test.mjs`

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeDispatchConfig,
  getEnabledDispatchDestinations,
} from '../src/modules/almacen-pt/materialDispatchConfig.js'

test('normalizeDispatchConfig keeps only rolito and pt destinations', () => {
  const config = normalizeDispatchConfig({
    material_dispatch: {
      destinations: [
        { key: 'rolito', location_id: 1, location_name: 'ROLITO' },
        { key: 'pt', location_id: 2, location_name: 'PT' },
        { key: 'otro', location_id: 3, location_name: 'OTRO' },
      ],
    },
    bags_policy: { unit_cost: 3.5, auto_create_employee_debt: true },
  })

  assert.deepEqual(
    getEnabledDispatchDestinations(config).map((item) => item.key),
    ['rolito', 'pt']
  )
})
```

`tests/bagCustodyService.test.mjs`

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeBagCustodyRecord,
  computeBagDifference,
} from '../src/modules/almacen-pt/bagCustodyService.js'

test('computeBagDifference creates debt only for positive shortages', () => {
  const summary = computeBagDifference({
    bagsIssued: 10,
    bagsValidatedByManager: 7,
    bagUnitCost: 4,
  })

  assert.equal(summary.differenceBags, 3)
  assert.equal(summary.differenceAmount, 12)
  assert.equal(summary.debtRequired, true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `node --test tests/materialDispatchConfig.test.mjs`
- `node --test tests/bagCustodyService.test.mjs`

Expected:
- FAIL because the new modules do not exist.

- [ ] **Step 3: Write minimal implementations**

`src/modules/almacen-pt/materialDispatchConfig.js`

```js
const ALLOWED_DESTINATIONS = new Set(['rolito', 'pt'])

export function normalizeDispatchConfig(raw = {}) {
  const destinations = Array.isArray(raw?.material_dispatch?.destinations)
    ? raw.material_dispatch.destinations.filter((item) => ALLOWED_DESTINATIONS.has(String(item?.key || '')))
    : []

  return {
    warehouse_id: Number(raw?.warehouse_id || 0) || null,
    warehouse_name: raw?.warehouse_name || '',
    material_dispatch: { destinations },
    bags_policy: {
      product_id: Number(raw?.bags_policy?.product_id || 0) || null,
      product_name: raw?.bags_policy?.product_name || '',
      unit_cost: Number(raw?.bags_policy?.unit_cost || 0),
      auto_create_employee_debt: Boolean(raw?.bags_policy?.auto_create_employee_debt),
    },
  }
}

export function getEnabledDispatchDestinations(config = {}) {
  return Array.isArray(config?.material_dispatch?.destinations)
    ? config.material_dispatch.destinations
    : []
}
```

`src/modules/almacen-pt/bagCustodyService.js`

```js
export function normalizeBagCustodyRecord(raw = {}) {
  return {
    id: Number(raw?.id || 0) || null,
    destination_key: raw?.destination_key || '',
    worker_employee_id: Number(raw?.worker_employee_id || 0) || null,
    manager_employee_id: Number(raw?.manager_employee_id || 0) || null,
    bags_issued: Number(raw?.bags_issued || 0),
    bags_declared_by_worker: Number(raw?.bags_declared_by_worker || 0),
    bags_validated_by_manager: Number(raw?.bags_validated_by_manager || 0),
    bag_unit_cost: Number(raw?.bag_unit_cost || 0),
    state: raw?.state || 'draft',
  }
}

export function computeBagDifference({ bagsIssued = 0, bagsValidatedByManager = 0, bagUnitCost = 0 } = {}) {
  const differenceBags = Math.max(0, Number(bagsIssued) - Number(bagsValidatedByManager))
  const differenceAmount = differenceBags * Number(bagUnitCost || 0)
  return {
    differenceBags,
    differenceAmount,
    debtRequired: differenceBags > 0,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
- `node --test tests/materialDispatchConfig.test.mjs`
- `node --test tests/bagCustodyService.test.mjs`

Expected:
- PASS for destination filtering and shortage calculation.

- [ ] **Step 5: Commit**

```bash
git add src/modules/almacen-pt/materialDispatchConfig.js src/modules/almacen-pt/bagCustodyService.js tests/materialDispatchConfig.test.mjs tests/bagCustodyService.test.mjs
git commit -m "test: add mp dispatch config and bag custody helpers"
```

### Task 3: Wire the New Odoo Contracts Through the Frontend Service Layer

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/modules/almacen-pt/materialsService.js`
- Modify: `src/modules/almacen-pt/bagCustodyService.js`
- Test: `tests/materialDispatchConfig.test.mjs`
- Test: `tests/bagCustodyService.test.mjs`

- [ ] **Step 1: Extend the failing tests with contract normalization**

Add to `tests/materialDispatchConfig.test.mjs`:

```js
test('normalizeDispatchConfig preserves bag unit cost from backend config', () => {
  const config = normalizeDispatchConfig({
    bags_policy: { unit_cost: 2.75 },
  })

  assert.equal(config.bags_policy.unit_cost, 2.75)
})
```

Add to `tests/bagCustodyService.test.mjs`:

```js
test('normalizeBagCustodyRecord coerces state and quantities', () => {
  const record = normalizeBagCustodyRecord({
    id: '15',
    state: 'declared_by_worker',
    bags_issued: '8',
    bags_validated_by_manager: '6',
  })

  assert.equal(record.id, 15)
  assert.equal(record.state, 'declared_by_worker')
  assert.equal(record.bags_issued, 8)
  assert.equal(record.bags_validated_by_manager, 6)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
- `node --test tests/materialDispatchConfig.test.mjs`
- `node --test tests/bagCustodyService.test.mjs`

Expected:
- FAIL until the helpers preserve those fields deterministically.

- [ ] **Step 3: Add passthrough methods to the service layer**

In `src/lib/api.js`, add branches for:
- `GET /api/production/materials/dispatch-config`
- `POST /api/production/materials/dispatch-transfer`
- `GET /api/production/bags/custody/pending`
- `POST /api/production/bags/custody/issue`
- `POST /api/production/bags/custody/declare`
- `POST /api/production/bags/custody/validate`

Requirement:
- preserve semantic backend errors instead of collapsing them to generic strings

In `src/modules/almacen-pt/materialsService.js`, add:

```js
export async function getDispatchConfig({ warehouseId } = {}) {}
export async function createDispatchTransfer({ warehouseId, destinationKey, workerEmployeeId, materialId, qtyIssued, issuedBy, notes } = {}) {}
```

In `src/modules/almacen-pt/bagCustodyService.js`, add:

```js
export async function getPendingBagCustody({ warehouseId, employeeId, role } = {}) {}
export async function issueBagCustody(data = {}) {}
export async function declareBagCustody(data = {}) {}
export async function validateBagCustody(data = {}) {}
```

- [ ] **Step 4: Run tests and build**

Run:
- `node --test tests/materialDispatchConfig.test.mjs tests/bagCustodyService.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.js src/modules/almacen-pt/materialsService.js src/modules/almacen-pt/bagCustodyService.js tests/materialDispatchConfig.test.mjs tests/bagCustodyService.test.mjs
git commit -m "feat: wire mp dispatch and bag custody service contracts"
```

### Task 4: Replace the Admin Entry Point with TRASPASO MATERIA PRIMA

**Files:**
- Create: `src/modules/admin/ScreenTraspasoMateriaPrima.jsx`
- Modify: `src/modules/admin/ScreenAdminPanel.jsx`
- Modify: `src/modules/admin/components/AdminShell.jsx`
- Modify: `src/App.jsx`
- Test: `tests/materialDispatchConfig.test.mjs`

- [ ] **Step 1: Add a failing test for enabled destination order**

Add to `tests/materialDispatchConfig.test.mjs`:

```js
test('getEnabledDispatchDestinations preserves rolito then pt order', () => {
  const config = normalizeDispatchConfig({
    material_dispatch: {
      destinations: [
        { key: 'pt', location_id: 2 },
        { key: 'rolito', location_id: 1 },
      ],
    },
  })

  assert.deepEqual(
    getEnabledDispatchDestinations(config).map((item) => item.key),
    ['rolito', 'pt']
  )
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/materialDispatchConfig.test.mjs`
Expected: FAIL until the helper enforces deterministic UI order.

- [ ] **Step 3: Build the new admin screen**

Create `src/modules/admin/ScreenTraspasoMateriaPrima.jsx` with this minimal behavior:
- load config with `getDispatchConfig()`
- show two destination cards only
- show configured location name below each destination
- allow material selection and quantity capture
- call `createDispatchTransfer()`
- branch UI for missing config

Skeleton:

```jsx
export default function ScreenTraspasoMateriaPrima() {
  // load config
  // choose destination_key
  // choose worker + material + qty
  // submit dispatch transfer
}
```

- [ ] **Step 4: Replace legacy labels and routes**

In `src/modules/admin/ScreenAdminPanel.jsx` and `src/modules/admin/components/AdminShell.jsx`:
- replace `Salida a Rolito` with `TRASPASO MATERIA PRIMA`
- point the route to `/admin/traspaso-materia-prima`

In `src/App.jsx`:
- add route `'/admin/traspaso-materia-prima'`
- keep the old `/almacen-pt/materiales/crear` route for non-admin flows until migration is complete

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/materialDispatchConfig.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin/ScreenTraspasoMateriaPrima.jsx src/modules/admin/ScreenAdminPanel.jsx src/modules/admin/components/AdminShell.jsx src/App.jsx src/modules/almacen-pt/materialDispatchConfig.js tests/materialDispatchConfig.test.mjs
git commit -m "feat: replace salida a rolito with mp dispatch flow"
```

### Task 5: Add Worker Declaration Screens for Bag Returns

**Files:**
- Create: `src/modules/produccion/ScreenDeclaracionBolsas.jsx`
- Create: `src/modules/almacen-pt/ScreenDeclaracionBolsasPT.jsx`
- Modify: `src/App.jsx`
- Modify: `src/modules/produccion/ScreenCierreRolito.jsx`
- Modify: `src/modules/almacen-pt/ScreenAlmacenPT.jsx`
- Test: `tests/bagCustodyService.test.mjs`

- [ ] **Step 1: Add a failing calculation test for no debt on surplus**

Add to `tests/bagCustodyService.test.mjs`:

```js
test('computeBagDifference does not create debt when manager validates all bags', () => {
  const summary = computeBagDifference({
    bagsIssued: 5,
    bagsValidatedByManager: 5,
    bagUnitCost: 4,
  })

  assert.equal(summary.differenceBags, 0)
  assert.equal(summary.differenceAmount, 0)
  assert.equal(summary.debtRequired, false)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bagCustodyService.test.mjs`
Expected: FAIL until the helper handles zero shortage correctly.

- [ ] **Step 3: Build worker declaration screens**

Create `src/modules/produccion/ScreenDeclaracionBolsas.jsx`:
- load pending bag custody for the active `operador_rolito`
- let the worker enter `bags_declared_by_worker`
- send notes and submit through `declareBagCustody()`

Create `src/modules/almacen-pt/ScreenDeclaracionBolsasPT.jsx`:
- same flow, scoped to `almacenista_pt`

Keep both screens focused:
- no final validation by worker
- no debt calculation on the client beyond preview copy

- [ ] **Step 4: Link the screens from current role entry points**

In `src/modules/produccion/ScreenCierreRolito.jsx`:
- replace the current “only local reconciliation” assumption
- add CTA to `/produccion/declaracion-bolsas`
- keep existing voice capture only as local input aid if still useful

In `src/modules/almacen-pt/ScreenAlmacenPT.jsx`:
- add CTA to `/almacen-pt/declaracion-bolsas`

In `src/App.jsx`:
- add both routes

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/bagCustodyService.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/produccion/ScreenDeclaracionBolsas.jsx src/modules/almacen-pt/ScreenDeclaracionBolsasPT.jsx src/modules/produccion/ScreenCierreRolito.jsx src/modules/almacen-pt/ScreenAlmacenPT.jsx src/App.jsx tests/bagCustodyService.test.mjs
git commit -m "feat: add worker bag declaration flows"
```

### Task 6: Add Manager Validation and Debt Visibility

**Files:**
- Create: `src/modules/admin/ScreenValidacionBolsas.jsx`
- Modify: `src/App.jsx`
- Modify: `src/modules/almacen-pt/bagCustodyService.js`
- Test: `tests/bagCustodyService.test.mjs`

- [ ] **Step 1: Add a failing test for shortage amount persistence**

Add to `tests/bagCustodyService.test.mjs`:

```js
test('normalizeBagCustodyRecord preserves difference amount returned by backend', () => {
  const record = normalizeBagCustodyRecord({
    difference_amount: 22.5,
    state: 'validated_with_difference',
  })

  assert.equal(record.difference_amount, 22.5)
  assert.equal(record.state, 'validated_with_difference')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/bagCustodyService.test.mjs`
Expected: FAIL until the normalizer preserves backend-calculated debt data.

- [ ] **Step 3: Build the manager validation screen**

Create `src/modules/admin/ScreenValidacionBolsas.jsx` with:
- pending list by destination and worker
- issue summary
- worker-declared quantity
- manager-validated quantity
- notes field required when difference exists
- debt preview using backend cost
- result state after validation

Primary submit must call `validateBagCustody()` and then show:
- `difference_bags`
- `difference_amount`
- `debt_created`

- [ ] **Step 4: Route and expose the screen**

In `src/App.jsx`:
- add route `/admin/bolsas/validar`

In admin navigation:
- either add a dedicated card
- or add CTA inside `ScreenTraspasoMateriaPrima.jsx` after issue creation

Keep the UX simple:
- dispatch and validation can be separate screens
- do not merge validation into the transfer submit path

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/bagCustodyService.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/admin/ScreenValidacionBolsas.jsx src/App.jsx src/modules/almacen-pt/bagCustodyService.js tests/bagCustodyService.test.mjs
git commit -m "feat: add manager bag validation and debt view"
```

### Task 7: Add Odoo Configuration UI and Business Logic

**Files:**
- Modify: confirmed external Odoo files from Task 1

- [ ] **Step 1: Write backend tests in the Odoo repo**

Create or update tests for:
- warehouse config lookup
- transfer destination resolution
- bag issue creation
- worker declaration
- manager validation with difference
- debt creation only on shortage

Minimum test cases:

```python
def test_dispatch_config_returns_only_rolito_and_pt(self): ...
def test_validate_bags_creates_employee_debt_on_shortage(self): ...
def test_validate_bags_does_not_create_debt_when_balanced(self): ...
```

- [ ] **Step 2: Run backend tests to verify they fail**

Run the addon test command used by that repo.
Expected:
- FAIL until models, views and controllers exist.

- [ ] **Step 3: Implement warehouse configuration in Odoo**

Add fields on warehouse config or a dedicated model:
- `x_mp_dispatch_location_rolito_id`
- `x_mp_dispatch_location_pt_id`
- `x_bag_product_id`
- `x_bag_unit_cost`
- `x_auto_create_bag_debt`

Expose them in the warehouse form view.

- [ ] **Step 4: Implement bag custody and debt creation**

Add transactional logic that:
- creates one open custody per turn+destination
- lets the worker declare
- lets the manager validate with differences
- persists the unit cost used at validation time
- creates the employee debt record when shortage exists

- [ ] **Step 5: Run backend tests to verify they pass**

Run the addon test command again.
Expected:
- PASS for config, validation and debt cases.

- [ ] **Step 6: Commit**

Commit in the Odoo repo with a message similar to:

```bash
git commit -m "feat: add warehouse mp dispatch config and bag custody"
```

## Final Verification
- [ ] Run `node --test tests/materialDispatchConfig.test.mjs tests/bagCustodyService.test.mjs`
- [ ] Run `npm run build`
- [ ] Manual flow 1:
  - abrir admin
  - confirmar texto `TRASPASO MATERIA PRIMA`
  - validar que solo aparecen `Rolito` y `Almacenista PT`
- [ ] Manual flow 2:
  - quitar configuración de un destino en Odoo
  - validar que la PWA muestre falta de configuración
- [ ] Manual flow 3:
  - gerente entrega bolsas a `operador_rolito`
  - operador declara devolución
  - gerente valida con faltante
  - confirmar creación de adeudo
- [ ] Manual flow 4:
  - gerente entrega bolsas a `almacenista_pt`
  - PT declara devolución
  - gerente valida sin faltante
  - confirmar que no se crea adeudo
- [ ] Manual flow 5:
  - crear traspaso de materia prima a ambos destinos
  - confirmar que backend resuelve la ubicación configurada correcta
