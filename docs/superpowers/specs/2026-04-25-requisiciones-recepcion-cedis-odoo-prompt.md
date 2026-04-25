# Prompt Odoo: Requisiciones con Recepción Parcial y Tipo de Operación por Empresa + CEDIS

Usa este prompt en el workspace de Odoo donde vive el backend real de requisiciones, Torre y stock.

## Prompt
```text
Necesito que implementes un cambio end-to-end en Odoo para el flujo de requisiciones de la PWA.

Primero revisa el código existente y ubica los modelos/controladores reales que hoy soportan:
- creación de requisiciones desde PWA Admin (`/pwa-admin/requisition-create`)
- historial/detalle de requisiciones (`/pwa-admin/requisitions`, `/pwa-admin/requisition-detail`)
- validación/confirmación en Torre (`/pwa-admin/torre/requisition-confirm`)
- modelo de aprobación relacionado (`gf.pwa.requisition` si existe)
- relación entre `purchase.order` y los `stock.picking` de recepción que nacen al confirmar

No asumas nombres de modelos o campos si no existen. Inspecciona primero el código actual y ajusta la implementación a la estructura real del módulo.

Objetivo funcional:
1. La requisición sigue naciendo como `purchase.order`.
2. Torre la confirma.
3. Odoo debe resolver automáticamente el `stock.picking.type` correcto usando:
   - `company_id` de la requisición
   - cuenta analítica de la requisición, usada como identidad del CEDIS
4. En la PWA, el historial de requisiciones debe poder mostrar un estado logístico derivado:
   - `confirmed` => "Confirmado"
   - `partially_received` => "Parcialmente recibido"
   - `received` => "Recibido"
5. La recepción debe operar sobre el `stock.picking` real de Odoo, con soporte de recepción parcial por línea.

Reglas de negocio aprobadas:
- La empresa se toma del `payload` de la requisición/cotización, no del empleado.
- La cuenta analítica representa el CEDIS.
- La combinación `empresa + cuenta analítica(CEDIS)` determina el `stock.picking.type`.
- Ejemplo: si la cuenta analítica es `[IGU] Iguala` y la empresa es `Fabricación de Congelados`, debe resolverse algo como `Fabricación de Congelados: CEDIS Iguala`.
- No quiero hardcodes por empleado.
- Si falta configuración de la combinación `empresa + cuenta analítica`, el backend debe fallar con error claro.
- La recepción parcial debe quedar reflejada como estado intermedio.

Diseño esperado:

A. Estado derivado de recepción
- No agregues un estado nuevo a `purchase.order.state`.
- Calcula un `receipt_state` derivado leyendo los pickings/movimientos reales ligados a la OC.
- Reglas:
  - `confirmed`: OC confirmada y nada recibido
  - `partially_received`: recibido > 0 pero aún pendiente
  - `received`: todo recibido

B. Configuración para resolver el tipo de operación
- Implementa una configuración explícita por combinación:
  - `company_id`
  - `analytic_account_id`
  - `picking_type_id`
- Si ayuda a robustecer, también puedes guardar `warehouse_id` y/o `location_dest_id`.
- La resolución debe vivir en backend Odoo.

C. Cuenta analítica en líneas
- Asegura que la cuenta analítica quede grabada correctamente en `analytic_distribution` de las líneas relevantes.
- Esto debe servir para:
  - contabilidad/analítica
  - identificar el CEDIS
  - resolver el tipo de operación correcto

D. Confirmación en Torre
- Revisa el flujo actual de `/pwa-admin/torre/requisition-confirm`.
- Asegura que al confirmar la requisición:
  - se valide la configuración `empresa + cuenta analítica`
  - se resuelva el `picking_type_id` correcto
  - la OC/picking de recepción queden listos para el flujo posterior de recepción

E. Recepción real de Odoo
- Agrega un endpoint backend para consultar el detalle de recepción de una requisición:
  - picking ligado
  - líneas/movimientos
  - cantidad ordenada
  - cantidad recibida
  - cantidad pendiente
- Agrega un endpoint backend para recibir parcial o totalmente por línea sobre el picking real.
- No inventes un flujo paralelo ajeno a stock.

Contrato esperado para la PWA:
- Extender respuesta de requisiciones/historial con algo tipo:
  - `receipt_state`
  - `qty_received_total`
  - `qty_pending_total`
  - `can_receive`
  - `incoming_picking_id`
- Endpoint de detalle de recepción para una requisición
- Endpoint de acción de recepción parcial/total

Validaciones:
- no permitir recibir más que lo pendiente
- sí permitir recibir menos que lo pendiente
- si una línea se manda en cero, interpretar como "no recibir ahora"
- si la requisición está confirmada pero no existe picking esperable, devolver error operativo claro

UI/PWA esperada aguas abajo:
- En historial:
  - `Confirmado` + botón `Recibir producto`
  - `Parcialmente recibido` + botón `Continuar recepción`
  - `Recibido` en verde sin botón

Importante:
- Primero identifica los archivos reales a tocar.
- Sigue patrones existentes del módulo Odoo.
- No rompas el flujo actual de requisiciones/aprobación.
- Si ya existe una forma estándar en el módulo para enlazar `purchase.order` con pickings entrantes, reutilízala.
- Si hay decisiones ambiguas, prioriza compatibilidad con stock estándar de Odoo.

Entregables:
1. Implementación backend completa.
2. Resumen corto de archivos modificados y por qué.
3. Casos de prueba ejecutados.
4. Confirmación explícita de estos escenarios:
   - requisición confirmada => `Confirmado`
   - recepción parcial => `Parcialmente recibido`
   - recepción total => `Recibido`
   - resolución correcta de picking type por `empresa + cuenta analítica`
   - error claro cuando falta configuración

Casos mínimos a probar:
- Crear requisición con cuenta analítica `[IGU] Iguala`.
- Confirmarla para empresa `Fabricación de Congelados`.
- Verificar que se resuelve el picking type correcto.
- Recibir solo una parte y verificar `partially_received`.
- Recibir el resto y verificar `received`.
- Verificar que las líneas conservan `analytic_distribution`.

Si para completar el cambio necesitas exponer endpoints nuevos para la PWA, agrégalos siguiendo el patrón existente del módulo.
```
