# Historial de Gastos por Sucursal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only history screen for branch admins to inspect expenses captured by branch, with filters by company, date range, capturer, status, and free text.

**Architecture:** Keep the expense entry form untouched and introduce a separate history route under `Admin Sucursal`. The data flow should go directly from the screen to `src/lib/api.js`, which will query Odoo (`hr.expense`) with strict company-aware filters and return a normalized list plus totals. The UI should follow the existing glassmorphism admin screens, reuse the current token system, and stay read-only so it cannot mutate or invalidate the session.

**Tech Stack:** React 18, React Router v6, Vite, Odoo JSON-RPC/helpers, existing design tokens, ESLint.

---

### Task 1: Add a direct Odoo expense-history endpoint and client helper

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/modules/admin/api.js`

- [ ] **Step 1: Verify the current gap**

Run:
```bash
npx eslint src/lib/api.js src/modules/admin/api.js
```
Expected: pass. This confirms the current code still lint-checks before adding the new endpoint.

- [ ] **Step 2: Implement the direct history endpoint**

Add a new `GET /pwa-admin/expenses-history` branch in `routeDirect()` / `directAdmin()` that:
- parses `company_id`, `employee_id`, `state`, `q`, `date_from`, `date_to`
- filters `hr.expense` with `sudo=1`
- restricts by company first, then optional capturer and status filters
- searches `name` and `description` for free text
- returns a normalized payload with:
  - `items`
  - `summary` containing count and total amount
  - `filters` echoing the effective filters

Add a helper in `src/modules/admin/api.js`:
```js
export function getExpensesHistory(filters) {
  return api('GET', `/pwa-admin/expenses-history?${new URLSearchParams(filters)}`)
}
```

- [ ] **Step 3: Verify the endpoint wiring**

Run:
```bash
npx eslint src/lib/api.js src/modules/admin/api.js
```
Expected: pass.

### Task 2: Build the branch expense history screen

**Files:**
- Create: `src/modules/admin/ScreenGastosHistorial.jsx`
- Modify: `src/modules/admin/ScreenAdminPanel.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create the new screen skeleton**

Implement a read-only screen that:
- uses the existing tokens and `getTypo()`
- loads allowed companies from `getCompaniesForSucursal(session?.sucursal)`
- defaults the date range to today
- loads the list via `getExpensesHistory()`
- shows summary cards for count and total
- renders a compact list with date, description, amount, company/sucursal, capturista, and status

- [ ] **Step 2: Add filters and empty/loading states**

Add controls for:
- company/sucursal
- date from
- date to
- capturer
- status
- free-text search

Make the filters combinable and preserve the current values when refreshing the list.

- [ ] **Step 3: Expose the screen in the admin entry point**

Update `ScreenAdminPanel` to add a new action card for `Historial de Gastos` that routes to `/admin/gastos-historial`.

Add the lazy import and route in `src/App.jsx` so the new screen is protected by `PrivateRoute`.

- [ ] **Step 4: Verify the screen compiles**

Run:
```bash
npx eslint src/modules/admin/ScreenGastosHistorial.jsx src/modules/admin/ScreenAdminPanel.jsx src/App.jsx
npm run build
```
Expected: both commands pass.

### Task 3: End-to-end branch validation

**Files:**
- Modify: only if needed after validation

- [ ] **Step 1: Reproduce the flow manually**

Open the app, log in as an admin/branch user, enter `Admin Sucursal`, and open `Historial de Gastos`.

- [ ] **Step 2: Validate filter behavior**

Check that:
- the default list matches the branch/company context
- changing company updates the list
- filtering by capturer returns only that user’s expenses
- the date range limits the results correctly
- text search matches expense name/description

- [ ] **Step 3: Verify session safety**

Confirm that:
- opening the history screen does not trigger `gf:session-expired`
- the screen does not route through n8n for reads
- the existing expense entry flow still works unchanged

- [ ] **Step 4: Commit if any follow-up fixes are needed**

If the validation surfaces a bug, fix it in the smallest file possible, then rerun:
```bash
npx eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0
npm run build
```
Expected: pass.
