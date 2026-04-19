# Lecturas de Salmuera en Supervisión Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que `supervisor_produccion` registre lecturas diarias de salmuera por tanque desde Supervisión y que esas lecturas alimenten la validación de cosecha de barra sin eliminar la captura de temperatura al cosechar.

**Architecture:** La UI de supervisión seguirá usando [src/modules/supervision/ScreenSupervision.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenSupervision.jsx) como pantalla principal, pero el estado derivado y la validación del formulario se moverán a un helper puro para evitar seguir creciendo el archivo. La escritura se agregará al API de supervisión y al passthrough local de [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js), actualizando directamente los campos operativos del tanque (`x_salt_level`, timestamps y temperatura actual opcional) que ya consume Producción.

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, Odoo passthrough en `src/lib/api.js`.

---

## Scope Note
Este plan cubre solo este workspace PWA. La escritura se implementará en el passthrough local si no existe un endpoint Odoo ya desplegado. El comportamiento objetivo es el mismo en ambos casos: guardar lectura por tanque y refrescar el estado usado por Supervisión y Producción.

## File Structure
- Create: `src/modules/supervision/brineReadings.js`
  - Helper puro para estado visual, validación del formulario y payload normalizado de lectura.
- Create: `src/modules/supervision/BrineReadingModal.jsx`
  - Modal ligera para capturar nivel de sal y temperatura opcional sin ensuciar `ScreenSupervision`.
- Create: `tests/brineReadings.test.mjs`
  - Cobertura de estado diario del tanque, validación y armado de payload.
- Modify: `src/modules/supervision/api.js`
  - Nueva llamada `createBrineReading`.
- Modify: `src/modules/supervision/ScreenSupervision.jsx`
  - CTA por tanque, apertura/cierre de modal, guardado y refresh local.
- Modify: `src/lib/api.js`
  - Endpoint `POST /pwa-sup/brine-reading-create` que actualiza la máquina/tanque.
- Modify: `src/modules/produccion/ScreenTanque.jsx`
  - Solo ajuste mínimo si hace falta para mantener consistente la validación con el timestamp real guardado por supervisión.

### Task 1: Add Failing Tests for Brine Reading Status and Validation

**Files:**
- Create: `tests/brineReadings.test.mjs`
- Create: `src/modules/supervision/brineReadings.js`
- Test: `tests/brineReadings.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getBrineReadingStatus,
  validateBrineReadingInput,
  buildBrineReadingPayload,
} from '../src/modules/supervision/brineReadings.js'

test('getBrineReadingStatus marks tank as missing when it has no salt reading', () => {
  const status = getBrineReadingStatus({
    salt_level: 0,
    salt_level_updated_at: null,
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'missing')
  assert.equal(status.label, 'Sin lectura')
})

test('getBrineReadingStatus marks tank as stale when reading is not from today', () => {
  const status = getBrineReadingStatus({
    salt_level: 72,
    salt_level_updated_at: '2026-04-18 08:00:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'stale')
})

test('getBrineReadingStatus marks tank as low when reading is below threshold today', () => {
  const status = getBrineReadingStatus({
    salt_level: 60,
    salt_level_updated_at: '2026-04-19 07:10:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'low')
})

test('validateBrineReadingInput requires a positive numeric salt level', () => {
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '' }), { saltLevel: 'Captura el nivel de sal' })
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '-1' }), { saltLevel: 'Ingresa un valor valido' })
  assert.deepEqual(validateBrineReadingInput({ saltLevel: '68.5', brineTemp: '' }), {})
})

test('buildBrineReadingPayload normalizes machine id and numeric values', () => {
  assert.deepEqual(buildBrineReadingPayload({
    machineId: '14',
    saltLevel: '68.5',
    brineTemp: '-7.2',
  }), {
    machine_id: 14,
    salt_level: 68.5,
    brine_temp: -7.2,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brineReadings.test.mjs`
Expected: FAIL with `Cannot find module '../src/modules/supervision/brineReadings.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
function toDateOnly(value = '') {
  return String(value || '').trim().slice(0, 10)
}

export function getBrineReadingStatus(tank = {}, today = new Date().toISOString().slice(0, 10)) {
  const saltLevel = Number(tank?.salt_level || 0)
  const updatedAt = toDateOnly(tank?.salt_level_updated_at)
  const minSalt = tank?.min_salt_level_for_harvest != null
    ? Number(tank.min_salt_level_for_harvest)
    : null

  if (!saltLevel || !updatedAt) return { kind: 'missing', label: 'Sin lectura' }
  if (updatedAt !== today) return { kind: 'stale', label: 'Lectura vencida' }
  if (minSalt != null && saltLevel < minSalt) return { kind: 'low', label: 'Sal baja' }
  return { kind: 'ok', label: 'Al dia' }
}

export function validateBrineReadingInput({ saltLevel, brineTemp } = {}) {
  const errors = {}
  const salt = Number(saltLevel)
  if (String(saltLevel || '').trim() === '') errors.saltLevel = 'Captura el nivel de sal'
  else if (!Number.isFinite(salt) || salt <= 0) errors.saltLevel = 'Ingresa un valor valido'

  const tempRaw = String(brineTemp || '').trim()
  if (tempRaw !== '' && !Number.isFinite(Number(tempRaw))) errors.brineTemp = 'Ingresa una temperatura valida'
  return errors
}

export function buildBrineReadingPayload({ machineId, saltLevel, brineTemp } = {}) {
  const payload = {
    machine_id: Number(machineId || 0),
    salt_level: Number(saltLevel || 0),
  }
  if (String(brineTemp || '').trim() !== '') payload.brine_temp = Number(brineTemp)
  return payload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/brineReadings.test.mjs`
Expected: PASS for all helper tests.

- [ ] **Step 5: Commit**

```bash
git add tests/brineReadings.test.mjs src/modules/supervision/brineReadings.js
git commit -m "test: add brine reading helpers"
```

### Task 2: Add Brine Reading API Call and Local Passthrough

**Files:**
- Modify: `src/modules/supervision/api.js`
- Modify: `src/lib/api.js`
- Test: `tests/brineReadings.test.mjs`

- [ ] **Step 1: Extend the failing test with API payload expectations**

Add to `tests/brineReadings.test.mjs`:

```js
import { buildBrineReadingPayload } from '../src/modules/supervision/brineReadings.js'

test('buildBrineReadingPayload omits brine_temp when supervisor leaves it empty', () => {
  assert.deepEqual(buildBrineReadingPayload({
    machineId: 8,
    saltLevel: '70',
    brineTemp: '',
  }), {
    machine_id: 8,
    salt_level: 70,
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brineReadings.test.mjs`
Expected: FAIL if the helper still includes `brine_temp: 0` or mishandles optional values.

- [ ] **Step 3: Add minimal API implementation**

In [src/modules/supervision/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/api.js) add:

```js
export function createBrineReading(data) {
  return api('POST', '/pwa-sup/brine-reading-create', data)
}
```

In [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) add a new branch under the `/pwa-sup/*` section:

```js
if (cleanPath === '/pwa-sup/brine-reading-create' && method === 'POST') {
  const machineId = Number(body?.machine_id || 0)
  const saltLevel = Number(body?.salt_level || 0)
  const brineTempRaw = body?.brine_temp

  if (!machineId) throw new Error('machine_id requerido')
  if (!Number.isFinite(saltLevel) || saltLevel <= 0) throw new Error('salt_level invalido')

  const dict = {
    x_salt_level: saltLevel,
    x_salt_level_updated_at: odooNow(),
  }

  if (brineTempRaw !== undefined && brineTempRaw !== null && String(brineTempRaw).trim() !== '') {
    dict.x_brine_temp_current = Number(brineTempRaw)
    dict.x_brine_temp_updated_at = odooNow()
  }

  await createUpdate({
    model: 'gf.production.machine',
    method: 'update',
    ids: [machineId],
    dict,
    sudo: 1,
    app: 'pwa_colaboradores',
  })

  const reread = await readModel('gf.production.machine', {
    fields: [
      'id', 'name', 'display_name', 'x_salt_level', 'x_salt_level_updated_at',
      'x_brine_temp_current', 'x_brine_temp_updated_at', 'salt_level_unit',
      'min_salt_level_for_harvest', 'min_brine_temp_for_harvest', 'x_brine_temp_alert',
    ],
    domain: [['id', '=', machineId]],
    limit: 1,
    sudo: 1,
  })

  return shapeTank(pickFirstResponse(reread))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/brineReadings.test.mjs`
Expected: PASS with optional `brine_temp` behavior preserved.

- [ ] **Step 5: Smoke check the new API path**

Run: `npm run build`
Expected: PASS and no import/runtime errors from the new supervision API call.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/api.js src/lib/api.js tests/brineReadings.test.mjs
git commit -m "feat: add brine reading write path"
```

### Task 3: Add Modal UI for Supervisor Tank Readings

**Files:**
- Create: `src/modules/supervision/BrineReadingModal.jsx`
- Modify: `src/modules/supervision/ScreenSupervision.jsx`
- Modify: `src/modules/supervision/brineReadings.js`
- Test: `tests/brineReadings.test.mjs`

- [ ] **Step 1: Extend helper tests for UI-facing state**

Add to `tests/brineReadings.test.mjs`:

```js
import { getInitialBrineReadingForm } from '../src/modules/supervision/brineReadings.js'

test('getInitialBrineReadingForm preloads current tank values as strings', () => {
  assert.deepEqual(getInitialBrineReadingForm({
    id: 9,
    salt_level: 67.2,
    brine_temp: -6.5,
  }), {
    machineId: 9,
    saltLevel: '67.2',
    brineTemp: '-6.5',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brineReadings.test.mjs`
Expected: FAIL with missing `getInitialBrineReadingForm`.

- [ ] **Step 3: Add minimal helper and modal implementation**

In [src/modules/supervision/brineReadings.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/brineReadings.js) add:

```js
export function getInitialBrineReadingForm(tank = {}) {
  return {
    machineId: tank?.id || 0,
    saltLevel: tank?.salt_level ? String(tank.salt_level) : '',
    brineTemp: tank?.brine_temp ? String(tank.brine_temp) : '',
  }
}
```

Create [src/modules/supervision/BrineReadingModal.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/BrineReadingModal.jsx) with:
- controlled inputs for `saltLevel` and `brineTemp`
- inline validation errors from `validateBrineReadingInput`
- cancel/save buttons
- disabled save state while request is in flight

Update [src/modules/supervision/ScreenSupervision.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenSupervision.jsx):
- add local state for `selectedTank`, `readingForm`, `formErrors`, `saving`, `saveError`
- render a `Registrar sal` CTA inside `TankRow`
- open the modal with `getInitialBrineReadingForm(tank)`
- on save:
  - validate with `validateBrineReadingInput`
  - build payload with `buildBrineReadingPayload`
  - call `createBrineReading`
  - patch the updated tank into local state or reload `loadData()`
  - close modal on success

- [ ] **Step 4: Run helper test to verify it passes**

Run: `node --test tests/brineReadings.test.mjs`
Expected: PASS with initial-form coverage and no regressions.

- [ ] **Step 5: Manual behavior check in the app**

Run: `npm run build`
Expected: PASS.

Then verify in the browser/app:
- supervisor ve `Registrar sal` en cada tanque
- modal precarga valores existentes
- guardar con sal vacía muestra error
- guardar exitosamente refresca el estado visual del tanque

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/BrineReadingModal.jsx src/modules/supervision/ScreenSupervision.jsx src/modules/supervision/brineReadings.js tests/brineReadings.test.mjs
git commit -m "feat: add supervisor brine reading modal"
```

### Task 4: Reflect Updated Reading Status in Supervision and Preserve Harvest Validation

**Files:**
- Modify: `src/modules/supervision/ScreenSupervision.jsx`
- Modify: `src/modules/produccion/ScreenTanque.jsx`
- Modify: `src/modules/supervision/brineReadings.js`
- Test: `tests/brineReadings.test.mjs`

- [ ] **Step 1: Add failing test for same-day status derivation**

Add to `tests/brineReadings.test.mjs`:

```js
test('getBrineReadingStatus marks tank as ok when reading is from today and above threshold', () => {
  const status = getBrineReadingStatus({
    salt_level: 68,
    salt_level_updated_at: '2026-04-19 06:45:00',
    min_salt_level_for_harvest: 65,
  }, '2026-04-19')

  assert.equal(status.kind, 'ok')
  assert.equal(status.label, 'Al dia')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/brineReadings.test.mjs`
Expected: FAIL if the status helper still returns stale or low incorrectly.

- [ ] **Step 3: Implement minimal visual/status integration**

In [src/modules/supervision/ScreenSupervision.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenSupervision.jsx):
- compute `readingStatus` for each tank via `getBrineReadingStatus`
- show a chip or subtitle line with `Sin lectura`, `Lectura vencida`, `Sal baja` or `Al día`
- keep existing alerts for `saltMissing` / `saltBad`, but align their copy with the helper output where possible

In [src/modules/produccion/ScreenTanque.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/produccion/ScreenTanque.jsx):
- only adjust date comparison if necessary so it continues to treat the saved `x_salt_level_updated_at` as “de hoy”
- do not remove `harvestTemp`
- do not stop requiring temperature capture at harvest time

- [ ] **Step 4: Run focused tests and regression tests**

Run: `node --test tests/brineReadings.test.mjs tests/checklistContext.test.mjs tests/supervisionShiftContext.test.mjs`
Expected: PASS for all listed tests.

- [ ] **Step 5: Build the app**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/ScreenSupervision.jsx src/modules/produccion/ScreenTanque.jsx src/modules/supervision/brineReadings.js tests/brineReadings.test.mjs
git commit -m "feat: reflect daily brine reading state"
```

### Task 5: Final Verification

**Files:**
- Modify: none
- Test: `tests/brineReadings.test.mjs`, `tests/checklistContext.test.mjs`, `tests/supervisionShiftContext.test.mjs`

- [ ] **Step 1: Run the automated verification set**

Run:

```bash
node --test tests/brineReadings.test.mjs tests/checklistContext.test.mjs tests/supervisionShiftContext.test.mjs tests/roleContext.test.mjs tests/effectiveRoles.test.mjs
```

Expected: PASS, 0 failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual acceptance checks**

Verify:
- supervisor puede registrar sal por tanque desde supervisión
- la modal no deja guardar sal vacía o inválida
- una lectura exitosa actualiza la tarjeta del tanque
- la cosecha de barra sigue pidiendo temperatura
- si no hay lectura del día, la cosecha sigue bloqueada
- si sí hay lectura del día y supera el mínimo, la validación de sal deja continuar

- [ ] **Step 4: Commit any final fixups**

```bash
git add src/modules/supervision src/modules/produccion/ScreenTanque.jsx src/lib/api.js tests/brineReadings.test.mjs
git commit -m "test: verify supervision brine readings flow"
```
