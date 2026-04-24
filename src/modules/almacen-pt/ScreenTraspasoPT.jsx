// ScreenTraspasoPT.jsx — V2 Traspaso a CEDIS (modo puente)
// El almacenista selecciona productos del inventario real (stock.quant)
// y un CEDIS destino. Se guarda localmente hasta que backend cree stock.picking real.
// NO depende de gf.pallet. Basado en stock.quant.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getInventory,
  getEntregasDestination,
  getPendingPtTransfers,
  createTransfer,
  getPendingTransferReservationMap,
  getDaySummary,
  logTransferLocal,
  getTodayTransfers,
  fmtNum,
  fmtKg,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenTraspasoPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  const [inventory, setInventory] = useState([])
  const [destination, setDestination] = useState(null)
  const [todayTransfers, setTodayTransfers] = useState([])
  const [reservationMap, setReservationMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [blockedByHandover, setBlockedByHandover] = useState(false)

  // Form: lines to transfer
  const [lines, setLines] = useState([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [inv, destinationInfo, history] = await Promise.all([
        getInventory(warehouseId).catch((e) => { logScreenError('ScreenTraspasoPT', 'getInventory', e); return [] }),
        getEntregasDestination().catch((e) => { logScreenError('ScreenTraspasoPT', 'getEntregasDestination', e); return null }),
        getTodayTransfers(warehouseId).catch((e) => { logScreenError('ScreenTraspasoPT', 'getTodayTransfers', e); return [] }),
      ])
      const summary = await getDaySummary(warehouseId).catch((e) => {
        logScreenError('ScreenTraspasoPT', 'getDaySummary', e)
        return null
      })
      // El BFF ya dedup + filtra MP + excluye stock ≤ 0. La pantalla solo
      // consume la lista plana.
      setInventory(Array.isArray(inv) ? inv : [])
      setDestination(destinationInfo)
      setTodayTransfers(Array.isArray(history) ? history : [])
      setReservationMap(getPendingTransferReservationMap({
        warehouseId,
        destinationWarehouseId: destinationInfo?.id,
      }))
      setBlockedByHandover(Boolean(summary?.pt_blocked_by_handover))
      if (!inv.length) {
        setError('No hay inventario disponible para traspasar.')
      } else if (!destinationInfo?.id) {
        setError('No se pudo resolver el almacen destino CIGU/Existencias.')
      }
    } catch (e) {
      logScreenError('ScreenTraspasoPT', 'loadData', e)
      setError('No se pudo cargar la información. Intenta de nuevo.')
    }
    setLoading(false)
  }

  async function refreshTodayTransfers() {
    try {
      const history = await getTodayTransfers(warehouseId)
      setTodayTransfers(Array.isArray(history) ? history : [])
      setReservationMap(getPendingTransferReservationMap({
        warehouseId,
        destinationWarehouseId: destination?.id,
      }))
    } catch (e) {
      logScreenError('ScreenTraspasoPT', 'refreshTodayTransfers', e)
    }
  }

  function addLine(item) {
    if (blockedByHandover) {
      setError('PT cerrado por relevo pendiente. Acepta el turno para continuar.')
      return
    }
    const existing = lines.find(l => l.product_id === (item.product_id || item.id))
    if (existing) return
    const currentReserved = Number(reservationMap[item.product_id || item.id] || 0)
    const availableNow = Number(item.quantity || 0)
    setLines(prev => [...prev, {
      product_id: item.product_id || item.id,
      product_name: item.product || item.product_name,
      available: availableNow,
      pending_validation: currentReserved,
      stock_qty: Number(item.quantity || 0),
      weight: item.weight_per_unit || 1,
      qty: '',
    }])
  }

  function updateLineQty(productId, qty) {
    setLines(prev => prev.map(l =>
      l.product_id === productId ? { ...l, qty } : l
    ))
  }

  function removeLine(productId) {
    setLines(prev => prev.filter(l => l.product_id !== productId))
  }

  const totalQty = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)
  const totalKg = lines.reduce((s, l) => s + ((Number(l.qty) || 0) * l.weight), 0)
  const selectedCedisObj = destination?.id ? { ...destination, name: destination.name || 'CIGU/Existencias' } : null
  const employeeId = Number(session?.employee_id || session?.employee?.id || 0) || 0

  async function handleSave() {
    if (!destination?.id || lines.length === 0 || totalQty <= 0) return
    setSaving(true)
    setError('')

    const validLines = lines.filter(l => Number(l.qty) > 0).map(l => ({
      product_id: l.product_id,
      product_name: l.product_name,
      qty: Number(l.qty),
      total_kg: Number(l.qty) * l.weight,
    }))

    if (validLines.length === 0) {
      setError('Agrega al menos un producto con cantidad')
      setSaving(false)
      return
    }

    try {
      const result = await createTransfer({
        warehouse_id: warehouseId,
        cedis_id: destination.id,
        destination_warehouse_id: destination.id,
        employee_id: employeeId || undefined,
        lines: validLines.map(l => ({ product_id: l.product_id, qty: l.qty })),
        notes: `PWA PT -> Entregas ${destination.name || 'CIGU/Existencias'}`,
      })

      const pending = await getPendingPtTransfers(destination.id).catch((e) => {
        logScreenError('ScreenTraspasoPT', 'getPendingPtTransfers(after-create)', e)
        return []
      })
      const backendId = result?.picking_id || result?.id || null
      const syncState = pending.length > 0 ? 'backend_pending' : 'local_pending_only'
      if (pending.length === 0) {
        setError('Odoo no publico aun un pendiente visible para Entregas. La PWA dejara la cantidad apartada como pendiente local de validacion.')
      }

      logTransferLocal({
        backend_id: backendId,
        cedis_id: destination.id,
        destination_warehouse_id: destination.id,
        cedis_name: destination.name || 'CIGU/Existencias',
        warehouse_id: warehouseId,
        lines: validLines,
        total_qty: validLines.reduce((s, l) => s + l.qty, 0),
        total_kg: validLines.reduce((s, l) => s + l.total_kg, 0),
        employee_id: employeeId,
        employee_name: session?.name || '',
        sync_state: syncState,
        pending_validation: true,
      })
      setSuccess(
        pending.length > 0
          ? `Pendiente generado: ${validLines.length} productos -> ${destination.name || 'CIGU/Existencias'}`
          : `Reserva local creada: ${validLines.length} productos pendientes por validar en Entregas`
      )
      setLines([])
      refreshTodayTransfers()
      setTimeout(() => setSuccess(''), 4000)
    } catch (e) {
      setError(e?.message || 'Error al crear el traspaso')
    } finally {
      setSaving(false)
    }
  }

  const canSave = destination?.id && lines.some(l => Number(l.qty) > 0) && !saving && !blockedByHandover
  const inventoryView = useMemo(() => (
    inventory.map((item) => {
      const productId = item.product_id || item.id
      const pendingValidation = Number(reservationMap[productId] || 0)
      const stockQty = Number(item.quantity || 0)
      return {
        ...item,
        pending_validation: pendingValidation,
        available_to_transfer: stockQty,
      }
    })
  ), [inventory, reservationMap])
  const totalPendingValidation = useMemo(
    () => Object.values(reservationMap).reduce((sum, qty) => sum + Number(qty || 0), 0),
    [reservationMap]
  )
  const availableToAdd = inventoryView.filter(i => !lines.find(l => l.product_id === (i.product_id || i.id)) && Number(i.quantity || 0) > 0)

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        input, select { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/almacen-pt')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Transferir a almacen de entregas</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Fixed destination */}
            <div>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>DESTINO</p>
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'rgba(43,143,224,0.08)',
                border: '1px solid rgba(43,143,224,0.24)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 800 }}>
                  {destination?.name || 'CIGU/Existencias'}
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  SOLUCIONES EN PRODUCCION GLACIEM. Este destino no es editable para almacen PT.
                </p>
              </div>
            </div>

            {totalPendingValidation > 0 && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,0.24)',
              }}>
                <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 800 }}>
                  {fmtNum(totalPendingValidation)} uds pendientes por validacion en Entregas
                </p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                  Estas cantidades siguen en PT, pero estan apartadas visualmente hasta que Entregas las valide.
                </p>
              </div>
            )}

            {/* Lines to transfer */}
            {lines.length > 0 && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>PRODUCTOS A TRASPASAR</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lines.map(line => (
                    <div key={line.product_id} style={{
                      padding: '12px 14px', borderRadius: TOKENS.radius.md,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {line.product_name}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                            Disponible: {fmtNum(line.available)} · {line.weight} kg/ud
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textLow, margin: '4px 0 0' }}>
                            En PT {fmtNum(line.stock_qty || line.available)} · Pendiente {fmtNum(line.pending_validation || 0)} · Nuevo traspaso {fmtNum(line.available)}
                          </p>
                        </div>
                        <button onClick={() => removeLine(line.product_id)} style={{
                          width: 28, height: 28, borderRadius: 8,
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: TOKENS.colors.error, fontSize: 14, flexShrink: 0,
                        }}>x</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => updateLineQty(line.product_id, String(Math.max(0, (Number(line.qty) || 0) - 1)))}
                          style={btnSmall}>-</button>
                        <input type="number" inputMode="numeric" value={line.qty}
                          onChange={e => updateLineQty(line.product_id, e.target.value)}
                          placeholder="0"
                          style={{
                            flex: 1, padding: '8px', borderRadius: 10, textAlign: 'center',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'white', fontSize: 18, fontWeight: 700, outline: 'none',
                          }}
                        />
                        <button onClick={() => updateLineQty(line.product_id, String((Number(line.qty) || 0) + 1))}
                          style={btnSmall}>+</button>
                      </div>
                      {Number(line.qty) > 0 && (
                        <p style={{ ...typo.caption, color: TOKENS.colors.blue2, margin: 0, marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
                          {line.qty} × {line.weight} kg = {fmtKg(Number(line.qty) * line.weight)}
                        </p>
                      )}
                      {Number(line.qty) > line.available && (
                        <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0, marginTop: 4, textAlign: 'center' }}>
                          Excede disponible ({fmtNum(line.available)})
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add product */}
            {availableToAdd.length > 0 && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>AGREGAR PRODUCTO</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {availableToAdd.map(item => (
                    <button key={item.product_id || item.id} onClick={() => addLine(item)}
                      style={{
                        padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                      }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        + {item.product || item.product_name || ''}
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 1 }}>
                        En PT {fmtNum(item.quantity)} · Pend. {fmtNum(item.pending_validation || 0)} · Nuevo traspaso {fmtNum(item.available_to_transfer || 0)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Total summary */}
            {totalQty > 0 && destination?.id && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0 }}>
                      {lines.filter(l => Number(l.qty) > 0).length} productos {'->'} {selectedCedisObj?.name}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.success, margin: 0, fontWeight: 700 }}>{fmtNum(totalQty)} uds</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{fmtKg(totalKg)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error / Success */}
            {blockedByHandover && (
              <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: TOKENS.colors.textSoft }}>
                <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0, fontWeight: 700 }}>PT cerrado por relevo pendiente</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '4px 0 0' }}>
                  El traspaso a CEDIS queda bloqueado hasta aceptar el relevo de PT.
                </p>
                <button onClick={() => navigate('/almacen-pt/handover')} style={{
                  marginTop: 10, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.32)',
                  color: TOKENS.colors.error, fontSize: 13, fontWeight: 700,
                }}>
                  Ir a relevo PT
                </button>
              </div>
            )}
            {error && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center' }}>{error}</div>}
            {success && <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{success}</div>}

            {/* Submit */}
            <button onClick={handleSave} disabled={!canSave}
              style={{
                width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
                background: canSave ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canSave ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 700, opacity: saving ? 0.6 : 1,
                boxShadow: canSave ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
              }}>
              {saving ? 'Registrando...' : 'CONFIRMAR TRASPASO'}
            </button>

            {/* Today history (backend /api/pt/transfers/history with local fallback) */}
            {todayTransfers.length > 0 && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 8 }}>TRASPASOS DE HOY</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {todayTransfers.map(t => {
                    // Normalize backend row vs local-log row
                    const rawDate = t.date || t.date_done || t.scheduled_date || t.timestamp || null
                    const time = rawDate ? new Date(rawDate).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : ''
                    const destName = t.destination || t.cedis_name || t.partner_id?.[1] || t.name || 'Entregas'
                    const linesCount = Array.isArray(t.lines) ? t.lines.length
                                     : Array.isArray(t.move_lines) ? t.move_lines.length
                                     : Number(t.lines_count || 0)
                    const totalQty = Number(
                      t.total_qty != null ? t.total_qty
                      : t.qty_total != null ? t.qty_total
                      : (Array.isArray(t.lines) ? t.lines.reduce((s, l) => s + Number(l.qty || l.quantity || 0), 0) : 0)
                    )
                    const totalKg = Number(
                      t.total_kg != null ? t.total_kg
                      : t.kg_total != null ? t.kg_total
                      : 0
                    )
                    return (
                      <div key={t.id || `${t.name}-${rawDate}`} style={{
                        padding: '10px 14px', borderRadius: TOKENS.radius.md,
                        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <div>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>
                            → {destName}
                          </p>
                          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                            {time}{linesCount ? ` · ${linesCount} productos` : ''}
                            {t.state ? ` · ${t.state}` : ''}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {totalQty > 0 && (
                            <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 700 }}>{fmtNum(totalQty)} uds</p>
                          )}
                          {totalKg > 0 && (
                            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{fmtKg(totalKg)}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div style={{ height: 32 }} />
          </div>
        )}
      </div>
    </div>
  )
}

const btnSmall = {
  width: 40, height: 40, borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
  color: 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
}
