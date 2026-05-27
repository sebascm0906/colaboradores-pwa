# Formatos de Ruta en Liquidaciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build route liquidation formats in `Admin > Liquidaciones` so Aida can view, print, and download reports per closed driver route.

**Architecture:** Add a pure view model module for route format normalization and HTML export, then add a focused React viewer component used by `AdminLiquidacionesForm.jsx`. Existing liquidation validation behavior and endpoints remain unchanged.

**Tech Stack:** Vite 5, React 18, plain JavaScript ES modules, `node:test`, existing inline style/token patterns.

---

## File Structure

- Create `src/modules/admin/routeLiquidationFormats.js`: pure normalization, format definitions, totals, printable HTML generation.
- Create `tests/routeLiquidationFormats.test.mjs`: node tests for closed/open plans, inventory, scrap, corte, liquidation, missing sales, and HTML output.
- Create `src/modules/admin/components/RouteFormatViewer.jsx`: UI for selecting a format, viewing it, printing it, and downloading HTML.
- Modify `src/modules/admin/forms/AdminLiquidacionesForm.jsx`: render `RouteFormatViewer` for selected details without changing validation flow.

## Task 1: Pure View Model and Tests

**Files:**
- Create: `tests/routeLiquidationFormats.test.mjs`
- Create: `src/modules/admin/routeLiquidationFormats.js`

- [ ] **Step 1: Write failing tests**

Add tests covering:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildRouteFormatsViewModel,
  buildRouteFormatHtml,
} from '../src/modules/admin/routeLiquidationFormats.js'

test('closed route enables formats and normalizes inventory, scrap, corte, liquidation', () => {
  const vm = buildRouteFormatsViewModel({
    id: 77,
    name: 'Plan 77',
    route_name: 'Ruta Centro',
    driver_name: 'Chofer Uno',
    state: 'closed',
    summary: {
      by_method: { cash: 100, credit: 50 },
      total_expected: 150,
      total_collected: 145,
      difference: -5,
    },
    reconciliation_lines: [
      { product_name: 'Bolsa 5kg', qty_loaded: 10, qty_delivered: 7, qty_returned: 2, qty_scrap: 1, qty_difference: 0 },
      { product_name: 'Bolsa 3kg', qty_loaded: 5, qty_delivered: 5, qty_returned: 0, qty_scrap: 0, qty_difference: 0 },
    ],
  })

  assert.equal(vm.enabled, true)
  assert.equal(vm.formats.inventory.rows.length, 2)
  assert.equal(vm.formats.scrap.rows.length, 1)
  assert.equal(vm.formats.corte.totals.loaded, 15)
  assert.equal(vm.formats.liquidation.rows.length, 2)
  assert.equal(vm.formats.sales.unavailable, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/routeLiquidationFormats.test.mjs`

Expected: FAIL because `src/modules/admin/routeLiquidationFormats.js` does not exist.

- [ ] **Step 3: Implement minimal view model**

Implement:

- `buildRouteFormatsViewModel(detail)`
- `buildRouteFormatHtml(viewModel, formatId)`
- helpers for line, payment, sale, total, text escaping.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/routeLiquidationFormats.test.mjs`

Expected: PASS.

## Task 2: Route Format Viewer Component

**Files:**
- Create: `src/modules/admin/components/RouteFormatViewer.jsx`
- Modify: `src/modules/admin/forms/AdminLiquidacionesForm.jsx`

- [ ] **Step 1: Add component**

Create a component with:

- format selector buttons: ventas, inventario, mermas, corte, liquidacion.
- rendered report table for selected format.
- blocked state for open plans.
- `window.print()` action.
- HTML download action using `Blob`, `URL.createObjectURL`, temporary anchor click, and URL cleanup.

- [ ] **Step 2: Wire component into detail panel**

Import `RouteFormatViewer` in `AdminLiquidacionesForm.jsx` and render it after the existing validation section when `detail` exists.

- [ ] **Step 3: Run targeted tests**

Run: `npm run test -- tests/routeLiquidationFormats.test.mjs`

Expected: PASS.

## Task 3: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run all tests**

Run: `npm run test`

Expected: PASS.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Manual smoke**

Start dev server if needed:

Run: `npm run dev`

Open `Admin > Liquidaciones`, select a route, verify the format section renders, selector changes report content, print opens browser print dialog, and download creates an HTML file.
