# POS Sin Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ventas desde el POS de Admin Sucursal aunque el stock visible sea cero o insuficiente, tanto en desktop como en mobile, sin advertencias adicionales.

**Architecture:** Extraer la lógica del carrito POS a un helper puro para que desktop y mobile compartan exactamente la misma regla: el stock se muestra, pero no limita ni la adición al carrito ni el incremento de cantidad. Después, adaptar ambas UIs para usar esa lógica y para mostrar etiquetas de stock neutrales. El flujo de `createSaleOrder` y el manejo de errores backend se mantienen intactos.

**Tech Stack:** React 18, Vite, JavaScript ESM, `node:test`

---

## File Structure

- Create: `src/modules/admin/posCart.js`
  Responsibility: helper puro para resolver stock mostrado, agregar productos al carrito y actualizar cantidades sin tope por stock.
- Create: `tests/posCart.test.mjs`
  Responsibility: pruebas unitarias del contrato nuevo del carrito POS.
- Modify: `src/modules/admin/forms/AdminPosForm.jsx`
  Responsibility: POS desktop; consumir helper compartido y quitar bloqueo visual/funcional por falta de stock.
- Modify: `src/modules/admin/ScreenPOS.jsx`
  Responsibility: POS mobile legacy; alinear lógica y copy con desktop.

### Task 1: Shared POS Cart Rules

**Files:**
- Create: `src/modules/admin/posCart.js`
- Test: `tests/posCart.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addProductToCart,
  incrementCartItem,
  stockLabel,
} from '../src/modules/admin/posCart.js'

test('addProductToCart allows a product with zero stock', () => {
  const cart = addProductToCart([], {
    id: 10,
    name: 'Hielo',
    stock: 0,
    price: 85,
  })

  assert.deepEqual(cart, [
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ])
})

test('incrementCartItem allows quantity above visible stock', () => {
  const cart = incrementCartItem([
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ], 10, 1)

  assert.equal(cart[0].qty, 2)
})

test('incrementCartItem removes the row when quantity drops to zero', () => {
  const cart = incrementCartItem([
    {
      product_id: 10,
      name: 'Hielo',
      qty: 1,
      price_unit: 85,
      stock: 0,
    },
  ], 10, -1)

  assert.deepEqual(cart, [])
})

test('stockLabel stays neutral when stock is zero', () => {
  assert.equal(stockLabel(0), 'Stock 0')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/posCart.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` or missing export/function errors because `src/modules/admin/posCart.js` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
function resolveDisplayStock(product) {
  return Number(product?.stock ?? product?.qty_available ?? 0)
}

export function addProductToCart(cart = [], product = {}) {
  const stock = resolveDisplayStock(product)
  const existing = cart.find((item) => item.product_id === product.id)
  if (existing) {
    return cart.map((item) =>
      item.product_id === product.id
        ? { ...item, qty: item.qty + 1 }
        : item,
    )
  }
  return [
    ...cart,
    {
      product_id: product.id,
      name: product.name,
      qty: 1,
      price_unit: Number(product.price || product.list_price || 0),
      stock,
    },
  ]
}

export function incrementCartItem(cart = [], productId, delta) {
  return cart
    .map((item) => {
      if (item.product_id !== productId) return item
      const qty = item.qty + delta
      if (qty <= 0) return null
      return { ...item, qty }
    })
    .filter(Boolean)
}

export function stockLabel(stock) {
  return `Stock ${Number(stock || 0)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/posCart.test.mjs`
Expected: PASS with 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add tests/posCart.test.mjs src/modules/admin/posCart.js
git commit -m "feat: allow POS cart items without stock gating"
```

### Task 2: Desktop POS

**Files:**
- Modify: `src/modules/admin/forms/AdminPosForm.jsx`
- Test: `tests/posCart.test.mjs`

- [ ] **Step 1: Write the failing UI-focused test or verify shared red case already covers behavior**

No new UI-only test is required if Task 1 already proves the cart contract. Re-read `tests/posCart.test.mjs` and confirm it covers:
- add item with `stock: 0`
- increase quantity beyond stock
- neutral stock label

Expected: current desktop code still bypasses the helper and still has `if (stock <= 0) return` plus `if (existing.qty >= stock) return prev`.

- [ ] **Step 2: Run targeted search to verify current failure points**

Run: `rg -n "stock <= 0|existing.qty >= stock|disabled=\\{outOfStock\\}|Sin stock|outOfStock" src/modules/admin/forms/AdminPosForm.jsx`
Expected: matches showing the old stock gate still exists in desktop POS.

- [ ] **Step 3: Write minimal implementation**

Update `src/modules/admin/forms/AdminPosForm.jsx` to:

```js
import {
  addProductToCart,
  incrementCartItem,
  stockLabel,
} from '../posCart'

function addToCart(product) {
  setCart((prev) => addProductToCart(prev, product))
}

function updateQty(productId, delta) {
  setCart((prev) => incrementCartItem(prev, productId, delta))
}
```

And in the product card:

```js
const stock = stockOf(p)
const inCart = cart.find(c => c.product_id === p.id)

<button
  type="button"
  onClick={() => addToCart(p)}
  style={{
    cursor: 'pointer',
    opacity: 1,
  }}
>
  <span>{stockLabel(stock)}</span>
</button>
```

Also remove:

```js
if (stock <= 0) return
if (existing.qty >= stock) return prev
disabled={outOfStock}
cursor: outOfStock ? 'not-allowed' : 'pointer'
opacity: outOfStock ? 0.4 : 1
{outOfStock ? 'Sin stock' : `Stock ${stock}`}
```

- [ ] **Step 4: Run verification**

Run: `node --test tests/posCart.test.mjs`
Expected: PASS remains green after wiring desktop to the shared helper.

Run: `npm run build`
Expected: PASS and `vite build` finishes successfully.

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/forms/AdminPosForm.jsx tests/posCart.test.mjs src/modules/admin/posCart.js
git commit -m "feat: remove stock gating from desktop POS"
```

### Task 3: Mobile Legacy POS

**Files:**
- Modify: `src/modules/admin/ScreenPOS.jsx`
- Test: `tests/posCart.test.mjs`

- [ ] **Step 1: Verify current failure points**

Run: `rg -n "stock \\|\\| 0|if \\(\\(product.stock \\|\\| 0\\) <= 0\\)|existing.qty >= \\(product.stock \\|\\| 0\\)|newQty > c.stock|Sin stock|!outOfStock && addToCart" src/modules/admin/ScreenPOS.jsx`
Expected: matches showing the mobile POS still blocks zero-stock and over-stock quantities.

- [ ] **Step 2: Write minimal implementation**

Update `src/modules/admin/ScreenPOS.jsx` to import and use the same helper:

```js
import {
  addProductToCart,
  incrementCartItem,
  stockLabel,
} from './posCart'

function addToCart(product) {
  setCart((prev) => addProductToCart(prev, product))
}

function updateQty(productId, delta) {
  setCart((prev) => incrementCartItem(prev, productId, delta))
}
```

Then remove the mobile-specific stock gate:

```js
if ((product.stock || 0) <= 0) return
if (existing.qty >= (product.stock || 0)) return prev
if (newQty > c.stock) return c
onClick={() => !outOfStock && addToCart(p)}
cursor: outOfStock ? 'not-allowed' : 'pointer'
opacity: outOfStock ? 0.4 : 1
{outOfStock ? 'Sin stock' : `${p.stock} disp.`}
```

Replace the label with:

```js
{stockLabel(p.stock)}
```

- [ ] **Step 3: Run verification**

Run: `node --test tests/posCart.test.mjs`
Expected: PASS.

Run: `npm run build`
Expected: PASS and mobile bundle compiles with the shared helper imported from `./posCart`.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`
Expected: app boots locally.

Manual checks:
- open `/admin/pos` desktop and add a product with `Stock 0`
- increment quantity above visible stock
- switch to mobile viewport and repeat
- confirm no warning modal or extra confirmation appears
- confirm backend error still shows if Odoo rejects the sale

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/ScreenPOS.jsx src/modules/admin/forms/AdminPosForm.jsx src/modules/admin/posCart.js tests/posCart.test.mjs
git commit -m "feat: allow POS sales without stock restriction"
```
