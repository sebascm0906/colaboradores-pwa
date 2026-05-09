# KOLDCUP Produccion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated KOLDCUP PWA module for Braulio to register real Odoo purchases with immediate CEDIS CDMX cash-out, produce sealed cups, close the production day, and transfer finished KOLDCUP to Entregas Glaciem.

**Architecture:** The PWA gets a new `operador_koldcup` module and routes under `/koldcup`. Backend/Odoo remains authoritative for purchases, cash-out, inventory consumption, close validation, and transfers; the PWA calls functional `/pwa-koldcup/*` endpoints and never falls back to generic ORM writes for business mutations. Existing transformation UI is reused through a new `role_scope = "koldcup"` config, while KOLDCUP-specific hub, purchase, close, and transfer screens live under `src/modules/koldcup`.

**Tech Stack:** React 18, React Router, Vite, Node `node:test`, existing `api()` wrapper in `src/lib/api.js`, existing design tokens in `src/tokens.js`.

---

## File Structure

- Create: `src/modules/koldcup/koldcupState.js`
  - Pure normalization, step-status, validation, and formatting helpers. No React, no network.
- Create: `src/modules/koldcup/koldcupService.js`
  - Thin API client for `/pwa-koldcup/*`. No UI logic.
- Create: `src/modules/koldcup/ScreenKoldcupHub.jsx`
  - Mobile-first daily hub with four steps.
- Create: `src/modules/koldcup/ScreenKoldcupCompra.jsx`
  - Purchase capture and confirmation UI.
- Create: `src/modules/koldcup/ScreenKoldcupProduccion.jsx`
  - Wrapper around shared `TransformationScreen` with KOLDCUP role scope.
- Create: `src/modules/koldcup/ScreenKoldcupCorte.jsx`
  - Close summary and final count form.
- Create: `src/modules/koldcup/ScreenKoldcupTraspaso.jsx`
  - Transfer detail/confirmation UI.
- Modify: `src/modules/transformaciones/utils/transformationHelpers.js`
  - Add `koldcup` role-scope config.
- Modify: `src/modules/transformaciones/components/TransformationForm.jsx`
  - Support role-specific input placeholder and submit label.
- Modify: `src/modules/registry.js`
  - Register the KOLDCUP module for `operador_koldcup`.
- Modify: `src/App.jsx`
  - Add lazy imports and private routes for `/koldcup/*`.
- Modify: `src/lib/api.js`
  - Add endpoint pass-throughs for `/pwa-koldcup/*` only if the local BFF intercepts unknown paths in this environment; do not implement generic Odoo writes.
- Test: `tests/koldcupState.test.mjs`
  - Pure helper coverage.
- Test: `tests/koldcupService.test.mjs`
  - API path and payload coverage with mock fetch/api where feasible.
- Test: `tests/transformationHelpers.test.mjs`
  - Extend existing coverage for `role_scope = "koldcup"`.

---

### Task 1: KOLDCUP Pure State Helpers

**Files:**
- Create: `src/modules/koldcup/koldcupState.js`
- Create: `tests/koldcupState.test.mjs`

- [ ] **Step 1: Write failing tests for summary normalization**

Create `tests/koldcupState.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeKoldcupSummary,
  computeKoldcupSteps,
  validateKoldcupPurchaseDraft,
  validateKoldcupCloseDraft,
} from '../src/modules/koldcup/koldcupState.js'

test('normalizes missing KOLDCUP day summary safely', () => {
  const summary = normalizeKoldcupSummary(null)
  assert.equal(summary.purchase.totalAmount, 0)
  assert.equal(summary.production.outputQty, 0)
  assert.equal(summary.close.canClose, false)
  assert.deepEqual(summary.close.blockers, ['Resumen KOLDCUP no disponible'])
})

test('normalizes backend KOLDCUP day summary fields', () => {
  const summary = normalizeKoldcupSummary({
    purchase: { count: 1, total_amount: 1200, has_unlinked_cash_out: false },
    production: { input_qty: 10, output_qty: 2500, scrap_qty: 2 },
    inventory: { input_available_qty: 4, finished_available_qty: 2498 },
    close: { state: 'open', can_close: true, blockers: [], warnings: ['Revisar diferencia'] },
    transfer: { state: 'pending', picking_id: null },
  })
  assert.equal(summary.purchase.count, 1)
  assert.equal(summary.purchase.totalAmount, 1200)
  assert.equal(summary.production.inputQty, 10)
  assert.equal(summary.production.outputQty, 2500)
  assert.equal(summary.inventory.finishedAvailableQty, 2498)
  assert.equal(summary.close.canClose, true)
  assert.equal(summary.transfer.state, 'pending')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/koldcupState.test.mjs`

Expected: FAIL with module not found for `koldcupState.js`.

- [ ] **Step 3: Implement normalization helper**

Create `src/modules/koldcup/koldcupState.js`:

```js
export const KOLDCUP_STEP_STATUS = {
  LOCKED: 'locked',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ALERT: 'alert',
}

function arr(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : []
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function normalizeKoldcupSummary(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      date: '',
      warehouseId: 0,
      cashLocation: null,
      purchase: { count: 0, totalAmount: 0, hasUnlinkedCashOut: false },
      production: { inputQty: 0, outputQty: 0, scrapQty: 0 },
      inventory: { inputAvailableQty: 0, finishedAvailableQty: 0 },
      close: { state: 'unavailable', canClose: false, blockers: ['Resumen KOLDCUP no disponible'], warnings: [] },
      transfer: { state: 'pending', pickingId: null, pickingName: '' },
    }
  }

  const data = raw.data && typeof raw.data === 'object' ? raw.data : raw
  return {
    date: String(data.date || ''),
    warehouseId: num(data.warehouse_id),
    cashLocation: data.cash_location || null,
    purchase: {
      count: num(data.purchase?.count),
      totalAmount: num(data.purchase?.total_amount ?? data.purchase?.totalAmount),
      hasUnlinkedCashOut: Boolean(data.purchase?.has_unlinked_cash_out ?? data.purchase?.hasUnlinkedCashOut),
    },
    production: {
      inputQty: num(data.production?.input_qty ?? data.production?.inputQty),
      outputQty: num(data.production?.output_qty ?? data.production?.outputQty),
      scrapQty: num(data.production?.scrap_qty ?? data.production?.scrapQty),
    },
    inventory: {
      inputAvailableQty: num(data.inventory?.input_available_qty ?? data.inventory?.inputAvailableQty),
      finishedAvailableQty: num(data.inventory?.finished_available_qty ?? data.inventory?.finishedAvailableQty),
    },
    close: {
      state: String(data.close?.state || 'open'),
      canClose: Boolean(data.close?.can_close ?? data.close?.canClose),
      blockers: arr(data.close?.blockers),
      warnings: arr(data.close?.warnings),
    },
    transfer: {
      state: String(data.transfer?.state || 'pending'),
      pickingId: data.transfer?.picking_id ?? data.transfer?.pickingId ?? null,
      pickingName: String(data.transfer?.picking_name ?? data.transfer?.pickingName ?? ''),
    },
  }
}
```

- [ ] **Step 4: Add failing tests for step statuses and validation**

Append to `tests/koldcupState.test.mjs`:

```js
test('computes KOLDCUP step states from summary', () => {
  const summary = normalizeKoldcupSummary({
    purchase: { count: 1, total_amount: 1200 },
    production: { output_qty: 2500 },
    close: { state: 'open', can_close: true, blockers: [] },
    transfer: { state: 'pending' },
  })
  const steps = computeKoldcupSteps(summary)
  assert.equal(steps.find((s) => s.id === 'compra').status, 'completed')
  assert.equal(steps.find((s) => s.id === 'produccion').status, 'completed')
  assert.equal(steps.find((s) => s.id === 'corte').status, 'in_progress')
  assert.equal(steps.find((s) => s.id === 'traspaso').status, 'pending')
})

test('flags purchase validation errors', () => {
  assert.deepEqual(validateKoldcupPurchaseDraft({}), {
    product_id: 'Selecciona un insumo',
    qty: 'Captura cantidad mayor a cero',
    unit_price: 'Captura precio mayor a cero',
  })
})

test('requires difference reason when close has blockers and count differs', () => {
  const errors = validateKoldcupCloseDraft({
    final_input_count: 2,
    final_finished_count: 20,
    expected_input_count: 3,
    expected_finished_count: 20,
    difference_reason: '',
  })
  assert.equal(errors.difference_reason, 'Explica la diferencia antes de cerrar')
})
```

- [ ] **Step 5: Implement step and validation helpers**

Add to `src/modules/koldcup/koldcupState.js`:

```js
export function computeKoldcupSteps(summaryInput) {
  const summary = normalizeKoldcupSummary(summaryInput)
  const purchaseDone = summary.purchase.count > 0 && !summary.purchase.hasUnlinkedCashOut
  const productionDone = summary.production.outputQty > 0
  const closeDone = summary.close.state === 'closed'
  const transferDone = ['done', 'completed', 'validated'].includes(summary.transfer.state)
  const closeBlocked = summary.close.blockers.length > 0

  return [
    {
      id: 'compra',
      label: 'Compra',
      route: '/koldcup/compra',
      status: purchaseDone ? KOLDCUP_STEP_STATUS.COMPLETED : KOLDCUP_STEP_STATUS.IN_PROGRESS,
      badge: purchaseDone ? `$${summary.purchase.totalAmount.toFixed(2)}` : 'Pendiente',
    },
    {
      id: 'produccion',
      label: 'Produccion',
      route: '/koldcup/produccion',
      status: !purchaseDone
        ? KOLDCUP_STEP_STATUS.LOCKED
        : productionDone ? KOLDCUP_STEP_STATUS.COMPLETED : KOLDCUP_STEP_STATUS.IN_PROGRESS,
      badge: productionDone ? `${summary.production.outputQty} vasos` : '',
    },
    {
      id: 'corte',
      label: 'Corte',
      route: '/koldcup/corte',
      status: closeDone
        ? KOLDCUP_STEP_STATUS.COMPLETED
        : closeBlocked ? KOLDCUP_STEP_STATUS.ALERT
          : productionDone ? KOLDCUP_STEP_STATUS.IN_PROGRESS : KOLDCUP_STEP_STATUS.LOCKED,
      badge: closeDone ? 'Cerrado' : closeBlocked ? 'Bloqueado' : '',
    },
    {
      id: 'traspaso',
      label: 'Traspaso',
      route: '/koldcup/traspaso',
      status: transferDone
        ? KOLDCUP_STEP_STATUS.COMPLETED
        : closeDone || summary.close.canClose ? KOLDCUP_STEP_STATUS.PENDING : KOLDCUP_STEP_STATUS.LOCKED,
      badge: summary.transfer.pickingName || '',
    },
  ]
}

export function validateKoldcupPurchaseDraft(draft = {}) {
  const errors = {}
  if (!Number(draft.product_id || 0)) errors.product_id = 'Selecciona un insumo'
  if (Number(draft.qty || 0) <= 0) errors.qty = 'Captura cantidad mayor a cero'
  if (Number(draft.unit_price || 0) <= 0) errors.unit_price = 'Captura precio mayor a cero'
  return errors
}

export function validateKoldcupCloseDraft(draft = {}) {
  const errors = {}
  if (Number(draft.final_input_count || 0) < 0) errors.final_input_count = 'No puede ser negativo'
  if (Number(draft.final_finished_count || 0) < 0) errors.final_finished_count = 'No puede ser negativo'
  const inputDiff = Number(draft.final_input_count || 0) !== Number(draft.expected_input_count || 0)
  const finishedDiff = Number(draft.final_finished_count || 0) !== Number(draft.expected_finished_count || 0)
  if ((inputDiff || finishedDiff) && !String(draft.difference_reason || '').trim()) {
    errors.difference_reason = 'Explica la diferencia antes de cerrar'
  }
  return errors
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- tests/koldcupState.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/koldcup/koldcupState.js tests/koldcupState.test.mjs
git commit -m "feat: add koldcup state helpers"
```

---

### Task 2: KOLDCUP API Service

**Files:**
- Create: `src/modules/koldcup/koldcupService.js`
- Test: `tests/koldcupState.test.mjs` or `tests/koldcupService.test.mjs`

- [ ] **Step 1: Write tests for request payload builders if direct API mocking is awkward**

Prefer testing pure exported builders from `koldcupService.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildKoldcupPurchasePayload,
  buildKoldcupClosePayload,
  buildKoldcupTransferPayload,
} from '../src/modules/koldcup/koldcupService.js'

test('builds KOLDCUP purchase payload with numeric fields', () => {
  assert.deepEqual(buildKoldcupPurchasePayload({
    warehouseId: '76',
    employeeId: '9',
    supplierId: '5',
    productId: '7',
    qty: '10',
    unitPrice: '120',
    notes: ' compra ',
  }), {
    warehouse_id: 76,
    employee_id: 9,
    supplier_id: 5,
    product_id: 7,
    qty: 10,
    unit_price: 120,
    notes: 'compra',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/koldcupService.test.mjs`

Expected: FAIL with missing module.

- [ ] **Step 3: Implement `koldcupService.js`**

```js
import { api } from '../../lib/api'

function qs(filters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const n = (value) => Number(value || 0) || 0

export function buildKoldcupPurchasePayload({
  warehouseId,
  employeeId,
  supplierId,
  productId,
  qty,
  unitPrice,
  notes,
}) {
  const payload = {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    product_id: n(productId),
    qty: n(qty),
    unit_price: n(unitPrice),
    notes: String(notes || '').trim(),
  }
  if (n(supplierId)) payload.supplier_id = n(supplierId)
  return payload
}

export function buildKoldcupClosePayload({ warehouseId, employeeId, date, finalInputCount, finalFinishedCount, differenceReason }) {
  return {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    date,
    final_input_count: n(finalInputCount),
    final_finished_count: n(finalFinishedCount),
    difference_reason: String(differenceReason || '').trim(),
  }
}

export function buildKoldcupTransferPayload({ warehouseId, employeeId, date, productId, qty }) {
  return {
    warehouse_id: n(warehouseId),
    employee_id: n(employeeId),
    date,
    product_id: n(productId),
    qty: n(qty),
  }
}

export function getKoldcupDaySummary({ warehouseId, employeeId, date } = {}) {
  return api('GET', `/pwa-koldcup/day-summary${qs({ warehouse_id: warehouseId, employee_id: employeeId, date })}`)
}

export function getKoldcupPurchaseCatalog({ warehouseId, employeeId } = {}) {
  return api('GET', `/pwa-koldcup/purchase-catalog${qs({ warehouse_id: warehouseId, employee_id: employeeId })}`)
}

export function createKoldcupPurchase(payload) {
  return api('POST', '/pwa-koldcup/purchase-create', payload)
}

export function closeKoldcupDay(payload) {
  return api('POST', '/pwa-koldcup/day-close', payload)
}

export function transferKoldcupToEntregas(payload) {
  return api('POST', '/pwa-koldcup/transfer-to-entregas', payload)
}
```

- [ ] **Step 4: Run service tests**

Run: `npm run test -- tests/koldcupService.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/koldcup/koldcupService.js tests/koldcupService.test.mjs
git commit -m "feat: add koldcup service client"
```

---

### Task 3: Transformation Scope for KOLDCUP

**Files:**
- Modify: `src/modules/transformaciones/utils/transformationHelpers.js`
- Modify: `src/modules/transformaciones/components/TransformationForm.jsx`
- Modify: `tests/transformationHelpers.test.mjs`

- [ ] **Step 1: Add failing helper tests**

Extend `tests/transformationHelpers.test.mjs`:

```js
test('returns role config for koldcup transformations', () => {
  const config = getRoleScopeConfig('koldcup')
  assert.equal(config.title, 'Produccion KOLDCUP')
  assert.equal(config.subtitle, 'Vasos sellados')
  assert.equal(config.backTo, '/koldcup')
  assert.equal(config.outputUomLabel, 'vasos')
  assert.equal(config.apiBase, '/pwa-koldcup')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/transformationHelpers.test.mjs`

Expected: FAIL because `koldcup` falls back to `pt`.

- [ ] **Step 3: Add `koldcup` to `ROLE_SCOPE_CONFIG`**

In `src/modules/transformaciones/utils/transformationHelpers.js`, add:

```js
koldcup: {
  title: 'Produccion KOLDCUP',
  subtitle: 'Vasos sellados',
  backTo: '/koldcup',
  outputUomLabel: 'vasos',
  inputPlaceholder: 'Cantidad consumida',
  outputPlaceholder: 'Vasos sellados',
  submitLabel: 'Confirmar produccion',
  apiBase: '/pwa-koldcup',
  defaultWarehouseId: 0,
},
```

- [ ] **Step 4: Update form labels without breaking PT/Entregas**

In `src/modules/transformaciones/components/TransformationForm.jsx`:

```jsx
placeholder={roleConfig.inputPlaceholder || 'Barras utilizadas'}
```

and:

```jsx
placeholder={roleConfig.outputPlaceholder || `${roleConfig.outputUomLabel} producidas`}
```

and:

```jsx
{saving ? 'Guardando...' : (roleConfig.submitLabel || 'Confirmar transformacion')}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/transformationHelpers.test.mjs
npm run test -- tests/koldcupState.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/transformaciones/utils/transformationHelpers.js src/modules/transformaciones/components/TransformationForm.jsx tests/transformationHelpers.test.mjs
git commit -m "feat: support koldcup transformations"
```

---

### Task 4: Register KOLDCUP Module and Routes

**Files:**
- Modify: `src/modules/registry.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Add failing registry test**

Extend `tests/effectiveRoles.test.mjs` or create `tests/modulesRegistry.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { getModulesForRole } from '../src/modules/registry.js'

test('operador_koldcup sees KOLDCUP module', () => {
  const modules = getModulesForRole('operador_koldcup')
  assert.ok(modules.some((module) => module.id === 'koldcup' && module.route === '/koldcup'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/modulesRegistry.test.mjs`

Expected: FAIL because no `koldcup` module exists.

- [ ] **Step 3: Register module**

Add to `src/modules/registry.js` near operational modules:

```js
{
  id:     'koldcup',
  label:  'KOLDCUP',
  route:  '/koldcup',
  tone:   'blue',
  roles:  ['operador_koldcup'],
  status: 'live',
  icon:   'produccion',
},
```

- [ ] **Step 4: Add lazy imports and routes**

In `src/App.jsx`, add lazy imports:

```js
const ScreenKoldcupHub        = lazy(() => import('./modules/koldcup/ScreenKoldcupHub'))
const ScreenKoldcupCompra     = lazy(() => import('./modules/koldcup/ScreenKoldcupCompra'))
const ScreenKoldcupProduccion = lazy(() => import('./modules/koldcup/ScreenKoldcupProduccion'))
const ScreenKoldcupCorte      = lazy(() => import('./modules/koldcup/ScreenKoldcupCorte'))
const ScreenKoldcupTraspaso   = lazy(() => import('./modules/koldcup/ScreenKoldcupTraspaso'))
```

Add routes inside authenticated routes:

```jsx
<Route path="/koldcup" element={<PrivateRoute><ScreenKoldcupHub /></PrivateRoute>} />
<Route path="/koldcup/compra" element={<PrivateRoute><ScreenKoldcupCompra /></PrivateRoute>} />
<Route path="/koldcup/produccion" element={<PrivateRoute><ScreenKoldcupProduccion /></PrivateRoute>} />
<Route path="/koldcup/corte" element={<PrivateRoute><ScreenKoldcupCorte /></PrivateRoute>} />
<Route path="/koldcup/traspaso" element={<PrivateRoute><ScreenKoldcupTraspaso /></PrivateRoute>} />
```

- [ ] **Step 5: Create temporary screen stubs to keep build green**

Create each screen with minimal default export returning `null` or a shell placeholder. These will be replaced in later tasks.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- tests/modulesRegistry.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/registry.js src/App.jsx src/modules/koldcup/ScreenKoldcup*.jsx tests/modulesRegistry.test.mjs
git commit -m "feat: register koldcup module routes"
```

---

### Task 5: KOLDCUP Hub Screen

**Files:**
- Modify: `src/modules/koldcup/ScreenKoldcupHub.jsx`
- Use: `src/modules/koldcup/koldcupState.js`
- Use: `src/modules/koldcup/koldcupService.js`

- [ ] **Step 1: Implement hub UI**

Use the existing visual pattern from `src/modules/entregas/ScreenHubDia.jsx` and `src/modules/entregas/components/StepTimeline.jsx`, but keep it focused:
- header title: `KOLDCUP`
- subtitle: warehouse/session date
- refresh action
- four step buttons using `computeKoldcupSteps(summary)`
- KPI cards for compra total, vasos producidos, inventario terminado
- error box that preserves backend error text

- [ ] **Step 2: Use session context**

Read:

```js
const { session } = useSession()
const warehouseId = session?.warehouse_id || 0
const employeeId = session?.employee_id || 0
```

Load with:

```js
const raw = await getKoldcupDaySummary({ warehouseId, employeeId, date: todayIso() })
setSummary(normalizeKoldcupSummary(raw))
```

- [ ] **Step 3: Navigate by step route**

For unlocked steps:

```js
onClick={() => navigate(step.route)}
```

Locked steps should be disabled or visually muted.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/koldcup/ScreenKoldcupHub.jsx
git commit -m "feat: add koldcup daily hub"
```

---

### Task 6: KOLDCUP Purchase Screen

**Files:**
- Modify: `src/modules/koldcup/ScreenKoldcupCompra.jsx`
- Use: `src/modules/koldcup/koldcupService.js`
- Use: `src/modules/koldcup/koldcupState.js`

- [ ] **Step 1: Implement catalog loading**

Load `getKoldcupPurchaseCatalog({ warehouseId, employeeId })`.

Normalize minimal UI assumptions:
- suppliers from `data.suppliers || data.providers || []`
- products from `data.products || data.items || []`
- cash box from `data.cash_location || data.cash_box`

- [ ] **Step 2: Implement form**

Fields:
- supplier select if suppliers exist
- product select
- qty number input
- unit price number input
- notes textarea

Computed:

```js
const total = Number(draft.qty || 0) * Number(draft.unit_price || 0)
```

Submit button text: `Registrar compra y salida de caja`.

- [ ] **Step 3: Validate using pure helper**

On submit:

```js
const errors = validateKoldcupPurchaseDraft(draft)
if (Object.keys(errors).length) return
```

- [ ] **Step 4: Submit atomic backend request**

Build payload with `buildKoldcupPurchasePayload` and call `createKoldcupPurchase`.

On success:
- show purchase folio
- show cash-out id/name
- reset qty/unit price/notes

On error:
- display `err.message` without replacing semantic backend errors.

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/koldcup/ScreenKoldcupCompra.jsx
git commit -m "feat: add koldcup purchase capture"
```

---

### Task 7: KOLDCUP Production Screen

**Files:**
- Modify: `src/modules/koldcup/ScreenKoldcupProduccion.jsx`

- [ ] **Step 1: Replace stub with shared transformation wrapper**

```jsx
import TransformationScreen from '../transformaciones/TransformationScreen'

export default function ScreenKoldcupProduccion() {
  return <TransformationScreen roleScope="koldcup" />
}
```

- [ ] **Step 2: Run scoped tests and build**

Run:

```bash
npm run test -- tests/transformationHelpers.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/koldcup/ScreenKoldcupProduccion.jsx
git commit -m "feat: add koldcup production screen"
```

---

### Task 8: KOLDCUP Close Screen

**Files:**
- Modify: `src/modules/koldcup/ScreenKoldcupCorte.jsx`
- Use: `src/modules/koldcup/koldcupState.js`
- Use: `src/modules/koldcup/koldcupService.js`

- [ ] **Step 1: Load and render summary**

Use `getKoldcupDaySummary`, normalize it, and render:
- compras del dia
- salida total caja CEDIS CDMX
- insumo consumido
- vasos producidos
- inventario restante
- blockers/warnings

- [ ] **Step 2: Pre-fill close draft from summary**

```js
setDraft({
  final_input_count: summary.inventory.inputAvailableQty,
  final_finished_count: summary.inventory.finishedAvailableQty,
  expected_input_count: summary.inventory.inputAvailableQty,
  expected_finished_count: summary.inventory.finishedAvailableQty,
  difference_reason: '',
})
```

- [ ] **Step 3: Validate and submit**

Use `validateKoldcupCloseDraft`.

On submit:

```js
const payload = buildKoldcupClosePayload({
  warehouseId,
  employeeId,
  date: summary.date || todayIso(),
  finalInputCount: draft.final_input_count,
  finalFinishedCount: draft.final_finished_count,
  differenceReason: draft.difference_reason,
})
await closeKoldcupDay(payload)
```

- [ ] **Step 4: UX behavior**

Disable close when `summary.close.blockers.length > 0` unless backend explicitly returns `canClose: true`.
Show backend blockers as a red list and warnings as amber list.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm run test -- tests/koldcupState.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/koldcup/ScreenKoldcupCorte.jsx
git commit -m "feat: add koldcup day close"
```

---

### Task 9: KOLDCUP Transfer Screen

**Files:**
- Modify: `src/modules/koldcup/ScreenKoldcupTraspaso.jsx`
- Use: `src/modules/koldcup/koldcupService.js`

- [ ] **Step 1: Load summary**

Show:
- transfer state
- picking name if present
- finished available qty
- backend origin/destination if returned

- [ ] **Step 2: Submit transfer**

Call `transferKoldcupToEntregas(buildKoldcupTransferPayload(...))`.

If product id is not present in summary, do not guess; show backend/configuration message:
`No se puede crear traspaso: falta producto KOLDCUP en el resumen del backend.`

- [ ] **Step 3: Preserve backend errors**

If backend returns `koldcup_transfer_destination_missing`, show it directly with a friendly prefix:
`Configuracion incompleta: koldcup_transfer_destination_missing`.

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/koldcup/ScreenKoldcupTraspaso.jsx
git commit -m "feat: add koldcup transfer screen"
```

---

### Task 10: BFF Pass-Through Check

**Files:**
- Inspect: `src/lib/api.js`
- Modify: `src/lib/api.js` only if required

- [ ] **Step 1: Inspect current unknown endpoint handling**

Search:

```bash
rg -n "pwa-koldcup|No handler|cleanPath|odooHttp|generic" src/lib/api.js
```

- [ ] **Step 2: Decide if pass-through is needed**

If `api()` already forwards unknown `/pwa-*` calls to backend, do not edit `src/lib/api.js`.

If the local BFF blocks unknown `/pwa-koldcup/*`, add explicit pass-throughs that delegate to functional Odoo endpoints only. Do not write generic `purchase.order`, cash, stock, or picking records in `src/lib/api.js`.

- [ ] **Step 3: Add tests only for routing behavior if edited**

If edited, add a narrow test to prove `/pwa-koldcup/day-summary` does not fall through to generic write logic.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit if files changed**

```bash
git add src/lib/api.js tests/<new-test>.test.mjs
git commit -m "feat: pass through koldcup endpoints"
```

If no change needed, record in final implementation notes: `src/lib/api.js already delegates unknown endpoints; no BFF edit required.`

---

### Task 11: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Run full test suite**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Start dev server**

Run: `npm run dev`

Expected: Vite serves a local URL, usually `http://localhost:5173/`.

- [ ] **Step 4: Manual smoke test**

In browser:
- login with or simulate a session that has `operador_koldcup`
- confirm home shows `KOLDCUP`
- open `/koldcup`
- verify hub renders loading/error state without blank screen
- open `/koldcup/compra`
- verify validation errors appear for empty form
- open `/koldcup/produccion`
- verify title/copy says KOLDCUP/Vasos
- open `/koldcup/corte`
- verify blockers/warnings render if backend returns them
- open `/koldcup/traspaso`
- verify missing config errors are actionable

- [ ] **Step 5: Commit any final fixes**

```bash
git status --short
git add <final-files>
git commit -m "fix: polish koldcup flow"
```

---

## Backend Handoff Notes

The PWA implementation depends on functional backend endpoints:
- `GET /pwa-koldcup/day-summary`
- `GET /pwa-koldcup/purchase-catalog`
- `POST /pwa-koldcup/purchase-create`
- `GET /pwa-koldcup/transformation-catalog`
- `POST /pwa-koldcup/transformation-create`
- `POST /pwa-koldcup/day-close`
- `POST /pwa-koldcup/transfer-to-entregas`

The backend must keep these operations authoritative and transactional:
- purchase + immediate Caja CEDIS CDMX cash-out
- inventory receipt or posting for purchased input
- KOLDCUP recipe validation and stock consumption
- day-close blockers
- transfer origin/destination resolution to Entregas Glaciem

Do not implement these business mutations in the frontend BFF with generic ORM writes.
