# Requisiciones con Recepción por CEDIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar al historial de requisiciones de Admin/Gerente los estados logísticos `Confirmado`, `Parcialmente recibido` y `Recibido`, con recepción parcial real sobre el picking de Odoo y resolución de tipo de operación delegada al backend.

**Architecture:** La PWA seguirá usando `purchase.order` como entidad base. `src/lib/api.js` ampliará el contrato de requisiciones y añadirá passthroughs para detalle/acción de recepción; `src/modules/admin` mostrará badges y abrirá un modal de recepción por línea. La lógica de UI sensible se extraerá a un helper puro para poder probarla con `node:test`, mientras la resolución `empresa + cuenta analítica => picking type` quedará como dependencia del backend Odoo definido en la spec y el prompt ya escritos.

**Tech Stack:** React 18, Vite, `node:test`, BFF local en `src/lib/api.js`, endpoints Odoo `gf_pwa_admin`.

---

## File Map

- Create: `src/modules/admin/requisitionReceiptState.js`
- Create: `src/modules/admin/components/RequisitionReceiptModal.jsx`
- Create: `tests/requisitionReceiptState.test.mjs`
- Modify: `src/modules/admin/api.js:143-180`
- Modify: `src/modules/admin/forms/AdminRequisicionForm.jsx:85-435`
- Modify: `src/modules/admin/components/RequisitionDetailModal.jsx:32-260`
- Modify: `src/lib/api.js:1150-1289`
- Modify: `src/lib/api.js:1804-1805`
- Reference only: `docs/superpowers/specs/2026-04-25-requisiciones-recepcion-cedis-design.md`
- Reference only: `docs/superpowers/specs/2026-04-25-requisiciones-recepcion-cedis-odoo-prompt.md`

## Dependency Gate

This repo can implement the PWA/BFF wiring immediately, but full end-to-end behavior depends on the Odoo workspace exposing the contract defined in:

- `docs/superpowers/specs/2026-04-25-requisiciones-recepcion-cedis-odoo-prompt.md`

Assume these backend capabilities will exist or be added in parallel:

- enriched requisition list/detail with `receipt_state`, `qty_received_total`, `qty_pending_total`, `can_receive`, `incoming_picking_id`
- `GET /pwa-admin/requisition-receipt-detail?id=PO_ID`
- `POST /pwa-admin/requisition-receive`

The BFF should degrade clearly when those fields/endpoints are not yet available.

### Task 1: Add Pure Receipt-State Helpers and Failing Tests

**Files:**
- Create: `src/modules/admin/requisitionReceiptState.js`
- Test: `tests/requisitionReceiptState.test.mjs`

- [ ] **Step 1: Write the failing test for receipt state normalization**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeReceiptState,
  resolveReceiptActionLabel,
} from '../src/modules/admin/requisitionReceiptState.js'

test('normalizeReceiptState maps partially_received to green/yellow UI metadata', () => {
  const state = normalizeReceiptState('partially_received')
  assert.equal(state.key, 'partially_received')
  assert.equal(state.label, 'Parcialmente recibido')
  assert.equal(state.canReceive, true)
})

test('resolveReceiptActionLabel returns continuar for partial receptions', () => {
  assert.equal(resolveReceiptActionLabel({ receipt_state: 'partially_received', can_receive: true }), 'Continuar recepción')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: FAIL with module-not-found or missing export errors.

- [ ] **Step 3: Write minimal helper implementation**

```js
const MAP = {
  confirmed: { key: 'confirmed', label: 'Confirmado', tone: 'blue', canReceive: true },
  partially_received: { key: 'partially_received', label: 'Parcialmente recibido', tone: 'warning', canReceive: true },
  received: { key: 'received', label: 'Recibido', tone: 'success', canReceive: false },
}

export function normalizeReceiptState(value) {
  return MAP[value] || { key: 'none', label: '', tone: 'muted', canReceive: false }
}

export function resolveReceiptActionLabel(row = {}) {
  if (!row?.can_receive) return ''
  return row?.receipt_state === 'partially_received' ? 'Continuar recepción' : 'Recibir producto'
}
```

- [ ] **Step 4: Expand tests for payload helpers before wiring the UI**

```js
import { clampReceiveQty, buildReceivePayloadLines } from '../src/modules/admin/requisitionReceiptState.js'

test('clampReceiveQty never exceeds pending qty', () => {
  assert.equal(clampReceiveQty(12, 5), 5)
})

test('buildReceivePayloadLines skips zero quantities', () => {
  assert.deepEqual(
    buildReceivePayloadLines([
      { move_id: 10, receive_now_qty: 0 },
      { move_id: 11, receive_now_qty: 3 },
    ]),
    [{ move_id: 11, receive_now_qty: 3 }],
  )
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: PASS for all receipt helper cases.

- [ ] **Step 6: Commit**

```bash
git add tests/requisitionReceiptState.test.mjs src/modules/admin/requisitionReceiptState.js
git commit -m "test: add requisition receipt state helpers"
```

### Task 2: Extend Admin API Wrappers and BFF Passthroughs

**Files:**
- Modify: `src/modules/admin/api.js:143-180`
- Modify: `src/lib/api.js:1150-1289`
- Modify: `src/lib/api.js:1804-1805`
- Test: `tests/requisitionReceiptState.test.mjs`

- [ ] **Step 1: Add a failing helper test for BFF fallback normalization**

```js
import { normalizeReceiptSummary } from '../src/modules/admin/requisitionReceiptState.js'

test('normalizeReceiptSummary falls back to confirmed with zero totals when backend fields are absent', () => {
  assert.deepEqual(
    normalizeReceiptSummary({ state: 'purchase' }),
    {
      receipt_state: 'confirmed',
      qty_received_total: 0,
      qty_pending_total: 0,
      can_receive: false,
      incoming_picking_id: 0,
    },
  )
})
```

- [ ] **Step 2: Run targeted test to verify the new case fails**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: FAIL because `normalizeReceiptSummary` does not exist yet.

- [ ] **Step 3: Add API wrapper methods for receipt detail and receive action**

```js
export function getRequisitionReceiptDetail(id) {
  return api('GET', `/pwa-admin/requisition-receipt-detail?id=${id}`)
}

export function receiveRequisitionProducts(data) {
  return api('POST', '/pwa-admin/requisition-receive', data)
}
```

- [ ] **Step 4: Extend the BFF list/detail endpoints to pass through receipt fields with defensive fallbacks**

```js
const receipt_state = row.receipt_state || (row.state === 'purchase' ? 'confirmed' : '')
const qty_received_total = Number(row.qty_received_total || 0)
const qty_pending_total = Number(row.qty_pending_total || 0)
const can_receive = Boolean(row.can_receive)
const incoming_picking_id = Number(row.incoming_picking_id || 0)
```

- [ ] **Step 5: Add passthrough handlers for the two new admin receipt endpoints**

```js
if (cleanPath === '/pwa-admin/requisition-receipt-detail' && method === 'GET') {
  return odooHttp('GET', `/pwa-admin/requisition-receipt-detail?${query.toString()}`, {})
}

if (cleanPath === '/pwa-admin/requisition-receive' && method === 'POST') {
  return odooJson('/pwa-admin/requisition-receive', body || {})
}
```

- [ ] **Step 6: Re-run helper tests after adding the fallback normalizer**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: PASS including `normalizeReceiptSummary`.

- [ ] **Step 7: Smoke-check the repo builds with the new exports**

Run: `npm run build`
Expected: Vite build completes without missing-import or unused-export breakage.

- [ ] **Step 8: Commit**

```bash
git add src/modules/admin/api.js src/lib/api.js src/modules/admin/requisitionReceiptState.js tests/requisitionReceiptState.test.mjs
git commit -m "feat: add requisition receipt api contract"
```

### Task 3: Add a Dedicated Receipt Modal for Requisition Detail

**Files:**
- Create: `src/modules/admin/components/RequisitionReceiptModal.jsx`
- Modify: `src/modules/admin/components/RequisitionDetailModal.jsx:32-260`
- Modify: `src/modules/admin/api.js:143-180`
- Modify: `src/modules/admin/requisitionReceiptState.js`
- Test: `tests/requisitionReceiptState.test.mjs`

- [ ] **Step 1: Add failing tests for the line-level receipt helpers the modal will use**

```js
import { buildEditableReceiptLines, computeReceivableTotals } from '../src/modules/admin/requisitionReceiptState.js'

test('buildEditableReceiptLines derives pending quantities per move line', () => {
  const lines = buildEditableReceiptLines([
    { move_id: 10, qty_ordered: 12, qty_received: 5, qty_pending: 7 },
  ])
  assert.equal(lines[0].receive_now_qty, 7)
})

test('computeReceivableTotals sums only positive edited quantities', () => {
  assert.deepEqual(
    computeReceivableTotals([{ receive_now_qty: 0 }, { receive_now_qty: 4 }]),
    { line_count: 1, qty_total: 4 },
  )
})
```

- [ ] **Step 2: Run targeted tests to verify they fail**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: FAIL because the new helper exports are still missing.

- [ ] **Step 3: Implement the helper functions and create the modal**

```jsx
export default function RequisitionReceiptModal({ requisitionId, onClose, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [lines, setLines] = useState([])

  useEffect(() => {
    getRequisitionReceiptDetail(requisitionId).then((res) => {
      const data = res?.data ?? res
      setDetail(data)
      setLines(buildEditableReceiptLines(data?.lines || []))
    })
  }, [requisitionId])
}
```

- [ ] **Step 4: Extend `RequisitionDetailModal` so it can open the receipt modal and refresh after save**

```jsx
const receiptMeta = normalizeReceiptSummary(detail)
const [receiptOpen, setReceiptOpen] = useState(false)

{receiptMeta.can_receive && (
  <button onClick={() => setReceiptOpen(true)}>
    {resolveReceiptActionLabel(detail)}
  </button>
)}
```

- [ ] **Step 5: Re-run the focused helper tests**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: PASS for the new line-edit helpers.

- [ ] **Step 6: Verify the app still builds with the new modal**

Run: `npm run build`
Expected: PASS with no JSX/import errors.

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/components/RequisitionReceiptModal.jsx src/modules/admin/components/RequisitionDetailModal.jsx src/modules/admin/requisitionReceiptState.js tests/requisitionReceiptState.test.mjs
git commit -m "feat: add requisition receipt modal"
```

### Task 4: Show Receipt Badges and Actions in the History List

**Files:**
- Modify: `src/modules/admin/forms/AdminRequisicionForm.jsx:85-435`
- Modify: `src/modules/admin/components/RequisitionDetailModal.jsx:32-260`
- Modify: `src/modules/admin/requisitionReceiptState.js`
- Test: `tests/requisitionReceiptState.test.mjs`

- [ ] **Step 1: Add failing tests for the badge/action resolver used by the history rows**

```js
import { shouldShowReceiptAction, resolveReceiptBadge } from '../src/modules/admin/requisitionReceiptState.js'

test('resolveReceiptBadge returns received badge metadata for completed receptions', () => {
  const badge = resolveReceiptBadge({ receipt_state: 'received' })
  assert.equal(badge.label, 'Recibido')
  assert.equal(badge.tone, 'success')
})

test('shouldShowReceiptAction hides receive CTA once requisition is fully received', () => {
  assert.equal(shouldShowReceiptAction({ receipt_state: 'received', can_receive: false }), false)
})
```

- [ ] **Step 2: Run targeted test to verify it fails**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: FAIL because the badge/action helpers are not implemented yet.

- [ ] **Step 3: Update the history cards to render both purchase and receipt badges plus a CTA**

```jsx
const receiptBadge = resolveReceiptBadge(req)

{receiptBadge && <Badge label={receiptBadge.label} tone={receiptBadge.tone} />}
{shouldShowReceiptAction(req) && (
  <button onClick={() => setDetailId(req.purchase_order_id ?? req.id)}>
    {resolveReceiptActionLabel(req)}
  </button>
)}
```

- [ ] **Step 4: Keep the existing approval controls intact**

```jsx
const isPendingApproval = req.approval_state === 'pending'
const showReceiveButton = shouldShowReceiptAction(req) && !isPendingApproval
```

- [ ] **Step 5: Re-run the focused helper tests**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: PASS for the new badge/action helpers.

- [ ] **Step 6: Run a full test pass for the repo**

Run: `npm test`
Expected: PASS for existing suites plus `tests/requisitionReceiptState.test.mjs`.

- [ ] **Step 7: Commit**

```bash
git add src/modules/admin/forms/AdminRequisicionForm.jsx src/modules/admin/components/RequisitionDetailModal.jsx src/modules/admin/requisitionReceiptState.js tests/requisitionReceiptState.test.mjs
git commit -m "feat: show requisition receipt states in history"
```

### Task 5: Final Verification and Integration Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-04-25-requisiciones-recepcion-cedis.md`
- Reference only: `docs/superpowers/specs/2026-04-25-requisiciones-recepcion-cedis-odoo-prompt.md`

- [ ] **Step 1: Run the exact verification commands**

Run: `node --test tests/requisitionReceiptState.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Manually verify the frontend flow against a backend with the Odoo contract available**

1. Open Admin → Requisiciones → Historial.
2. Confirm that a confirmed requisition shows `Confirmado`.
3. Open the detail and confirm `Recibir producto` appears only when `can_receive=true`.
4. Submit a partial reception and confirm the list/detail reloads with `Parcialmente recibido`.
5. Submit the remaining quantities and confirm the list/detail reloads with `Recibido`.

- [ ] **Step 3: Record integration blockers explicitly if Odoo is not ready**

```md
- Missing `receipt_state` from Odoo list/detail response
- Missing `/pwa-admin/requisition-receipt-detail`
- Missing `/pwa-admin/requisition-receive`
- Missing backend validation for company + analytic account => picking type
```

- [ ] **Step 4: Commit final integration notes if any repo docs changed**

```bash
git add docs/superpowers/plans/2026-04-25-requisiciones-recepcion-cedis.md
git commit -m "docs: finalize requisition receipt verification plan"
```
