# Cierre de Supervisión con Handover PT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el cierre del supervisor dispare un handover obligatorio de Almacén PT, que PT quede bloqueado para movimientos hasta que exista aceptación por otro `almacenista_pt`, y que la PWA refleje ese estado de forma consistente.

**Architecture:** El backend seguirá siendo la autoridad real: `/pwa-prod/shift-close` debe cerrar supervisión y devolver el estado del handover PT obligatorio, mientras los endpoints PT existentes (`/pwa-pt/shift-handover-*`, recepción, transformación, traspaso y merma) deben respetar un bloqueo transversal por relevo pendiente. En la PWA, un helper puro centralizará la normalización del estado de handover PT para que `ptService`, el hub de PT, la pantalla de handover y el cierre de supervisión consuman la misma semántica.

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, passthrough Odoo en `src/lib/api.js`.

---

## Scope Note
Este plan cubre el workspace PWA y deja explícito el contrato backend que debe existir para que el flujo quede completo. Sin ese contrato, la PWA solo podría mostrar UX parcial, pero no garantizar el bloqueo real de PT.

## Backend Dependency Gate
Antes o en paralelo a las tareas de este repo, el backend Odoo debe exponer o ajustar estos contratos:
- `POST /pwa-prod/shift-close`
  - cerrar supervisor
  - crear el handover PT obligatorio post-cierre
  - devolver `pt_handover_created`, `pt_handover_id`, `pt_status`, `pt_blocked`
- `GET /pwa-pt/shift-handover-pending`
  - incluir metadatos como `required_after_supervisor_close`, `source_shift_id`, `warehouse_blocked`, `count_submitted`
- `POST /pwa-pt/shift-handover-create`
  - soportar creación normal y actualización/submit del handover obligatorio post-cierre
  - idealmente aceptar `handover_id` opcional para no crear duplicados
- `POST /pwa-pt/shift-handover-accept`
  - al aceptar, liberar el bloqueo de PT
- endpoints PT que alteran inventario
  - devolver error semántico `PT_BLOCKED_BY_HANDOVER` mientras exista relevo pendiente

Si esos contratos cambian de nombre o forma, ajustar primero esta sección y luego el resto del plan.

## File Structure
- Create: `src/modules/almacen-pt/ptHandoverState.js`
  - Helper puro para normalizar handover pendiente, estado bloqueado y mensajes de error PT.
- Create: `tests/ptHandoverState.test.mjs`
  - Cobertura de normalización del handover obligatorio post-cierre.
- Modify: `src/modules/almacen-pt/ptService.js`
  - Consumir el helper central, propagar flags de bloqueo y traducir errores semánticos PT.
- Modify: `src/modules/almacen-pt/ScreenAlmacenPT.jsx`
  - Banner y priorización de acción para handover obligatorio.
- Modify: `src/modules/almacen-pt/ScreenHandoverPT.jsx`
  - Distinguir entre entrega manual y handover obligatorio post-cierre.
- Modify: `src/modules/almacen-pt/ScreenRecepcion.jsx`
  - Manejar bloqueo por handover pendiente.
- Modify: `src/modules/almacen-pt/ScreenTransformacionPT.jsx`
  - Manejar bloqueo por handover pendiente.
- Modify: `src/modules/almacen-pt/ScreenTraspasoPT.jsx`
  - Manejar bloqueo por handover pendiente.
- Modify: `src/modules/almacen-pt/ScreenMermaPT.jsx`
  - Manejar bloqueo por handover pendiente.
- Modify: `src/modules/shared/supervisorAuth.js`
  - Conservar el resultado expandido del cierre del supervisor.
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
  - Mostrar el resultado del cierre con creación de handover PT.
- Modify: `src/lib/api.js`
  - Preservar el contrato expandido del cierre supervisor y no perder errores semánticos PT.

## Implementation Order
1. Normalizar el estado de handover PT en un helper puro y cubrirlo con tests.
2. Integrar ese helper en `ptService` y en el hub de PT.
3. Adaptar `ScreenHandoverPT` al handover obligatorio post-cierre.
4. Propagar el bloqueo a las pantallas de movimientos PT.
5. Ajustar el cierre del supervisor para reflejar el resultado expandido.

### Task 1: Add a Pure PT Handover State Helper

**Files:**
- Create: `src/modules/almacen-pt/ptHandoverState.js`
- Create: `tests/ptHandoverState.test.mjs`
- Test: `tests/ptHandoverState.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePendingPtHandover,
  derivePtBlockState,
  translatePtBlockedError,
} from '../src/modules/almacen-pt/ptHandoverState.js'

test('normalizePendingPtHandover marks supervisor-close handover as required and blocking', () => {
  const handover = normalizePendingPtHandover({
    id: 55,
    source_shift_id: 91,
    required_after_supervisor_close: true,
    warehouse_blocked: true,
    count_submitted: false,
  })

  assert.equal(handover.id, 55)
  assert.equal(handover.required_after_supervisor_close, true)
  assert.equal(handover.warehouse_blocked, true)
  assert.equal(handover.count_submitted, false)
})

test('derivePtBlockState prefers explicit backend block flags', () => {
  const state = derivePtBlockState({
    summary: { pt_blocked_by_handover: true, shift_handover_pending: true },
    handover: { id: 55, warehouse_blocked: true },
  })

  assert.equal(state.blocked, true)
  assert.equal(state.reason, 'handover_pending')
})

test('translatePtBlockedError returns operator-safe copy for semantic backend code', () => {
  assert.equal(
    translatePtBlockedError('PT_BLOCKED_BY_HANDOVER'),
    'PT cerrado por relevo pendiente. Acepta el turno para continuar.'
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: FAIL with `Cannot find module '../src/modules/almacen-pt/ptHandoverState.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
export function normalizePendingPtHandover(raw = {}) {
  return {
    ...raw,
    id: Number(raw?.id || 0),
    source_shift_id: Number(raw?.source_shift_id || 0) || null,
    required_after_supervisor_close: Boolean(raw?.required_after_supervisor_close),
    warehouse_blocked: Boolean(raw?.warehouse_blocked),
    count_submitted: Boolean(raw?.count_submitted),
  }
}

export function derivePtBlockState({ summary = {}, handover = null } = {}) {
  const blocked = Boolean(summary?.pt_blocked_by_handover || handover?.warehouse_blocked)
  return {
    blocked,
    reason: blocked ? 'handover_pending' : 'none',
  }
}

export function translatePtBlockedError(codeOrMessage = '') {
  const value = String(codeOrMessage || '')
  if (value.includes('PT_BLOCKED_BY_HANDOVER')) {
    return 'PT cerrado por relevo pendiente. Acepta el turno para continuar.'
  }
  return value || 'Error operando Almacén PT'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: PASS for normalization and translation cases.

- [ ] **Step 5: Commit**

```bash
git add tests/ptHandoverState.test.mjs src/modules/almacen-pt/ptHandoverState.js
git commit -m "test: add pt handover state helpers"
```

### Task 2: Normalize PT Summary and Pending Handover in the Service Layer

**Files:**
- Modify: `src/modules/almacen-pt/ptService.js`
- Modify: `src/modules/almacen-pt/ptHandoverState.js`
- Test: `tests/ptHandoverState.test.mjs`

- [ ] **Step 1: Extend the failing test with summary normalization**

Add to `tests/ptHandoverState.test.mjs`:

```js
test('derivePtBlockState also blocks when summary exposes the new backend flag', () => {
  const state = derivePtBlockState({
    summary: {
      pt_blocked_by_handover: true,
      pt_block_reason: 'handover_pending',
      shift_handover_pending: true,
    },
    handover: null,
  })

  assert.equal(state.blocked, true)
  assert.equal(state.reason, 'handover_pending')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: FAIL until the helper preserves the backend block reason.

- [ ] **Step 3: Integrate the helper in `ptService.js`**

In [src/modules/almacen-pt/ptService.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ptService.js):
- import `normalizePendingPtHandover`, `derivePtBlockState`, `translatePtBlockedError`
- update `getDaySummary()` to preserve:
  - `pt_blocked_by_handover`
  - `pt_block_reason`
  - `shift_handover_required_after_close`
  - `shift_handover_id`
- update `getPendingHandover()` to normalize payload through `normalizePendingPtHandover()`
- update `createTransfer()`, `confirmReception()`, `createTransformation()` and `createScrap()` so they rethrow semantic PT block errors with `translatePtBlockedError()`

Expected shape returned by `getDaySummary()`:

```js
return {
  ...existingSummary,
  shift_handover_pending: handoverPending,
  shift_handover_required_after_close: Boolean(backendSummary?.shift_handover_required_after_close),
  pt_blocked_by_handover: blockState.blocked,
  pt_block_reason: blockState.reason,
}
```

- [ ] **Step 4: Run targeted test and build**

Run:
- `node --test tests/ptHandoverState.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/almacen-pt/ptService.js src/modules/almacen-pt/ptHandoverState.js tests/ptHandoverState.test.mjs
git commit -m "feat: normalize blocked pt handover state"
```

### Task 3: Convert PT Handover Screen into the Required Post-Close Flow

**Files:**
- Modify: `src/modules/almacen-pt/ScreenHandoverPT.jsx`
- Modify: `src/modules/almacen-pt/ptService.js`
- Modify: `src/modules/almacen-pt/ScreenAlmacenPT.jsx`
- Test: `tests/ptHandoverState.test.mjs`

- [ ] **Step 1: Extend the failing test with required-post-close semantics**

Add to `tests/ptHandoverState.test.mjs`:

```js
test('normalizePendingPtHandover preserves required-post-close metadata for UI branching', () => {
  const handover = normalizePendingPtHandover({
    id: 77,
    required_after_supervisor_close: true,
    warehouse_blocked: true,
    source_shift_id: 99,
    count_submitted: false,
  })

  assert.equal(handover.required_after_supervisor_close, true)
  assert.equal(handover.source_shift_id, 99)
  assert.equal(handover.count_submitted, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: FAIL until the helper returns those fields deterministically.

- [ ] **Step 3: Update the PT hub and handover screen**

In [src/modules/almacen-pt/ScreenAlmacenPT.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenAlmacenPT.jsx):
- when `summary.pt_blocked_by_handover` is true, make the handover card the operational next step
- replace the generic pending copy with copy specific to the post-close relevo, for example:
  - title: `PT cerrado por relevo pendiente`
  - subtitle: `Captura o acepta el conteo para reabrir PT`

In [src/modules/almacen-pt/ScreenHandoverPT.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenHandoverPT.jsx):
- detect when the pending handover is `required_after_supervisor_close`
- if `count_submitted` is false, show the outgoing-count capture flow on the pending handover instead of suggesting “crear entrega” libre
- if `count_submitted` is true, keep the accept/dispute flow for the incoming almacenista
- preserve full-inventory counting semantics: one line per product, diff visible, note required on large deltas

The service call for the outgoing flow should support this shape:

```js
await createShiftHandover(warehouseId, employeeId, lines, notes, {
  handover_id: handover.id,
  required_after_supervisor_close: true,
})
```

- [ ] **Step 4: Keep manual handover backward compatible**

Still in `ScreenHandoverPT.jsx`:
- keep the current manual “Entregar turno” mode only when there is no required post-close handover pending
- do not let the screen create a second handover if one already exists and is blocking PT

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/ptHandoverState.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

### Task 4: Enforce the PT Block Across Movement Screens and API Passthroughs

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/modules/almacen-pt/ptService.js`
- Modify: `src/modules/almacen-pt/ScreenRecepcion.jsx`
- Modify: `src/modules/almacen-pt/ScreenTransformacionPT.jsx`
- Modify: `src/modules/almacen-pt/ScreenTraspasoPT.jsx`
- Modify: `src/modules/almacen-pt/ScreenMermaPT.jsx`
- Test: `tests/ptHandoverState.test.mjs`

- [ ] **Step 1: Add a failing translation test for blocked PT operations**

Add to `tests/ptHandoverState.test.mjs`:

```js
test('translatePtBlockedError falls back to semantic copy when backend embeds the code in a larger message', () => {
  const msg = 'PT_BLOCKED_BY_HANDOVER: pending handover for warehouse 76'
  assert.equal(
    translatePtBlockedError(msg),
    'PT cerrado por relevo pendiente. Acepta el turno para continuar.'
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: FAIL until the translator matches embedded error codes too.

- [ ] **Step 3: Preserve semantic backend errors in `src/lib/api.js` and consume them in screens**

In [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js):
- for `/pwa-pt/reception-create`, `/pwa-pt/transformation-create`, `/pwa-pt/transfer-orchestrate` and `/pwa-pt/scrap-create`
- when backend returns `ok:false`, preserve semantic `error_code` if present and throw an error that still contains `PT_BLOCKED_BY_HANDOVER`

In each PT movement screen:
- catch the translated blocked error
- show a blocking banner or error card
- replace “retry same action” UX with CTA to `/almacen-pt/handover` when the error is due to handover pending

Example catch branch:

```js
catch (e) {
  const msg = e?.message || 'Error operando PT'
  setError(msg)
  if (msg.includes('relevo pendiente')) {
    setBlockedByHandover(true)
  }
}
```

- [ ] **Step 4: Disable submit buttons when PT is already known to be blocked**

In the four PT movement screens:
- when the loaded summary or action error indicates `pt_blocked_by_handover`
- disable the primary submit button
- show a short explanation instead of leaving the form apparently usable

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/ptHandoverState.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

### Task 5: Surface the Expanded Close Result in Supervisión

**Files:**
- Modify: `src/modules/shared/supervisorAuth.js`
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
- Modify: `src/lib/api.js`
- Test: `tests/ptHandoverState.test.mjs`

- [ ] **Step 1: Add a failing test for generic blocked-copy fallback**

Add to `tests/ptHandoverState.test.mjs`:

```js
test('translatePtBlockedError leaves non-handover messages untouched', () => {
  assert.equal(
    translatePtBlockedError('Sin conexion al servidor'),
    'Sin conexion al servidor'
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ptHandoverState.test.mjs`
Expected: FAIL until the helper only rewrites semantic handover blocks.

- [ ] **Step 3: Preserve the expanded close payload and update the success UX**

In [src/modules/shared/supervisorAuth.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/shared/supervisorAuth.js):
- return the whole close payload, not just `{ ok, warnings }`
- preserve fields such as:
  - `pt_handover_created`
  - `pt_handover_id`
  - `pt_status`
  - `pt_blocked`

Expected shape:

```js
return {
  ok: true,
  warnings: result.warnings || [],
  pt_handover_created: Boolean(result.pt_handover_created),
  pt_handover_id: result.pt_handover_id || null,
  pt_status: result.pt_status || null,
  pt_blocked: Boolean(result.pt_blocked),
}
```

In [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx):
- after successful close, replace the generic success toast with copy that explains:
  - el turno del supervisor quedó cerrado
  - PT quedó en relevo pendiente
  - otro almacenista PT debe aceptar para reabrir
- do not navigate the supervisor into PT; this is informational only

- [ ] **Step 4: Preserve close-path semantics in `src/lib/api.js`**

In [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js):
- ensure the `/pwa-prod/shift-close` branch returns the expanded backend response instead of collapsing it to a minimal success shape
- if backend cannot create the required PT handover, propagate the failure so the close action does not appear successful

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/ptHandoverState.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

## Final Verification
- [ ] Run `node --test tests/ptHandoverState.test.mjs`
- [ ] Run `npm run build`
- [ ] Manual flow 1:
  - cerrar turno del supervisor
  - confirmar que la respuesta incluye `pt_handover_created`
  - abrir `/almacen-pt` y validar banner de bloqueo
- [ ] Manual flow 2:
  - intentar recepción, merma, transformación y traspaso con handover pendiente
  - validar bloqueo y CTA a `/almacen-pt/handover`
- [ ] Manual flow 3:
  - capturar conteo total en handover PT
  - aceptar con otro `almacenista_pt`
  - validar que PT vuelve a operar
- [ ] Manual flow 4:
  - disputar handover
  - validar que PT siga bloqueado
