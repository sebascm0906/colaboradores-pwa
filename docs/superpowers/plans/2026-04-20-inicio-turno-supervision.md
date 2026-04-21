# Inicio de Turno en Supervisión Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que `Control de Turno` maneje un flujo de dos pasos donde `Abrir turno` crea el borrador y `Iniciar turno` solo pase a `in_progress` cuando exista lectura inicial de energía y lectura de sal del día en todos los tanques de salmuera activos.

**Architecture:** La pantalla [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx) seguirá siendo la orquestadora del flujo, pero la lógica de readiness se moverá a un helper puro para no incrustar reglas de negocio dispersas en el componente. La energía inicial se leerá desde los mismos endpoints de energía ya existentes y la salmuera reutilizará los helpers y la modal ya implementados para supervisión; el inicio formal del turno se expondrá con una nueva llamada a `action_start_shift` en el passthrough local.

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, Odoo passthrough en `src/lib/api.js`.

---

## Scope Note
Este plan se limita a este workspace PWA. Se asume que `action_start_shift` existe en Odoo y puede invocarse vía `createUpdate(... method: 'function' ...)`, como ya sucede en el flujo de cierre.

## File Structure
- Create: `src/modules/supervision/shiftStartReadiness.js`
  - Helper puro para evaluar energía inicial, estado de tanques y `canStart`.
- Create: `tests/shiftStartReadiness.test.mjs`
  - Cobertura de los criterios de arranque del turno.
- Modify: `src/modules/supervision/api.js`
  - Nueva llamada `startShift`.
- Modify: `src/lib/api.js`
  - Endpoint `POST /pwa-sup/shift-start` que invoca `action_start_shift`.
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
  - Bloque `Requisitos para iniciar`, integración de energía/salmuera y botón `Iniciar turno`.
- Modify: `src/modules/supervision/ScreenEnergia.jsx`
  - Ajuste mínimo para soportar retorno a `Control de Turno` si hace falta.
- Modify: `src/modules/supervision/BrineReadingModal.jsx`
  - Solo si se necesita una variante de cierre/retorno para usarla desde `Control de Turno`.
- Modify: `src/modules/supervision/brineReadings.js`
  - Reutilización de helpers existentes si hace falta exportar un dato derivado adicional.

### Task 1: Add Failing Tests for Shift Start Readiness

**Files:**
- Create: `tests/shiftStartReadiness.test.mjs`
- Create: `src/modules/supervision/shiftStartReadiness.js`
- Test: `tests/shiftStartReadiness.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getShiftStartReadiness,
  hasStartEnergyReading,
} from '../src/modules/supervision/shiftStartReadiness.js'

test('hasStartEnergyReading returns true only when start reading has positive kwh', () => {
  assert.equal(hasStartEnergyReading([]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'end', kwh_value: 100 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 0 }]), false)
  assert.equal(hasStartEnergyReading([{ reading_type: 'start', kwh_value: 120 }]), true)
})

test('getShiftStartReadiness blocks start when energy reading is missing', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.energyReady, false)
  assert.equal(readiness.blockers.includes('Falta lectura inicial de energia'), true)
})

test('getShiftStartReadiness blocks start when any active tank lacks a valid reading', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 0, salt_level_updated_at: null, min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.tankReadiness[1].ready, false)
})

test('getShiftStartReadiness allows start when draft shift has energy and all tanks ready', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [
      { id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 },
      { id: 2, salt_level: 68, salt_level_updated_at: '2026-04-20 06:30:00', min_salt_level_for_harvest: 65 },
    ],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, true)
  assert.equal(readiness.blockers.length, 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: FAIL with `Cannot find module '../src/modules/supervision/shiftStartReadiness.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
import { getBrineReadingStatus } from './brineReadings.js'

export function hasStartEnergyReading(readings = []) {
  return readings.some((reading) =>
    reading?.reading_type === 'start' && Number(reading?.kwh_value || 0) > 0
  )
}

export function getShiftStartReadiness({ shift, energyReadings = [], tanks = [], today } = {}) {
  const blockers = []
  const energyReady = hasStartEnergyReading(energyReadings)
  if (!energyReady) blockers.push('Falta lectura inicial de energia')

  const tankReadiness = tanks.map((tank) => {
    const status = getBrineReadingStatus(tank, today)
    return {
      tankId: tank.id,
      tankName: tank.display_name || tank.name || `Tanque ${tank.id}`,
      status: status.kind,
      ready: status.kind === 'ok',
    }
  })

  if (tankReadiness.some((tank) => !tank.ready)) blockers.push('Faltan lecturas de sal en tanques activos')

  const canStart = shift?.state === 'draft' && blockers.length === 0
  return { canStart, energyReady, tankReadiness, blockers }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: PASS for all readiness tests.

- [ ] **Step 5: Commit**

```bash
git add tests/shiftStartReadiness.test.mjs src/modules/supervision/shiftStartReadiness.js
git commit -m "test: add shift start readiness helpers"
```

### Task 2: Add Start Shift API Call and Passthrough

**Files:**
- Modify: `src/modules/supervision/api.js`
- Modify: `src/lib/api.js`
- Test: `tests/shiftStartReadiness.test.mjs`

- [ ] **Step 1: Extend the failing test with non-draft behavior**

Add to `tests/shiftStartReadiness.test.mjs`:

```js
test('getShiftStartReadiness does not allow start when shift is already in progress', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'in_progress' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: FAIL until readiness respects `shift.state`.

- [ ] **Step 3: Add minimal API implementation**

In [src/modules/supervision/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/api.js) add:

```js
export function startShift(data) { return api('POST', '/pwa-sup/shift-start', data) }
```

In [src/lib/api.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js) add:

```js
if (cleanPath === '/pwa-sup/shift-start' && method === 'POST') {
  const shiftId = Number(body?.shift_id || 0)
  if (!shiftId) throw new Error('shift_id requerido')

  const result = await createUpdate({
    model: 'gf.production.shift',
    method: 'function',
    ids: [shiftId],
    function: 'action_start_shift',
    sudo: 1,
    app: 'pwa_colaboradores',
  })

  return { ok: true, data: result }
}
```

- [ ] **Step 4: Run readiness test to verify it passes**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: PASS.

- [ ] **Step 5: Smoke check build**

Run: `npm run build`
Expected: PASS and no missing import/runtime errors.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/api.js src/lib/api.js tests/shiftStartReadiness.test.mjs
git commit -m "feat: add shift start API path"
```

### Task 3: Surface Start Readiness in Control de Turno

**Files:**
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
- Modify: `src/modules/supervision/shiftStartReadiness.js`
- Test: `tests/shiftStartReadiness.test.mjs`

- [ ] **Step 1: Add failing test for empty active tanks behavior**

Add to `tests/shiftStartReadiness.test.mjs`:

```js
test('getShiftStartReadiness treats an empty active tank list as blocked', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [],
    today: '2026-04-20',
  })

  assert.equal(readiness.canStart, false)
  assert.equal(readiness.blockers.includes('No hay tanques activos disponibles para validar salmuera'), true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: FAIL until empty-tank case is treated as a blocker.

- [ ] **Step 3: Add minimal UI implementation**

Update [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx):
- load `getEnergyReadings(shift.id)` and `listTanks()` when a draft shift is present
- compute `startReadiness` via `getShiftStartReadiness`
- show a new `Requisitos para iniciar` block only for `shift.state === 'draft'`
- include:
  - row for `Energía inicial`
  - checklist rows for each active tank
  - `Registrar energía inicial` button navigating to `/supervision/energia`
  - `Registrar sal` button per tank opening the existing brine modal or routing to the tank workflow

Update [src/modules/supervision/shiftStartReadiness.js](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/shiftStartReadiness.js) so empty active tanks produce a blocker.

- [ ] **Step 4: Run tests to verify it passes**

Run: `node --test tests/shiftStartReadiness.test.mjs tests/brineReadings.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build the app**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/ScreenControlTurno.jsx src/modules/supervision/shiftStartReadiness.js tests/shiftStartReadiness.test.mjs
git commit -m "feat: show shift start readiness in control turno"
```

### Task 4: Wire Energy and Brine Actions Back to Control de Turno

**Files:**
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
- Modify: `src/modules/supervision/ScreenEnergia.jsx`
- Modify: `src/modules/supervision/BrineReadingModal.jsx`
- Test: `tests/shiftStartReadiness.test.mjs`

- [ ] **Step 1: Add failing test for blockers detail shape**

Add to `tests/shiftStartReadiness.test.mjs`:

```js
test('getShiftStartReadiness returns tank detail labels for UI rendering', () => {
  const readiness = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 2, display_name: 'Tanque 2', salt_level: 0, salt_level_updated_at: null, min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(readiness.tankReadiness[0].tankName, 'Tanque 2')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: FAIL until readiness includes UI-friendly tank detail.

- [ ] **Step 3: Implement minimal integration**

In [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx):
- pass `state: { backTo: '/supervision/turno' }` when navigating to `/supervision/energia`
- reuse the existing brine modal directly in the turn screen or a shared callback that updates local tanks after save
- refresh draft readiness after saving energy or sal

In [src/modules/supervision/ScreenEnergia.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenEnergia.jsx):
- preserve `backTo` navigation already supported
- no behavior change beyond making sure the return path is used from turn control

If needed in [src/modules/supervision/BrineReadingModal.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/BrineReadingModal.jsx):
- allow it to be reused from `ScreenControlTurno` without supervision-specific assumptions

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/shiftStartReadiness.test.mjs tests/brineReadings.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build the app**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/ScreenControlTurno.jsx src/modules/supervision/ScreenEnergia.jsx src/modules/supervision/BrineReadingModal.jsx src/modules/supervision/shiftStartReadiness.js tests/shiftStartReadiness.test.mjs
git commit -m "feat: wire turn start prerequisites actions"
```

### Task 5: Enable Start Shift Action from Draft

**Files:**
- Modify: `src/modules/supervision/ScreenControlTurno.jsx`
- Modify: `src/modules/supervision/api.js`
- Test: `tests/shiftStartReadiness.test.mjs`

- [ ] **Step 1: Add failing test for blocker-free draft start**

Add to `tests/shiftStartReadiness.test.mjs`:

```js
test('getShiftStartReadiness allows start only from draft with no blockers', () => {
  const ready = getShiftStartReadiness({
    shift: { id: 10, state: 'draft' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  const closed = getShiftStartReadiness({
    shift: { id: 10, state: 'closed' },
    energyReadings: [{ reading_type: 'start', kwh_value: 120 }],
    tanks: [{ id: 1, salt_level: 70, salt_level_updated_at: '2026-04-20 07:00:00', min_salt_level_for_harvest: 65 }],
    today: '2026-04-20',
  })

  assert.equal(ready.canStart, true)
  assert.equal(closed.canStart, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shiftStartReadiness.test.mjs`
Expected: FAIL until `canStart` fully respects state and blockers.

- [ ] **Step 3: Implement minimal start action**

In [src/modules/supervision/ScreenControlTurno.jsx](/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/supervision/ScreenControlTurno.jsx):
- add `handleStartShift`
- guard it with `startReadiness.canStart`
- call `startShift({ shift_id: shift.id })`
- refresh the shift via `loadData()`
- show success/error messaging
- hide or replace the readiness block once `shift.state === 'in_progress'`

- [ ] **Step 4: Run focused tests**

Run: `node --test tests/shiftStartReadiness.test.mjs tests/brineReadings.test.mjs tests/supervisionShiftContext.test.mjs`
Expected: PASS.

- [ ] **Step 5: Build the app**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/supervision/ScreenControlTurno.jsx src/modules/supervision/api.js tests/shiftStartReadiness.test.mjs
git commit -m "feat: start production shifts from control turno"
```

### Task 6: Final Verification

**Files:**
- Modify: none
- Test: `tests/shiftStartReadiness.test.mjs`, `tests/brineReadings.test.mjs`, `tests/supervisionShiftContext.test.mjs`

- [ ] **Step 1: Run the automated verification set**

Run:

```bash
node --test tests/shiftStartReadiness.test.mjs tests/brineReadings.test.mjs tests/supervisionShiftContext.test.mjs tests/checklistContext.test.mjs tests/roleContext.test.mjs tests/effectiveRoles.test.mjs
```

Expected: PASS, 0 failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Manual acceptance checks**

Verify:
- abrir turno crea `draft`
- sin energía inicial no deja iniciar
- sin lectura del día en cualquier tanque activo no deja iniciar
- registrar energía desde `Control de Turno` vuelve con el requisito actualizado
- registrar sal por tanque vuelve con el requisito actualizado
- con todos los requisitos completos, `Iniciar turno` se habilita
- al iniciar, el turno cambia a `En curso`

- [ ] **Step 4: Commit any final fixups**

```bash
git add src/modules/supervision src/lib/api.js tests/shiftStartReadiness.test.mjs
git commit -m "test: verify shift start requirements flow"
```
