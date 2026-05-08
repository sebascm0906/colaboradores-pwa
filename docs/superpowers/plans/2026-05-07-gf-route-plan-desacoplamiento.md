# GF Route Plan Desacoplamiento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `gf.route.plan` the operational source of truth for daily driver, vehicle, and mobile inventory location assignments while keeping legacy `gf.route` behavior compatible.

**Architecture:** `gf.route` remains the legacy territory/route record and still provides fallback values during transition. `gf.route.plan` gains explicit dynamic operational fields (`vehicle_id`, `mobile_location_id`, later `shift_type`/`run_number`) and all new route, load, checklist, and PWA plan payloads prefer plan-level values over route-level values. No legacy fields are removed in this phase.

**Tech Stack:** Odoo Python models/controllers/views/tests in `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops`; React 18/Vite PWA in `/Users/sebis/Documents/odoo/gf-pwa-colaboradores`; `node:test` for PWA unit tests; Odoo `TransactionCase`/HTTP tests for backend.

---

## Scope

This plan implements **Fase 1 - Desacoplar plan del día** only.

In scope:

- Add explicit `vehicle_id` and `mobile_location_id` to `gf.route.plan`.
- Keep fallback from `gf.route.vehicle_id` and `gf.route.location_en_ruta_id` for old records.
- Make plan serialization return plan-level vehicle/location.
- Make load picking validation/generation prefer plan-level mobile location.
- Make vehicle checklist snapshot use plan-level vehicle.
- Update PWA normalization to carry `vehicle_id` and `mobile_location_id`.
- Add tests proving two plans for the same route can use different vehicles/mobile locations.

Out of scope:

- Removing fields from `gf.route`.
- Full `gf.route.handover`.
- Full sub-polygons migration.
- DB data migration/backfill scripts.
- Reworking Kold Field sale creation beyond plan-level warehouse/location hooks.

## File Structure

### Backend Odoo

- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_route_plan.py`
  - Add plan-level `vehicle_id`, `mobile_location_id`.
  - Add helper methods `effective_vehicle_id`, `effective_mobile_location_id` or regular private helpers.
  - Prefer plan-level values in load picking domain/generation/return/capacity.
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_route_vehicle_checklist.py`
  - Change related vehicle from `route_plan_id.route_id.vehicle_id` to `route_plan_id.vehicle_id` once field exists, or computed fallback if legacy compatibility is needed.
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_dispatch_reconciliation.py`
  - Prefer plan-level mobile location when computing product exchange quantities.
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/controllers/gf_api.py`
  - Serialize `vehicle_id`, `vehicle_name`, `mobile_location_id`, `mobile_location_name` from plan-level fields with legacy fallback.
  - Validate load acceptance against plan mobile location.
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/views/gf_route_plan_views.xml`
  - Expose `vehicle_id` and `mobile_location_id` in plan form near driver/salesperson.
- Test: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/tests/test_route_plan_dynamic_assignment.py`
  - New focused tests for dynamic plan assignment and fallback.

### PWA

- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/ruta/api.js`
  - Document returned plan-level `vehicle_id`/`mobile_location_id`.
- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js`
  - Direct `/pwa-ruta/my-plan` fallback reads `vehicle_id` and `mobile_location_id`.
- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/ruta/routeControlService.js`
  - Preserve plan-level vehicle/location in `getRouteDaySummary`.
- Test: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/tests/routeFlowState.test.mjs` or new `tests/routePlanAssignment.test.mjs`
  - Add unit coverage for plan payloads with vehicle/mobile location.

---

### Task 1: Backend Tests For Dynamic Plan Vehicle And Mobile Location

**Files:**
- Create: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/tests/test_route_plan_dynamic_assignment.py`

- [ ] **Step 1: Write failing test for plan-level vehicle/location overriding route legacy**

Create test data with one route, two vehicles, two internal stock locations, and two route plans on the same date.

Expected behavior:

```python
def test_two_plans_same_route_can_use_different_mobile_locations(self):
    plan_a = self.Plan.create({
        "route_id": self.route.id,
        "date": self.today,
        "driver_employee_id": self.driver_a.id,
        "salesperson_employee_id": self.driver_a.id,
        "vehicle_id": self.vehicle_a.id,
        "mobile_location_id": self.mobile_location_a.id,
    })
    plan_b = self.Plan.create({
        "route_id": self.route.id,
        "date": self.today,
        "driver_employee_id": self.driver_b.id,
        "salesperson_employee_id": self.driver_b.id,
        "vehicle_id": self.vehicle_b.id,
        "mobile_location_id": self.mobile_location_b.id,
    })

    self.assertEqual(plan_a.vehicle_id, self.vehicle_a)
    self.assertEqual(plan_a.mobile_location_id, self.mobile_location_a)
    self.assertEqual(plan_b.vehicle_id, self.vehicle_b)
    self.assertEqual(plan_b.mobile_location_id, self.mobile_location_b)
```

- [ ] **Step 2: Write failing test for legacy fallback**

Expected behavior:

```python
def test_plan_without_dynamic_assignment_falls_back_to_route_legacy_values(self):
    plan = self.Plan.create({
        "route_id": self.route.id,
        "date": self.today,
    })

    self.assertEqual(plan._effective_vehicle(), self.route.vehicle_id)
    self.assertEqual(plan._effective_mobile_location(), self.route.location_en_ruta_id)
```

- [ ] **Step 3: Run backend test and confirm RED**

Run from `/Users/sebis/Documents/odoo/GrupoFrio`:

```bash
python3 /Users/sebis/Documents/odoo/GrupoFrio/odoo-bin \
  -d <test_db> \
  --test-enable \
  --stop-after-init \
  -i gf_logistics_ops \
  --test-tags /gf_logistics_ops
```

Expected: FAIL because `vehicle_id`/`mobile_location_id` do not exist on `gf.route.plan`.

---

### Task 2: Add Dynamic Assignment Fields To `gf.route.plan`

**Files:**
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_route_plan.py`
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/views/gf_route_plan_views.xml`

- [ ] **Step 1: Add minimal fields**

Add near employee fields:

```python
vehicle_id = fields.Many2one("fleet.vehicle", tracking=True, ondelete="set null")
mobile_location_id = fields.Many2one(
    "stock.location",
    string="Ubicación móvil",
    tracking=True,
    ondelete="set null",
    help="Ubicación de inventario de la camioneta asignada a este plan.",
)
```

- [ ] **Step 2: Add fallback helpers**

Add methods:

```python
def _effective_vehicle(self):
    self.ensure_one()
    return self.vehicle_id or self.route_id.vehicle_id

def _effective_mobile_location(self):
    self.ensure_one()
    return self.mobile_location_id or self.route_id.location_en_ruta_id
```

- [ ] **Step 3: Keep create/onchange compatible**

In `create()` and `_onchange_route_id`, set defaults only when missing:

```python
vals.setdefault("vehicle_id", route.vehicle_id.id)
vals.setdefault("mobile_location_id", route.location_en_ruta_id.id)
```

Do not overwrite explicitly selected plan values.

- [ ] **Step 4: Show fields in plan view**

Add `vehicle_id` and `mobile_location_id` after driver/salesperson in `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/views/gf_route_plan_views.xml`.

- [ ] **Step 5: Run backend tests and confirm GREEN**

Run the same backend test command from Task 1.

Expected: dynamic assignment tests pass.

---

### Task 3: Use Plan Mobile Location In Loads, Returns, And Reconciliation

**Files:**
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_route_plan.py`
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_dispatch_reconciliation.py`
- Test: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/tests/test_route_plan_dynamic_assignment.py`

- [ ] **Step 1: Add failing load-picking destination test**

Expected:

```python
def test_generate_load_picking_uses_plan_mobile_location(self):
    self.plan.write({
        "state": "published",
        "mobile_location_id": self.mobile_location_b.id,
    })
    self.plan.action_generate_load_picking()
    self.assertEqual(self.plan.load_picking_id.location_dest_id, self.mobile_location_b)
```

- [ ] **Step 2: Replace route mobile location references**

In `gf_route_plan.py`, replace operational use of:

```python
self.route_id.location_en_ruta_id
rec.route_id.location_en_ruta_id
route.location_en_ruta_id
```

with:

```python
self._effective_mobile_location()
rec._effective_mobile_location()
```

for:

- `_route_load_picking_domain`
- `_get_route_load_pickings`
- `action_generate_load_picking`
- `action_generate_return_picking`

Keep `warehouse_dispatch_id` fallback on route for this phase.

- [ ] **Step 3: Update reconciliation product exchange lookup**

In `gf_dispatch_reconciliation.py`, change:

```python
mobile_location = plan.route_id.location_en_ruta_id
```

to:

```python
mobile_location = plan._effective_mobile_location()
```

- [ ] **Step 4: Run backend tests**

Expected: load picking and reconciliation tests pass.

---

### Task 4: Serialize Plan-Level Vehicle And Mobile Location In API

**Files:**
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/controllers/gf_api.py`
- Test: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/tests/test_route_plan_dynamic_assignment.py`

- [ ] **Step 1: Add failing serializer test**

Expected payload:

```python
data = controller._plan_data(plan)
self.assertEqual(data["vehicle_id"], plan.vehicle_id.id)
self.assertEqual(data["mobile_location_id"], plan.mobile_location_id.id)
```

- [ ] **Step 2: Update `_plan_data`**

Change:

```python
vehicle = plan.route_id.vehicle_id
...
"mobile_location_id": plan.route_id.location_en_ruta_id.id or False,
```

to:

```python
vehicle = plan._effective_vehicle()
mobile_location = plan._effective_mobile_location()
...
"vehicle_id": vehicle.id if vehicle else False,
"vehicle_name": vehicle.display_name if vehicle else "",
"mobile_location_id": mobile_location.id if mobile_location else False,
"mobile_location_name": mobile_location.display_name if mobile_location else "",
```

- [ ] **Step 3: Update load acceptance validation**

In `_prepare_route_load_picking`, use:

```python
mobile_location = plan._effective_mobile_location()
```

instead of `plan.route_id.location_en_ruta_id`.

- [ ] **Step 4: Run focused backend tests**

Expected: API serializer and accept-load validation pass.

---

### Task 5: Vehicle Checklist Uses Plan Vehicle

**Files:**
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/models/gf_route_vehicle_checklist.py`
- Test: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/tests/test_route_plan_dynamic_assignment.py`

- [ ] **Step 1: Add failing checklist vehicle test**

Expected:

```python
checklist = self.env["gf.route.vehicle.checklist"].create({
    "route_plan_id": plan.id,
})
self.assertEqual(checklist.vehicle_id, plan.vehicle_id)
```

- [ ] **Step 2: Change checklist vehicle relation**

Preferred simple version:

```python
vehicle_id = fields.Many2one(
    "fleet.vehicle",
    related="route_plan_id.vehicle_id",
    store=True,
)
```

If legacy fallback is required in the UI, use a computed stored field that returns `route_plan_id.vehicle_id or route_plan_id.route_id.vehicle_id`.

- [ ] **Step 3: Run focused backend tests**

Expected: checklist vehicle follows plan assignment.

---

### Task 6: PWA Carries Dynamic Assignment Fields

**Files:**
- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js`
- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/modules/ruta/api.js`
- Create: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/tests/routePlanAssignment.test.mjs`

- [ ] **Step 1: Write failing PWA plan normalization test**

Test that plan payloads include:

```js
vehicle_id
vehicle_name
mobile_location_id
mobile_location_name
```

and that fallback/direct mode does not drop them.

- [ ] **Step 2: Update direct `/pwa-ruta/my-plan` fallback**

In `src/lib/api.js`, add these fields to the read list:

```js
"vehicle_id",
"mobile_location_id",
```

Also normalize them in the returned row if needed.

- [ ] **Step 3: Update comments/contracts in route API wrapper**

In `src/modules/ruta/api.js`, document that `getMyRoutePlan()` returns plan-level vehicle/location.

- [ ] **Step 4: Run PWA tests**

Run:

```bash
npm run test
```

Expected: all tests pass.

---

### Task 7: Ambiguous Plan Lookup Guardrail

**Files:**
- Modify: `/Users/sebis/Documents/odoo/GrupoFrio/gf_logistics_ops/controllers/gf_api.py`
- Modify: `/Users/sebis/Documents/odoo/gf-pwa-colaboradores/src/lib/api.js`
- Test: backend and PWA tests from previous tasks

- [ ] **Step 1: Add backend test for multiple plans without `plan_id`**

Expected behavior for write/mutation endpoints:

- If `plan_id` is provided, use it.
- If `plan_id` is missing and more than one active/published/in-progress plan exists for employee/date, return a functional error requiring plan selection.

- [ ] **Step 2: Keep read path compatible**

For `/pwa-ruta/my-plan`, keep current single-plan behavior during transition, but plan the future `/pwa-ruta/my-plans` list endpoint.

- [ ] **Step 3: Add PWA TODO-safe handling**

If backend returns `multiple_plans`, PWA should show a clear “Selecciona plan” error instead of silently picking one.

- [ ] **Step 4: Run full focused tests**

Backend:

```bash
python3 /Users/sebis/Documents/odoo/GrupoFrio/odoo-bin -d <test_db> --test-enable --stop-after-init -i gf_logistics_ops --test-tags /gf_logistics_ops
```

PWA:

```bash
npm run test
```

---

## Verification Checklist

- [ ] Existing route without plan vehicle/location still works through fallback.
- [ ] New plan can use vehicle/location different from route.
- [ ] Two plans same route/date can use different vehicles/mobile locations.
- [ ] Load picking destination is `plan.mobile_location_id`.
- [ ] Return picking source is `plan.mobile_location_id`.
- [ ] Reconciliation uses `plan.mobile_location_id`.
- [ ] Vehicle checklist displays plan vehicle.
- [ ] PWA receives and preserves `vehicle_id` and `mobile_location_id`.
- [ ] No `gf.route` fields are removed.
- [ ] No migration scripts are introduced in this phase.

## Commit Strategy

Commit after each green task:

```bash
git add <changed files>
git commit -m "feat: add dynamic route plan assignment"
```

Use smaller commit messages per task when possible:

- `test: cover dynamic route plan assignment`
- `feat: add route plan vehicle and mobile location`
- `feat: use plan mobile location for route loads`
- `feat: expose plan assignment in ruta api`

## Next Phase After This Plan

After Fase 1 is green, write a separate plan for **Fase 2 - Inventario por camioneta/location**. That phase should address sale order warehouse/location resolution, Kold Field `plan_id`, and liquidation by plan/location more deeply.
