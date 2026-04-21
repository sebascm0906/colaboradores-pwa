# Cosecha de Barra con Recepción PT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que al cosechar una canastilla de `operador_barra` se muestre una confirmación final y, al aceptarla, se coseche el slot y se genere una recepción pendiente para `almacenista_pt` por `8` barras del producto correspondiente.

**Architecture:** La pantalla [src/modules/produccion/ScreenTanque.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/ScreenTanque.jsx) seguirá orquestando la cosecha, pero el payload de integración se moverá a un helper puro para que producto y cantidad queden testeables. La operación real se coordinará en un nuevo endpoint del BFF local dentro de [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js), donde una sola llamada ejecutará `action_cosechar` y dará de alta la recepción pendiente PT reutilizando el flujo que ya consume [src/modules/almacen-pt/ScreenRecepcion.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenRecepcion.jsx).

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, passthrough Odoo en `src/lib/api.js`.

---

## Scope Note
Este plan se limita al workspace PWA. Se asume que el backend Odoo accesible desde `src/lib/api.js` permite:
- ejecutar `action_cosechar` sobre `x_ice.brine.slot`
- crear o registrar la entidad que luego aparece en `/api/pt/reception/pending`

Si el contrato real de PT exige un modelo distinto al anticipado, se debe ajustar el paso del BFF sin cambiar la UX ya aprobada.

## File Structure
- Create: `src/modules/produccion/barraHarvestReception.js`
  - Helper puro para resolver el producto efectivo de la cosecha y construir el payload PT con `8` barras.
- Create: `tests/barraHarvestReception.test.mjs`
  - Cobertura de producto efectivo y payload de recepción PT.
- Modify: `src/modules/produccion/api.js`
  - Nueva llamada coordinada `harvestWithPtReception`.
- Modify: `src/lib/api.js`
  - Endpoint `POST /pwa-prod/harvest-with-pt-reception` que cosecha el slot y crea la recepción pendiente PT.
- Modify: `src/modules/produccion/ScreenTanque.jsx`
  - Confirmación final de cosecha, uso del nuevo endpoint y manejo de errores parciales.
- Modify: `src/modules/almacen-pt/ptService.js`
  - Solo si hace falta documentar o adaptar un campo para que `ScreenRecepcion` lea correctamente el pendiente nuevo.

### Task 1: Add TDD Coverage for Barra Harvest → PT Reception Mapping

**Files:**
- Create: `src/modules/produccion/barraHarvestReception.js`
- Create: `tests/barraHarvestReception.test.mjs`
- Test: `tests/barraHarvestReception.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPtReceptionFromHarvest,
  resolveHarvestProduct,
} from '../src/modules/produccion/barraHarvestReception.js'

test('resolveHarvestProduct prefers slot product over tank product', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: 725, product_name: 'Barra Chica (50 kg)' },
    tank: { product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.deepEqual(product, { product_id: 725, product_name: 'Barra Chica (50 kg)' })
})

test('resolveHarvestProduct falls back to tank product when slot product is missing', () => {
  const product = resolveHarvestProduct({
    slot: { product_id: null, product_name: '' },
    tank: { product_id: 724, product_name: 'Barra Grande (75 kg)' },
  })

  assert.deepEqual(product, { product_id: 724, product_name: 'Barra Grande (75 kg)' })
})

test('buildPtReceptionFromHarvest creates a PT payload with fixed qty_reported of 8 bars', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: 724, product_name: 'Barra Grande (75 kg)' },
    tank: { id: 1, display_name: 'Tanque 1' },
  })

  assert.equal(payload.product_id, 724)
  assert.equal(payload.product_name, 'Barra Grande (75 kg)')
  assert.equal(payload.qty_reported, 8)
  assert.match(payload.notes, /A1/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/barraHarvestReception.test.mjs`
Expected: FAIL with `Cannot find module '../src/modules/produccion/barraHarvestReception.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
export function resolveHarvestProduct({ slot = {}, tank = {} } = {}) {
  const slotId = Number(slot?.product_id || 0)
  if (slotId) {
    return { product_id: slotId, product_name: String(slot?.product_name || '').trim() }
  }
  return {
    product_id: Number(tank?.product_id || 0),
    product_name: String(tank?.product_name || '').trim(),
  }
}

export function buildPtReceptionFromHarvest({ slot = {}, tank = {} } = {}) {
  const product = resolveHarvestProduct({ slot, tank })
  return {
    product_id: product.product_id,
    product_name: product.product_name,
    qty_reported: 8,
    notes: `Cosecha barra ${slot?.name || ''} · ${tank?.display_name || tank?.name || ''}`.trim(),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/barraHarvestReception.test.mjs`
Expected: PASS for all mapping tests.

- [ ] **Step 5: Commit**

```bash
git add tests/barraHarvestReception.test.mjs src/modules/produccion/barraHarvestReception.js
git commit -m "test: add barra harvest pt reception helpers"
```

### Task 2: Add Coordinated Harvest API Path

**Files:**
- Modify: `src/modules/produccion/api.js`
- Modify: `src/lib/api.js`
- Test: `tests/barraHarvestReception.test.mjs`

- [ ] **Step 1: Extend the failing test with invalid-product behavior**

Add to `tests/barraHarvestReception.test.mjs`:

```js
test('buildPtReceptionFromHarvest preserves missing product as invalid payload for caller handling', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 33, name: 'A1', product_id: null, product_name: '' },
    tank: { id: 1, display_name: 'Tanque 1', product_id: null, product_name: '' },
  })

  assert.equal(payload.product_id, 0)
  assert.equal(payload.qty_reported, 8)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/barraHarvestReception.test.mjs`
Expected: FAIL until helper returns a deterministic empty-product payload.

- [ ] **Step 3: Add the API wiring**

In [src/modules/produccion/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/api.js) add:

```js
export function harvestWithPtReception(data) {
  return api('POST', '/pwa-prod/harvest-with-pt-reception', data)
}
```

In [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) add a coordinated branch:

```js
if (cleanPath === '/pwa-prod/harvest-with-pt-reception' && method === 'POST') {
  // 1) validate slot_id, product_id and qty_reported
  // 2) execute action_cosechar on x_ice.brine.slot
  // 3) create the PT reception pending record expected by /api/pt/reception/pending
  // 4) return both harvest and reception ids/status
}
```

Minimum validations:
- `slot_id` required
- `product_id` required
- `qty_reported` must be `8` or a positive number if backend later generalizes

The branch must return enough info to surface partial failures clearly:

```json
{
  "ok": true,
  "harvest": { "ok": true },
  "pt_reception": { "ok": true, "id": 456 }
}
```

- [ ] **Step 4: Run targeted test and build**

Run:
- `node --test tests/barraHarvestReception.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/produccion/api.js src/lib/api.js tests/barraHarvestReception.test.mjs
git commit -m "feat: add coordinated barra harvest pt reception API"
```

### Task 3: Add Final Confirmation UX in ScreenTanque

**Files:**
- Modify: `src/modules/produccion/ScreenTanque.jsx`
- Modify: `src/modules/produccion/barraHarvestReception.js`
- Test: `tests/barraHarvestReception.test.mjs`

- [ ] **Step 1: Add failing test for confirmation copy payload helper**

Add to `tests/barraHarvestReception.test.mjs`:

```js
test('buildPtReceptionFromHarvest creates notes mentioning slot and PT reception intent', () => {
  const payload = buildPtReceptionFromHarvest({
    slot: { id: 44, name: 'B2', product_id: 725, product_name: 'Barra Chica (50 kg)' },
    tank: { id: 1, display_name: 'Tanque 1' },
  })

  assert.match(payload.notes, /B2/)
  assert.match(payload.notes, /Tanque 1/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/barraHarvestReception.test.mjs`
Expected: FAIL until helper notes match the intended copy contract.

- [ ] **Step 3: Update ScreenTanque with the new confirmation flow**

In [src/modules/produccion/ScreenTanque.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/ScreenTanque.jsx):
- import `harvestWithPtReception`
- import `buildPtReceptionFromHarvest`
- derive the effective product from `harvestSlot` + `tank`
- after temperature/sal validations pass, replace direct harvest submit with a final confirmation summary
- show:
  - canastilla
  - producto
  - `8 barras`
  - texto `Se generará una recepción pendiente para Almacén PT`
- on confirm, call `harvestWithPtReception(...)`

Keep the existing validations of sal and temperatura untouched; this confirmation is an extra final gate, not a replacement.

- [ ] **Step 4: Handle partial failures explicitly**

In the same screen:
- if harvest fails: keep modal open and show `Error al cosechar`
- if harvest succeeds but PT reception fails: show an explicit error such as `La canastilla fue cosechada pero la recepción PT no se pudo generar`
- on full success: show `Canastilla A1 cosechada y recepción PT generada`

- [ ] **Step 5: Run tests and build**

Run:
- `node --test tests/barraHarvestReception.test.mjs`
- `npm run build`

Expected:
- tests PASS
- build PASS

- [ ] **Step 6: Commit**

```bash
git add src/modules/produccion/ScreenTanque.jsx src/modules/produccion/barraHarvestReception.js tests/barraHarvestReception.test.mjs
git commit -m "feat: confirm barra harvest before creating pt reception"
```

### Task 4: Verify PT Pending Reception Compatibility

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/modules/almacen-pt/ptService.js` (only if normalization is needed)
- Modify: `src/modules/almacen-pt/ScreenRecepcion.jsx` (only if rendering requires a defensive fallback)
- Test: `tests/barraHarvestReception.test.mjs`

- [ ] **Step 1: Inspect the PT pending payload produced by the new BFF branch**

Check the record shape created in [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) against what [src/modules/almacen-pt/ScreenRecepcion.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/almacen-pt/ScreenRecepcion.jsx) normalizes today:
- `product_id`
- `product_name`
- `qty_reported`
- pending state/bucket metadata

- [ ] **Step 2: Add the smallest compatibility adaptation if required**

If the new pending item shape differs from what PT already expects:
- adapt normalization in `ptService.js` or `ScreenRecepcion.jsx`
- do **not** add a new PT screen
- do **not** fork PT flow for barra

- [ ] **Step 3: Run verification commands**

Run:
- `node --test tests/barraHarvestReception.test.mjs tests/miTurnoActions.test.mjs tests/brineReadings.test.mjs`
- `npm run build`

Expected:
- all tests PASS
- build PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.js src/modules/almacen-pt/ptService.js src/modules/almacen-pt/ScreenRecepcion.jsx tests/barraHarvestReception.test.mjs
git commit -m "fix: align pt reception pending payload for barra harvest"
```

### Task 5: Final End-to-End Verification

**Files:**
- No code changes required unless defects are found.

- [ ] **Step 1: Run the full targeted verification suite**

Run:
- `node --test tests/barraHarvestReception.test.mjs tests/miTurnoActions.test.mjs tests/checklistContext.test.mjs tests/brineReadings.test.mjs`
- `npm run build`

Expected:
- all tests PASS
- build PASS

- [ ] **Step 2: Manual verification checklist**

Verify manually in the app:
- operador barra abre una canastilla lista
- aparece confirmación final de cosecha
- se muestra el producto correcto
- se muestra la cantidad `8 barras`
- al confirmar, el slot queda cosechado
- en PT aparece una recepción pendiente nueva del mismo producto

- [ ] **Step 3: Commit any final polish if needed**

```bash
git add -A
git commit -m "feat: connect barra harvest with pt reception flow"
```

## Review Checklist
Before execution, the implementer should confirm:
- the PT pending reception model/creation path in `src/lib/api.js` truly feeds `/api/pt/reception/pending`
- `slot.x_product_id` and fallback `tank.bar_product_id` are enough to resolve the product without adding a new Odoo config field
- the success/error copy in `ScreenTanque.jsx` is explicit about partial failures

## Verification Summary
This feature is only complete when:
- `operador_barra` sees the extra confirmation
- `8 barras` is the fixed quantity in the PT payload
- PT sees the reception in the existing `Recepción` flow
- tests and build pass with fresh output
