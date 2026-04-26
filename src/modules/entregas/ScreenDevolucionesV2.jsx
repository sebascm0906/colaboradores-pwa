import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { safeNumber } from '../../lib/safeNumber'
import { getReturns, acceptReturn } from './entregasService'
import { ScreenShell, StatusBadge } from './components'

/* ============================================================================
   ScreenDevolucionesV2 — Returns grouped by route, with accept action
   Backend: gf_logistics_ops extends gf.route.stop.line with reception fields:
   received_by_id, received_at, received_qty, reception_state, reception_notes
============================================================================ */

export default function ScreenDevolucionesV2() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = Number(session?.warehouse_id || 0) || null
  const employeeId = Number(session?.employee_id || 0) || null

  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [expandedRoutes, setExpandedRoutes] = useState({})
  const [submitting, setSubmitting] = useState(null) // track which line is submitting

  // Per-line editable state: { [lineId]: { received_qty, notes } }
  const [lineEdits, setLineEdits] = useState({})

  useEffect(() => {
    loadReturns()
  }, [])

  async function loadReturns() {
    setLoading(true)
    setError('')
    try {
      const r = await getReturns(warehouseId)
      setReturns(r || [])
      // Auto-expand all groups initially
      const groups = groupByRoute(r || [])
      const expanded = {}
      Object.keys(groups).forEach(k => { expanded[k] = true })
      setExpandedRoutes(expanded)
      // Initialize editable state for pending lines
      const edits = {}
      ;(r || []).forEach(item => {
        if (item.state !== 'done') {
          edits[item.id] = {
            received_qty: item.quantity ?? 0,
            notes: '',
          }
        }
      })
      setLineEdits(edits)
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar devoluciones')
      setReturns([])
    } finally { setLoading(false) }
  }

  function groupByRoute(items) {
    const groups = {}
    items.forEach(item => {
      const key = item.route_plan_id || item.route || 'sin_ruta'
      if (!groups[key]) {
        groups[key] = {
          routeName: item.route || 'Sin ruta asignada',
          driver: item.driver || 'Sin chofer',
          items: [],
        }
      }
      groups[key].items.push(item)
    })
    return groups
  }

  function toggleRoute(key) {
    setExpandedRoutes(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function updateLineEdit(lineId, field, value) {
    setLineEdits(prev => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }))
  }

  async function handleConfirmReturn(ret) {
    const edit = lineEdits[ret.id] || { received_qty: ret.quantity, notes: '' }
    const diff = Math.abs(edit.received_qty - ret.quantity)

    // Validate: notes required if qty differs
    if (diff > 0 && !edit.notes.trim()) {
      setError(`Nota requerida: cantidad recibida (${edit.received_qty}) difiere de la original (${ret.quantity})`)
      return
    }

    setSubmitting(ret.id)
    setError('')
    setSuccess('')
    try {
      // BLD-20260426-P0-DEVOL: defensa contra falso éxito.
      // Backend (gf_logistics_ops) responde con HTTP 200 + {ok:false, message}
      // ante errores de negocio (plan inexistente, línea ya recibida, etc.).
      // Antes el code solo manejaba try/catch, así que un response ok:false
      // pasaba como éxito y se mostraba "Devolucion confirmada" en verde
      // sin que la devolución quedara registrada en Odoo. Mismo bug que ya
      // arreglamos en mostrador (PR #21). Aquí lo replicamos con el mismo
      // patrón mínimo.
      const result = await acceptReturn(
        [ret.id],
        [{
          stop_line_id: ret.id,
          received_qty: Number(edit.received_qty),
          notes: edit.notes.trim() || '',
        }],
        employeeId,
        warehouseId
      )
      if (result && result.ok === false) {
        setError(result.message || 'Backend rechazó la devolución')
        return // NO success, NO reload — el operador debe corregir y reintentar
      }
      setSuccess('Devolucion confirmada')
      setTimeout(() => setSuccess(''), 3000)
      // Reload
      await loadReturns()
    } catch (e) {
      setError(e.message || 'Error al confirmar devolucion')
    } finally { setSubmitting(null) }
  }

  const grouped = groupByRoute(returns)
  const pendingCount = returns.filter(r => r.state !== 'done').length
  const doneCount = returns.filter(r => r.state === 'done').length

  return (
    <ScreenShell title="Devoluciones" backTo="/entregas">
      <style>{`@keyframes entregasDevSpin { to { transform: rotate(360deg); } }`}</style>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.warningSoft, border: '1px solid rgba(245,158,11,0.18)', textAlign: 'center' }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0, fontWeight: 700 }}>{pendingCount}</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Pendientes</p>
        </div>
        <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.18)', textAlign: 'center' }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 700 }}>{doneCount}</p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Procesadas</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {/* Success */}
      {success && (
        <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
          {success}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'entregasDevSpin 0.8s linear infinite',
          }} />
        </div>
      ) : returns.length === 0 ? (
        <div style={{ marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
          <p style={{ ...typo.title, color: TOKENS.colors.success }}>Sin devoluciones pendientes</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(grouped).map(([key, group]) => {
            const isExpanded = expandedRoutes[key] !== false
            return (
              <div key={key} style={{ borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, overflow: 'hidden' }}>
                {/* Route header — collapsible */}
                <button
                  onClick={() => toggleRoute(key)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', textAlign: 'left',
                    background: 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{group.routeName}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{group.driver}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: TOKENS.radius.pill,
                      background: 'rgba(43,143,224,0.12)', fontSize: 11, fontWeight: 700, color: TOKENS.colors.blue2,
                    }}>
                      {group.items.length}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${TOKENS.motion.fast}` }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </button>

                {/* Return items */}
                {isExpanded && (
                  <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.items.map((ret, i) => {
                      const isScrap = ret.line_type === 'scrap'
                      const isDone = ret.state === 'done'
                      const edit = lineEdits[ret.id]
                      const qtyDiff = edit ? edit.received_qty - ret.quantity : 0
                      const hasDiff = qtyDiff !== 0
                      const isSubmittingThis = submitting === ret.id

                      return (
                        <div key={ret.id || i} style={{
                          padding: '12px 14px', borderRadius: TOKENS.radius.md,
                          background: isDone ? 'rgba(34,197,94,0.04)' : TOKENS.colors.surfaceSoft,
                          border: `1px solid ${isDone ? 'rgba(34,197,94,0.15)' : TOKENS.colors.border}`,
                        }}>
                          {/* Product header */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{ret.product || 'Producto'}</p>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                                Original: {ret.quantity ?? 0} {ret.reason ? `\u00B7 ${ret.reason}` : ''}
                              </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <span style={{
                                padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                                background: isScrap ? TOKENS.colors.warningSoft : 'rgba(43,143,224,0.12)',
                                fontSize: 10, fontWeight: 700,
                                color: isScrap ? TOKENS.colors.warning : TOKENS.colors.blue2,
                              }}>
                                {isScrap ? 'MERMA' : 'DEVOLUCION'}
                              </span>
                              <StatusBadge status={isDone ? 'done' : 'pending'} />
                            </div>
                          </div>

                          {/* Already processed: show reception info */}
                          {isDone && (
                            <div style={{ padding: '8px 10px', borderRadius: TOKENS.radius.sm, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.success, margin: 0, fontWeight: 600 }}>
                                Recibido: {ret.received_qty ?? ret.quantity}
                                {ret.received_by ? ` por ${ret.received_by}` : ''}
                              </p>
                              {ret.reception_notes && (
                                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{ret.reception_notes}</p>
                              )}
                            </div>
                          )}

                          {/* Pending: editable receive form */}
                          {!isDone && edit && (
                            <>
                              {/* Received qty input */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <div style={{ flex: 1 }}>
                                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px' }}>Cantidad recibida</p>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={edit.received_qty}
                                    onChange={e => updateLineEdit(ret.id, 'received_qty', safeNumber(e.target.value, { min: 0 }))}
                                    style={{
                                      width: '100%', padding: '8px 10px', borderRadius: TOKENS.radius.sm,
                                      background: 'rgba(43,143,224,0.08)', border: `1px solid ${hasDiff ? TOKENS.colors.warning : 'rgba(43,143,224,0.15)'}`,
                                      color: 'white', fontSize: 15, fontWeight: 700, outline: 'none', textAlign: 'center',
                                    }}
                                  />
                                </div>
                                {hasDiff && (
                                  <div style={{ textAlign: 'center', minWidth: 60 }}>
                                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 4px' }}>Dif.</p>
                                    <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: TOKENS.colors.warning }}>
                                      {qtyDiff > 0 ? '+' : ''}{qtyDiff}
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Notes — required if diff, optional otherwise */}
                              {hasDiff && (
                                <input
                                  type="text"
                                  value={edit.notes}
                                  onChange={e => updateLineEdit(ret.id, 'notes', e.target.value)}
                                  placeholder="Nota requerida (cantidad difiere)..."
                                  style={{
                                    width: '100%', padding: '8px 10px', marginBottom: 8,
                                    borderRadius: TOKENS.radius.sm,
                                    background: 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${!edit.notes.trim() ? TOKENS.colors.error : TOKENS.colors.border}`,
                                    color: 'white', fontSize: 13, outline: 'none',
                                  }}
                                />
                              )}

                              {/* Action button */}
                              <button
                                onClick={() => handleConfirmReturn(ret)}
                                disabled={isSubmittingThis}
                                style={{
                                  width: '100%', padding: '10px 0', borderRadius: TOKENS.radius.md,
                                  background: isSubmittingThis ? TOKENS.colors.surface : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                                  color: 'white', fontSize: 13, fontWeight: 600,
                                  opacity: isSubmittingThis ? 0.6 : 1,
                                }}
                              >
                                {isSubmittingThis ? 'Procesando...' : 'Confirmar Recepcion'}
                              </button>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </ScreenShell>
  )
}
