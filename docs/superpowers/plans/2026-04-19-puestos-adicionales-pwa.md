# Puestos Adicionales PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la PWA soporte `role` principal + `additional_roles`, muestre módulos sin duplicados y permita elegir puesto en rutas compartidas sin romper el comportamiento actual.

**Architecture:** La sesión seguirá teniendo un `role` principal y agregará `additional_roles` normalizados desde el login. La PWA centralizará acceso y resolución de variantes en helpers de `src/lib`, y `ScreenHome` usará un selector de puesto solo cuando una misma ruta tenga varias variantes válidas. Los módulos internos dejarán de depender de comparaciones directas contra `session.role` para permisos generales y usarán el rol efectivo o el rol seleccionado para el flujo actual.

**Tech Stack:** React 18, React Router 6, Vite, Node `node:test`, ESLint.

---

## Scope Note
La spec aprobada cubre Odoo + PWA, pero este plan se limita a la PWA porque este workspace no contiene el backend de Odoo. La implementación asume como prerequisito que Odoo enviará `additional_roles: string[]` junto con el `role` principal.

## File Structure
- Create: `src/lib/effectiveRoles.js`
  - Normaliza `additional_roles`, calcula roles efectivos y helpers `hasEffectiveRole`.
- Create: `src/lib/moduleRoleResolver.js`
  - Resuelve módulos visibles, variantes por ruta y selección de puesto en rutas compartidas.
- Create: `src/components/RolePickerSheet.jsx`
  - Modal/sheet reusable para elegir puesto cuando una ruta tenga múltiples variantes.
- Create: `tests/effectiveRoles.test.mjs`
  - Cubre normalización, deduplicación y permisos por rol efectivo.
- Create: `tests/moduleRoleResolver.test.mjs`
  - Cubre visibilidad de módulos, deduplicación por ruta y conflicto de rutas compartidas.
- Modify: `src/screens/ScreenLogin.jsx`
  - Acepta `additional_roles` del payload y los guarda normalizados en sesión.
- Modify: `src/modules/registry.js`
  - Exporta helpers multi-rol en vez de depender solo de `getModulesForRole`.
- Modify: `src/screens/ScreenHome.jsx`
  - Usa helpers multi-rol y abre selector de puesto cuando aplique.
- Modify: `src/modules/admin/components/AdminShell.jsx`
  - Filtra navegación lateral por roles efectivos.
- Modify: `src/modules/admin/components/HubV2.jsx`
  - Filtra shortcuts por roles efectivos.
- Modify: `src/modules/admin/ScreenAdminPanel.jsx`
  - Filtra acciones mobile por roles efectivos.
- Modify: `src/modules/admin/ScreenMaterialesValidate.jsx`
  - Permisos de validación por roles efectivos.
- Modify: `src/modules/admin/ScreenMaterialesResolverRejected.jsx`
  - Permisos de resolución por roles efectivos.
- Modify: `src/modules/produccion/ScreenMiTurno.jsx`
  - Usa rol seleccionado para decidir variante barra/rolito.
- Modify: `src/modules/produccion/ScreenEmpaque.jsx`
  - Usa rol seleccionado para decidir variante barra/rolito.
- Modify: `src/modules/produccion/ScreenCiclo.jsx`
  - Usa rol seleccionado para decidir variante barra/rolito.
- Modify: `src/modules/almacen-pt/materialsNavigation.js`
  - Resuelve `backTo` con rol efectivo/seleccionado en lugar de solo `session.role`.

### Task 1: Add Failing Tests for Effective Roles

**Files:**
- Create: `tests/effectiveRoles.test.mjs`
- Test: `tests/effectiveRoles.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeAdditionalRoles,
  getEffectiveRoles,
  hasEffectiveRole,
} from '../src/lib/effectiveRoles.js'

test('normalizeAdditionalRoles returns [] for missing payloads', () => {
  assert.deepEqual(normalizeAdditionalRoles(undefined), [])
  assert.deepEqual(normalizeAdditionalRoles(null), [])
  assert.deepEqual(normalizeAdditionalRoles('gerente_sucursal'), [])
})

test('getEffectiveRoles keeps primary role first and removes duplicates', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal', 'auxiliar_admin', 'gerente_sucursal'],
  }

  assert.deepEqual(getEffectiveRoles(session), ['auxiliar_admin', 'gerente_sucursal'])
})

test('hasEffectiveRole checks both primary and additional roles', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal'],
  }

  assert.equal(hasEffectiveRole(session, 'auxiliar_admin'), true)
  assert.equal(hasEffectiveRole(session, 'gerente_sucursal'), true)
  assert.equal(hasEffectiveRole(session, 'almacenista_pt'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effectiveRoles.test.mjs`
Expected: FAIL with `Cannot find module '../src/lib/effectiveRoles.js'` or missing exports.

- [ ] **Step 3: Write minimal implementation**

```js
export function normalizeAdditionalRoles(input) {
  if (!Array.isArray(input)) return []
  return input
    .map((role) => String(role || '').trim())
    .filter(Boolean)
}

export function getEffectiveRoles(session = {}) {
  const primary = String(session?.role || '').trim()
  const extras = normalizeAdditionalRoles(session?.additional_roles)
  return [...new Set([primary, ...extras].filter(Boolean))]
}

export function hasEffectiveRole(session, role) {
  return getEffectiveRoles(session).includes(String(role || '').trim())
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/effectiveRoles.test.mjs`
Expected: PASS for all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add tests/effectiveRoles.test.mjs src/lib/effectiveRoles.js
git commit -m "test: add effective roles helpers"
```

### Task 2: Add Failing Tests for Module Resolution and Shared Routes

**Files:**
- Create: `tests/moduleRoleResolver.test.mjs`
- Test: `tests/moduleRoleResolver.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getVisibleModulesForSession,
  getSharedRouteRoleOptions,
  needsRolePickerForModule,
} from '../src/lib/moduleRoleResolver.js'

test('getVisibleModulesForSession deduplicates modules enabled by multiple roles', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal'],
  }

  const modules = getVisibleModulesForSession(session)
  const ids = modules.map((module) => module.id)

  assert.equal(ids.filter((id) => id === 'admin_sucursal').length, 1)
  assert.equal(ids.includes('gerente'), true)
})

test('shared production route exposes multiple role options when user has more than one variant', () => {
  const session = {
    role: 'operador_barra',
    additional_roles: ['operador_rolito'],
  }

  assert.deepEqual(getSharedRouteRoleOptions(session, '/produccion'), ['operador_barra', 'operador_rolito'])
  assert.equal(needsRolePickerForModule(session, '/produccion'), true)
})

test('shared route skips picker when there is only one valid role for that route', () => {
  const session = {
    role: 'operador_barra',
    additional_roles: ['gerente_sucursal'],
  }

  assert.deepEqual(getSharedRouteRoleOptions(session, '/produccion'), ['operador_barra'])
  assert.equal(needsRolePickerForModule(session, '/produccion'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/moduleRoleResolver.test.mjs`
Expected: FAIL with missing module or missing exports.

- [ ] **Step 3: Write minimal implementation**

```js
import { MODULES } from '../modules/registry.js'
import { getEffectiveRoles } from './effectiveRoles.js'

const SHARED_ROUTE_ROLE_MAP = {
  '/produccion': ['operador_barra', 'operador_rolito', 'auxiliar_produccion'],
  '/ruta': ['jefe_ruta', 'auxiliar_ruta'],
  '/admin': ['auxiliar_admin', 'gerente_sucursal'],
}

export function getVisibleModulesForSession(session = {}) {
  const roles = getEffectiveRoles(session)
  return MODULES.filter((module) =>
    module.roles.includes('*') || module.roles.some((role) => roles.includes(role))
  )
}

export function getSharedRouteRoleOptions(session = {}, route = '') {
  const roles = getEffectiveRoles(session)
  const candidates = SHARED_ROUTE_ROLE_MAP[route] || []
  return candidates.filter((role) => roles.includes(role))
}

export function needsRolePickerForModule(session, route) {
  return getSharedRouteRoleOptions(session, route).length > 1
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/moduleRoleResolver.test.mjs`
Expected: PASS for all route-resolution tests.

- [ ] **Step 5: Commit**

```bash
git add tests/moduleRoleResolver.test.mjs src/lib/moduleRoleResolver.js
git commit -m "test: cover multi-role module resolution"
```

### Task 3: Normalize Session Payload and Registry Access

**Files:**
- Modify: `src/screens/ScreenLogin.jsx`
- Modify: `src/modules/registry.js`
- Modify: `src/lib/effectiveRoles.js`
- Test: `tests/effectiveRoles.test.mjs`

- [ ] **Step 1: Write the failing test for login payload normalization**

Add to `tests/effectiveRoles.test.mjs`:

```js
import { normalizeSessionRoles } from '../src/lib/effectiveRoles.js'

test('normalizeSessionRoles keeps additional_roles array stable and removes primary duplicates', () => {
  const session = normalizeSessionRoles({
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal', 'auxiliar_admin', ''],
  })

  assert.deepEqual(session.additional_roles, ['gerente_sucursal'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/effectiveRoles.test.mjs`
Expected: FAIL with `normalizeSessionRoles is not a function`.

- [ ] **Step 3: Implement session normalization and multi-role registry helper**

```js
export function normalizeSessionRoles(session = {}) {
  const primary = String(session?.role || '').trim()
  const additional_roles = normalizeAdditionalRoles(session?.additional_roles)
    .filter((role) => role !== primary)

  return { ...session, additional_roles }
}
```

Update `src/screens/ScreenLogin.jsx` so `buildSessionFromOdoo()` returns:

```js
return normalizeSessionRoles({
  ...decoded,
  ...fallbackPayload,
  additional_roles: employee?.additional_roles || result?.additional_roles || [],
  session_token: sessionToken,
})
```

Update `src/modules/registry.js` with:

```js
export function getModulesForRoles(roles = []) {
  const uniqRoles = [...new Set(roles.filter(Boolean))]
  return MODULES.filter((module) =>
    module.roles.includes('*') || module.roles.some((role) => uniqRoles.includes(role))
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/effectiveRoles.test.mjs tests/moduleRoleResolver.test.mjs`
Expected: PASS with the new login normalization test.

- [ ] **Step 5: Commit**

```bash
git add src/screens/ScreenLogin.jsx src/modules/registry.js src/lib/effectiveRoles.js tests/effectiveRoles.test.mjs
git commit -m "feat: normalize additional roles in session"
```

### Task 4: Wire Home Screen and Role Picker for Shared Routes

**Files:**
- Create: `src/components/RolePickerSheet.jsx`
- Modify: `src/screens/ScreenHome.jsx`
- Modify: `src/lib/moduleRoleResolver.js`
- Test: `tests/moduleRoleResolver.test.mjs`

- [ ] **Step 1: Write the failing test for route-role selection**

Add to `tests/moduleRoleResolver.test.mjs`:

```js
import { resolveModuleEntryRole } from '../src/lib/moduleRoleResolver.js'

test('resolveModuleEntryRole honors explicit selection for shared routes', () => {
  const session = {
    role: 'operador_barra',
    additional_roles: ['operador_rolito'],
  }

  assert.equal(resolveModuleEntryRole(session, '/produccion', 'operador_rolito'), 'operador_rolito')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/moduleRoleResolver.test.mjs`
Expected: FAIL with missing export.

- [ ] **Step 3: Implement picker flow in Home and resolver helper**

In `src/lib/moduleRoleResolver.js` add:

```js
export function resolveModuleEntryRole(session, route, requestedRole = '') {
  const options = getSharedRouteRoleOptions(session, route)
  if (requestedRole && options.includes(requestedRole)) return requestedRole
  if (options.length === 1) return options[0]
  return ''
}
```

Create `src/components/RolePickerSheet.jsx` with a minimal controlled API:

```jsx
export default function RolePickerSheet({ open, options, onClose, onSelect }) {
  if (!open) return null
  return (
    <div>
      {options.map((role) => (
        <button key={role} onClick={() => onSelect(role)}>
          {role}
        </button>
      ))}
      <button onClick={onClose}>Cancelar</button>
    </div>
  )
}
```

Update `src/screens/ScreenHome.jsx` so `handleModule()`:
- navegue directo si `needsRolePickerForModule(session, mod.route)` es `false`
- abra `RolePickerSheet` si hay varias variantes
- haga `navigate(mod.route, { state: { selected_role: role } })` al confirmar

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/moduleRoleResolver.test.mjs`
Expected: PASS con `resolveModuleEntryRole`.

- [ ] **Step 5: Commit**

```bash
git add src/components/RolePickerSheet.jsx src/screens/ScreenHome.jsx src/lib/moduleRoleResolver.js tests/moduleRoleResolver.test.mjs
git commit -m "feat: add shared-route role picker"
```

### Task 5: Replace Direct Role Checks in Admin and Production Flows

**Files:**
- Modify: `src/modules/admin/components/AdminShell.jsx`
- Modify: `src/modules/admin/components/HubV2.jsx`
- Modify: `src/modules/admin/ScreenAdminPanel.jsx`
- Modify: `src/modules/admin/ScreenMaterialesValidate.jsx`
- Modify: `src/modules/admin/ScreenMaterialesResolverRejected.jsx`
- Modify: `src/modules/produccion/ScreenMiTurno.jsx`
- Modify: `src/modules/produccion/ScreenEmpaque.jsx`
- Modify: `src/modules/produccion/ScreenCiclo.jsx`
- Modify: `src/modules/almacen-pt/materialsNavigation.js`
- Test: `tests/effectiveRoles.test.mjs`
- Test: `tests/moduleRoleResolver.test.mjs`

- [ ] **Step 1: Write the failing tests for admin and production access helpers**

Add to `tests/effectiveRoles.test.mjs`:

```js
import { hasAnyEffectiveRole } from '../src/lib/effectiveRoles.js'

test('hasAnyEffectiveRole unlocks gerente-only admin actions from additional roles', () => {
  const session = {
    role: 'auxiliar_admin',
    additional_roles: ['gerente_sucursal'],
  }

  assert.equal(hasAnyEffectiveRole(session, ['gerente_sucursal', 'direccion_general']), true)
})
```

Add to `tests/moduleRoleResolver.test.mjs`:

```js
import { getActiveRoleForLocationState } from '../src/lib/moduleRoleResolver.js'

test('getActiveRoleForLocationState returns selected_role when it is valid for the route', () => {
  const session = {
    role: 'operador_barra',
    additional_roles: ['operador_rolito'],
  }

  assert.equal(
    getActiveRoleForLocationState(session, '/produccion', { selected_role: 'operador_rolito' }),
    'operador_rolito'
  )
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/effectiveRoles.test.mjs tests/moduleRoleResolver.test.mjs`
Expected: FAIL with missing exports.

- [ ] **Step 3: Implement helper-based checks and selected-role resolution**

In `src/lib/effectiveRoles.js` add:

```js
export function hasAnyEffectiveRole(session, roles = []) {
  const effective = getEffectiveRoles(session)
  return roles.some((role) => effective.includes(String(role || '').trim()))
}
```

In `src/lib/moduleRoleResolver.js` add:

```js
export function getActiveRoleForLocationState(session, route, state = {}) {
  return resolveModuleEntryRole(session, route, state?.selected_role || state?.active_role || '')
}
```

Then update:
- admin files to use `hasAnyEffectiveRole(session, ALLOWED_ROLES)` and effective-role nav filters
- production files to derive `const activeRole = getActiveRoleForLocationState(session, '/produccion', location.state)`
- `materialsNavigation.js` to accept selected/effective role and send the proper `backTo`

- [ ] **Step 4: Run tests and lint/build verification**

Run: `node --test tests/effectiveRoles.test.mjs tests/moduleRoleResolver.test.mjs tests/materialsNavigation.test.mjs`
Expected: PASS.

Run: `npm run lint`
Expected: PASS with no warnings.

Run: `npm run build`
Expected: Vite production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/modules/admin/components/AdminShell.jsx src/modules/admin/components/HubV2.jsx src/modules/admin/ScreenAdminPanel.jsx src/modules/admin/ScreenMaterialesValidate.jsx src/modules/admin/ScreenMaterialesResolverRejected.jsx src/modules/produccion/ScreenMiTurno.jsx src/modules/produccion/ScreenEmpaque.jsx src/modules/produccion/ScreenCiclo.jsx src/modules/almacen-pt/materialsNavigation.js src/lib/effectiveRoles.js src/lib/moduleRoleResolver.js tests/effectiveRoles.test.mjs tests/moduleRoleResolver.test.mjs
git commit -m "feat: apply effective roles across modules"
```

### Task 6: Final Verification and Handoff

**Files:**
- Modify: `CHANGES.md` (only if the project convention requires recording the feature)
- Test: `tests/effectiveRoles.test.mjs`
- Test: `tests/moduleRoleResolver.test.mjs`
- Test: `tests/materialsNavigation.test.mjs`

- [ ] **Step 1: Run the full verification suite**

Run: `node --test tests/effectiveRoles.test.mjs tests/moduleRoleResolver.test.mjs tests/materialsNavigation.test.mjs tests/logoutFlow.test.mjs tests/cycleTiming.test.mjs tests/transformationHelpers.test.mjs tests/supervisionShiftContext.test.mjs`
Expected: PASS for all targeted Node tests.

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Manually verify the critical flows**

Check:
- login without `additional_roles` still behaves exactly igual
- login with `additional_roles` muestra módulos extra sin duplicados
- `/produccion` asks for role only when multiple valid production roles exist
- `/admin` exposes gerente actions when `gerente_sucursal` arrives as additional role
- materials validation/resolution unlock correctly through effective roles

- [ ] **Step 3: Update changelog if needed**

If required by repo convention, add a brief entry like:

```md
- Added effective-role access with `additional_roles` and shared-route role picker.
```

- [ ] **Step 4: Commit the final verified state**

```bash
git add CHANGES.md
git commit -m "chore: document additional roles rollout"
```
