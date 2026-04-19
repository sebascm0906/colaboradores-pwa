# Backend Endpoints Pendientes

Lista de endpoints que la PWA espera pero que aún no están expuestos por Odoo / n8n.
Cuando un endpoint se habilite, el frontend puede conectarse **sin cambios en la UI**
— solo hay que reemplazar el cuerpo del servicio stub correspondiente.

Última actualización: 2026-04-17

---

## 🔴 CRÍTICO — bloqueantes para productivo

### 0. Metabase Embed Token — P0 (bug de logout corregido en frontend 2026-04-18)

El módulo `gf_metabase_embed` existe pero es STUB (`installable: False`, sin controllers). La pantalla `/kpis` llama `/pwa-metabase-token` y antes del parche el 401 disparaba logout automático. **El parche frontend degrada silenciosamente al MockDashboard** si el endpoint no existe, pero el backend sigue pendiente.

**Contrato esperado del endpoint**:

```python
# addons/gf_metabase_embed/controllers/metabase.py
from odoo import http
from odoo.http import request
import jwt, time

class MetabaseEmbedController(http.Controller):

    @http.route('/pwa-metabase-token', type='json', auth='user', methods=['POST', 'GET'], csrf=False)
    def get_metabase_token(self, job_key='VENDEDOR', **kw):
        # 1. Resolver dashboard_id según job_key del empleado
        dashboard_map = {
            'VENDEDOR':      int(request.env['ir.config_parameter'].sudo().get_param('metabase.dashboard.vendedor', '0')),
            'JEFE_RUTA':     int(request.env['ir.config_parameter'].sudo().get_param('metabase.dashboard.jefe_ruta', '0')),
            'SUPERVISOR':    int(request.env['ir.config_parameter'].sudo().get_param('metabase.dashboard.supervisor', '0')),
            'GERENTE':       int(request.env['ir.config_parameter'].sudo().get_param('metabase.dashboard.gerente', '0')),
            'AUXILIAR_ADMIN':int(request.env['ir.config_parameter'].sudo().get_param('metabase.dashboard.admin', '0')),
        }
        dashboard_id = dashboard_map.get(job_key.upper(), dashboard_map['VENDEDOR'])
        if not dashboard_id:
            return {'success': False, 'embed_url': None, 'reason': 'no_dashboard_configured'}

        # 2. Firmar JWT con METABASE_SECRET_KEY (ir.config_parameter)
        secret = request.env['ir.config_parameter'].sudo().get_param('metabase.secret_key')
        site   = request.env['ir.config_parameter'].sudo().get_param('metabase.site_url', 'https://metabase.grupofrio.mx')
        if not secret:
            return {'success': False, 'embed_url': None, 'reason': 'secret_not_configured'}

        emp = request.env.user.employee_id
        payload = {
            'resource': {'dashboard': dashboard_id},
            'params': {
                'employee_id': emp.id,
                'company_id':  emp.company_id.id,
            },
            'exp': int(time.time()) + 60 * 10  # 10 min
        }
        token = jwt.encode(payload, secret, algorithm='HS256')
        url = f"{site}/embed/dashboard/{token}#bordered=false&titled=false"
        return {'success': True, 'embed_url': url, 'dashboard_id': dashboard_id}
```

**Respuesta esperada por la PWA**:
```json
{ "success": true, "embed_url": "https://metabase.grupofrio.mx/embed/dashboard/eyJ...#bordered=false&titled=false" }
```

**Config params necesarios en Odoo**:
- `metabase.secret_key` — shared secret de Metabase (Admin > Embedding in other Applications > Enable)
- `metabase.site_url` — URL pública de Metabase
- `metabase.dashboard.vendedor` — ID de dashboard para ese rol (repetir por cada rol)

**Mientras tanto (ya implementado)**: el frontend usa `MockMetabaseDashboard` como fallback. No crashea.

---


### 1. Cash Closing — validación de umbrales y autorización

Actualmente `/pwa-admin/cash-closing` solo persiste el cierre. La PWA ya valida umbrales en UI (`CIERRE_THRESHOLDS` en `AdminCierreForm`), pero backend debe:

| Endpoint | Método | Payload | Responsabilidad |
|----------|--------|---------|-----------------|
| `/pwa-admin/cash-closing/authorize` | POST | `{closing_id, auth_level, auth_user_id}` | Marca autorización gerente/dirección |
| `/pwa-admin/cash-closing/reopen` | POST | `{closing_id, reason}` | Reabre cierre ya cerrado (con log) |

**Regla de negocio**: si `|difference| > 100`, requiere nota. Si `> 1000`, flag `needs_manager_auth=True`. Si `> 10000`, flag `needs_director_auth=True`. El cierre queda en estado `pending_auth` hasta que el gerente/dirección apruebe.

---

### 2. POS — folio de terminal y cancelación auditada

El frontend ya envía `payment_reference` cuando `payment_method='card'`. Backend debe:

| Endpoint | Cambios |
|----------|---------|
| `/pwa-admin/sale-create` | Validar que `payment_reference` sea requerido si `payment_method='card'`. Persistirlo en `sale.order.payment_reference`. |
| `/pwa-admin/sale-cancel` | Requerir `reason` categorizado (ya existe). Agregar `requires_manager_auth` si ticket > $5000. |

---

### 3. Auditoría Corte + Liquidación de ruta

Hoy `corteDone` y `liquidacionDone` solo viven en `localStorage` (`routeControlService.js:332-407`). Backend debe:

| Endpoint | Método | Payload | Qué persistir |
|----------|--------|---------|----------------|
| `/pwa-ruta/corte-confirm` | POST | `{plan_id, at, notes}` | `gf.route.plan.corte_done_at`, `corte_done_by_id` |
| `/pwa-ruta/liquidacion-confirm` | POST | `{plan_id, at, notes}` | `gf.route.plan.liquidacion_done_at`, `liquidacion_done_by_id` |

Una vez disponibles, `saveCierreState()` en `routeControlService.js` debe primero enviar a backend y solo usar localStorage como cache.

---

## 🟠 ALTO — funcional pero degrada con stubs

### 4. Tareas del supervisor de ventas

Hoy en `src/modules/supervisor-ventas/tareasService.js` con `IS_STUB=true` (localStorage).

| Endpoint | Método | Payload |
|----------|--------|---------|
| `/pwa-supv/tasks` | GET | `?assignee_id=X&state=Y` → list |
| `/pwa-supv/tasks/create` | POST | `{title, description, assignee_id, priority, due_date}` |
| `/pwa-supv/tasks/update` | POST | `{task_id, patch: {state, priority, ...}}` |
| `/pwa-supv/tasks/complete` | POST | `{task_id, completion_notes}` |

Sugerencia de modelo Odoo: `gf.supv.task` con `_inherit=['mail.thread']` para tracking.

---

### 5. Notas de coaching

Hoy en `src/modules/supervisor-ventas/notasService.js` con `IS_STUB=true`.

| Endpoint | Método | Payload |
|----------|--------|---------|
| `/pwa-supv/notes` | GET | `?subject_type=vendor\|customer&subject_id=X` |
| `/pwa-supv/notes/create` | POST | `{subject_type, subject_id, body}` |
| `/pwa-supv/notes/delete` | POST | `{note_id}` → soft delete |

Sugerencia: modelo `gf.supv.note` o reutilizar `mail.message` con `model=hr.employee|res.partner`.

---

### 6. Ventas del día por vendedor

Hoy el supervisor ve ventas **mensuales acumuladas** (`hr.employee.monthly.target.sales_actual`). Para ver del día:

| Endpoint | Método | Notas |
|----------|--------|-------|
| `/pwa-supv/day-sales` | GET | `?date=YYYY-MM-DD&employee_id=X` — suma ventas de ese día |

Referencia en `supvService.js:20-23` (TODO documentado).

---

### 7. Foto / Evidencia — upload centralizado

Hoy `PhotoCapture` envía `base64` inline en cada endpoint (gastos, merma, devoluciones). Esto:
- Duplica datos si se usa la misma foto
- No permite previews URL
- Satura el body del request

| Endpoint | Método | Payload | Retorna |
|----------|--------|---------|---------|
| `/pwa/evidence/upload` | POST | `{file_base64, mime_type, linked_model, linked_id}` | `{attachment_id, url}` |

Cuando esté listo, `PhotoCapture.jsx` llama aquí y retorna `attachment_id` en lugar de base64.

---

## 🟡 MEDIO — mejoras de trazabilidad

### 8. Rechazo de pallet — log de quién y por qué

`rejectPallet()` en `entregasService.js` hoy no registra responsable. Backend debe añadir:

- `gf.stock.pallet.rejected_by_id`
- `gf.stock.pallet.rejected_at`
- `gf.stock.pallet.reject_reason`

### 9. Buscador de clientes para notas

Hoy `ScreenNotasCliente` requiere que el usuario copie manualmente el `res.partner.id`.

| Endpoint | Método | Notas |
|----------|--------|-------|
| `/pwa-supv/customers/search` | GET | `?q=texto&limit=20` — busca en res.partner por nombre/RFC |

### 10. Incidencias del equipo (supervisor de rutas)

`getMyIncidents()` hoy filtra por `employee_id` del usuario. Si un gerente de rutas quiere ver **todas**:

| Endpoint | Método | Notas |
|----------|--------|-------|
| `/pwa-ruta/team-incidents` | GET | `?date=X&route_ids[]=1,2,3` |

---

## 🟢 BAJO — nice to have

### 11. Capabilities dinámicos — extender `/pwa-admin/capabilities`

Hoy `BACKEND_CAPS` tiene ~15 flags. Extender con:

```python
{
  "cashClosingThresholds": {"note": 100, "manager": 1000, "director": 10000},
  "posThresholds": {"manager": 5000, "director": 50000},
  "evidenceUpload": true,
  "tasksEnabled": true,
  "notesEnabled": true,
}
```

La PWA lee estos en boot y adapta los umbrales sin hardcodear.

### 12. Reapertura de cierre de caja

Hoy `canSubmit` en `AdminCierreForm` bloquea si `state=closed`. Backend debe:

- `/pwa-admin/cash-closing/reopen` con log en chatter
- Solo rol `gerente_sucursal` puede hacerlo
- Se escribe un nuevo cierre en lugar de modificar el original

---

## 📌 Notas generales

- Todos los endpoints deben validar el **company_id + warehouse_id** de la sesión, no aceptar los del body sin verificar.
- Todos los POST deben respetar el flag `BACKEND_CAPS.*` del lado cliente — la PWA no envía el request si el flag está en false.
- Cualquier endpoint nuevo debe registrarse en `adminService.BACKEND_CAPS` para que la UI lo detecte en boot.
