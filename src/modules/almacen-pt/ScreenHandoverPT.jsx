// ScreenHandoverPT.jsx — Entrega / Aceptar turno Almacén PT
// Reutiliza el modelo gf.shift.handover (Sebastián commit a3f58c0).
// Fuente de inventario: stock.quant vía ptService.getInventory().

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getInventory,
  getPendingHandover,
  createShiftHandover,
  acceptShiftHandover,
  getEligibleReceivers,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'
import { ScreenShell, ConfirmDialog } from '../entregas/components'

const MODES = { ACEPTAR: 'aceptar', ENTREGAR: 'entregar' }

export default function ScreenHandoverPT() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID
  const employeeId = session?.employee_id || 0

  const [mode, setMode] = useState(MODES.ENTREGAR)
  const [loadingInit, setLoadingInit] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [hasScrolledBottom, setHasScrolledBottom] = useState(false)
  const scrollRef = useRef(null)

  const [handover, setHandover] = useState(null)
  const [acceptLines, setAcceptLines] = useState([])
  const [acceptNotes, setAcceptNotes] = useState('')

  const [entregarLines, setEntregarLines] = useState([])
  const [entregarNotes, setEntregarNotes] = useState('')
  // Backend exige shift_in_employee_id (a quien le entrego). Sin esto el
  // POST /shift_handover/create responde "shift_in_employee_id es obligatorio."
  const [shiftInEmployeeId, setShiftInEmployeeId] = useState(0)
  const [eligibleReceivers, setEligibleReceivers] = useState([])
  const [loadingReceivers, setLoadingReceivers] = useState(false)

  const isRequiredPostClose = Boolean(handover?.required_after_supervisor_close)
  const countSubmitted = Boolean(handover?.count_submitted)
  const warehouseBlocked = Boolean(handover?.warehouse_blocked)

  const loadData = useCallback(async () => {
    setLoadingInit(true)
    setError('')
    try {
      const [ho, inv] = await Promise.allSettled([
        getPendingHandover(warehouseId),
        getInventory(warehouseId),
      ])

      const handoverData = ho.status === 'fulfilled' ? ho.value : null
      const invData = inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []

      setHandover(handoverData)

      if (handoverData) {
        const requiredPostClose = Boolean(handoverData?.required_after_supervisor_close)
        const submitted = Boolean(handoverData?.count_submitted)
        setMode(requiredPostClose && !submitted ? MODES.ENTREGAR : MODES.ACEPTAR)
        setAcceptLines((handoverData.lines || []).map(line => ({
          ...line,
          product: line.product || line.product_id?.[1] || '',
          product_id: line.product_id?.[0] || line.product_id || 0,
          qty_declared: line.qty_declared ?? line.quantity ?? 0,
          qty_system: line.qty_system ?? 0,
          qty_accepted: line.qty_declared ?? line.quantity ?? 0,
          note: '',
        })))
      } else {
        setMode(MODES.ENTREGAR)
        setAcceptLines([])
      }

      // Inventory → entregar lines. El BFF ya dedup por product_id y excluye
      // MP, así que la pantalla sólo mapea al shape que consume el form.
      setEntregarLines(invData.map((item) => ({
        product_id: item.product_id,
        product: item.product_name,
        qty_system: Number(item.quantity) || 0,
        qty_declared: Number(item.quantity) || 0,
        weight: Number(item.weight_per_unit) || 1,
        note: '',
      })))
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos')
    } finally { setLoadingInit(false) }
  }, [warehouseId])

  useEffect(() => { loadData() }, [loadData])

  // Cargar empleados elegibles para recibir (mismo warehouse, otros almacenistas PT).
  useEffect(() => {
    if (!warehouseId || !employeeId) return
    let cancelled = false
    setLoadingReceivers(true)
    getEligibleReceivers(warehouseId, employeeId)
      .then((list) => {
        if (cancelled) return
        setEligibleReceivers(list)
        if (list.length === 1) setShiftInEmployeeId(list[0].id)
      })
      .finally(() => { if (!cancelled) setLoadingReceivers(false) })
    return () => { cancelled = true }
  }, [warehouseId, employeeId])

  useEffect(() => {
    function checkScroll() {
      const el = scrollRef.current
      if (!el) return
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      if (atBottom) setHasScrolledBottom(true)
    }
    const el = scrollRef.current
    if (el) {
      el.addEventListener('scroll', checkScroll)
      setTimeout(checkScroll, 300)
      return () => el.removeEventListener('scroll', checkScroll)
    }
  }, [mode, loadingInit])

  function updateAcceptLine(index, field, value) {
    setAcceptLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  function updateEntregarLine(index, field, value) {
    setEntregarLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  function getDiffColor(diff, base) {
    if (diff === 0) return TOKENS.colors.success
    const pct = base > 0 ? Math.abs(diff) / base : 1
    if (pct > 0.05) return TOKENS.colors.error
    return TOKENS.colors.warning
  }

  function validateEntregar() {
    if (!shiftInEmployeeId) {
      setError('Selecciona al almacenista entrante a quien entregas el turno.')
      return false
    }
    if (shiftInEmployeeId === employeeId) {
      setError('No puedes entregar el turno a ti mismo.')
      return false
    }
    for (const line of entregarLines) {
      const diff = line.qty_declared - line.qty_system
      const pct = line.qty_system > 0 ? Math.abs(diff) / line.qty_system : (diff !== 0 ? 1 : 0)
      if (pct > 0.05 && !line.note.trim()) {
        setError(`La línea "${line.product}" tiene diferencia mayor al 5% y requiere nota.`)
        return false
      }
    }
    return true
  }

  function openConfirm(action) {
    setError('')
    if (action === 'entregar' && !validateEntregar()) return
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')
    try {
      if (confirmAction === 'entregar') {
        await createShiftHandover(
          warehouseId,
          employeeId,
          entregarLines.map(l => ({
            product_id: l.product_id,
            qty_system: l.qty_system,
            qty_declared: l.qty_declared,
            note: l.note || undefined,
          })),
          entregarNotes.trim() || undefined,
          {
            ...(handover?.id ? {
              handover_id: handover.id,
              required_after_supervisor_close: isRequiredPostClose,
            } : {}),
            shift_in_employee_id: shiftInEmployeeId,
          }
        )
        setSuccess(
          isRequiredPostClose
            ? 'Conteo PT entregado. Queda pendiente la aceptación del siguiente almacenista.'
            : 'Turno entregado correctamente'
        )
      } else {
        const actionStr = confirmAction === 'reject' ? 'reject' : 'accept'
        await acceptShiftHandover(
          handover.id,
          employeeId,
          acceptLines.map(l => ({
            line_id: l.id || l.line_id,
            product_id: l.product_id,
            qty_accepted: l.qty_accepted,
            notes: l.note || undefined,
          })),
          acceptNotes.trim() || undefined,
          actionStr
        )
        setSuccess(actionStr === 'accept' ? 'Turno aceptado correctamente' : 'Turno disputado')
      }
      setConfirmOpen(false)
      setTimeout(() => { setSuccess(''); loadData() }, 2000)
    } catch (e) {
      setConfirmOpen(false)
      setError(e.message || 'Error al procesar turno')
    } finally { setSubmitting(false) }
  }

  const entregarDiffCount = entregarLines.filter(l => l.qty_declared !== l.qty_system).length
  const acceptDiffCount = acceptLines.filter(l => l.qty_accepted !== (l.qty_declared ?? l.quantity ?? 0)).length

  function getConfirmMessage() {
    switch (confirmAction) {
      case 'entregar':
        return isRequiredPostClose
          ? `¿Confirmar conteo total de PT con ${entregarLines.length} productos${entregarDiffCount > 0 ? ` (${entregarDiffCount} con diferencia)` : ''}?`
          : `¿Entregar turno con ${entregarLines.length} productos${entregarDiffCount > 0 ? ` (${entregarDiffCount} con diferencia)` : ''}?`
      case 'accept': return '¿Aceptar turno conforme?'
      case 'accept_diff': return `¿Aceptar turno con ${acceptDiffCount} diferencia(s)?`
      case 'reject': return '¿Disputar la entrega de turno?'
      default: return ''
    }
  }

  const canSubmitEntregar = hasScrolledBottom && entregarLines.length > 0
  const canSubmitAcceptar = hasScrolledBottom && acceptLines.length > 0

  return (
    <ScreenShell title="Entrega de Turno PT" backTo="/almacen-pt">
      <style>{`
        @keyframes ptTurnoSpin { to { transform: rotate(360deg); } }
        input, textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: TOKENS.radius.md, overflow: 'hidden', border: `1px solid ${TOKENS.colors.border}` }}>
        {[
          { key: MODES.ACEPTAR, label: 'Aceptar turno', badge: handover ? 1 : 0 },
          { key: MODES.ENTREGAR, label: 'Entregar turno', badge: 0 },
        ].map(tab => {
          const active = mode === tab.key
          const disabled = isRequiredPostClose
            ? (!countSubmitted && tab.key === MODES.ACEPTAR) || (countSubmitted && tab.key === MODES.ENTREGAR)
            : false
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (disabled) return
                setMode(tab.key)
                setHasScrolledBottom(false)
                setError('')
                setSuccess('')
              }}
              disabled={disabled}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 600,
                color: disabled ? TOKENS.colors.textLow : active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                background: active ? 'rgba(43,143,224,0.12)' : TOKENS.colors.surfaceSoft,
                borderBottom: active ? `2px solid ${TOKENS.colors.blue2}` : '2px solid transparent',
                transition: `all ${TOKENS.motion.fast}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                opacity: disabled ? 0.55 : 1,
              }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: TOKENS.colors.error, color: 'white',
                  fontSize: 10, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {error && (
        <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)', color: TOKENS.colors.error, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.successSoft, border: '1px solid rgba(34,197,94,0.25)', color: TOKENS.colors.success, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>
          {success}
        </div>
      )}
      {isRequiredPostClose && (
        <div style={{
          padding: 14,
          borderRadius: TOKENS.radius.lg,
          background: warehouseBlocked ? 'rgba(239,68,68,0.10)' : 'rgba(43,143,224,0.10)',
          border: `1px solid ${warehouseBlocked ? 'rgba(239,68,68,0.35)' : TOKENS.colors.borderBlue}`,
          marginBottom: 14,
        }}>
          <p style={{ ...typo.body, color: warehouseBlocked ? TOKENS.colors.error : TOKENS.colors.blue2, margin: 0, fontWeight: 700 }}>
            {countSubmitted ? 'PT cerrado por relevo pendiente de aceptación' : 'Conteo total obligatorio de PT'}
          </p>
          <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '4px 0 0' }}>
            {countSubmitted
              ? 'Otro almacenista PT debe aceptar este relevo para reabrir movimientos.'
              : 'Este handover fue generado por el cierre del supervisor. Captura el conteo total para dejarlo listo para aceptación.'}
          </p>
        </div>
      )}

      {loadingInit ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'ptTurnoSpin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <div ref={scrollRef} style={{ maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto', paddingRight: 2 }}>

          {mode === MODES.ACEPTAR && (
            <>
              {!handover ? (
                <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginTop: 20 }}>
                  <p style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Sin turno pendiente de aceptar</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Cambia a "Entregar turno" para iniciar tu entrega.</p>
                </div>
              ) : (
                <>
                  <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: 'rgba(43,143,224,0.08)', border: `1px solid ${TOKENS.colors.borderBlue}`, marginBottom: 14 }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>
                      Entrega de {handover.shift_out_employee || handover.employee_name || 'Empleado'}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                      {handover.name ? `${handover.name} · ` : ''}{handover.submitted_at || handover.create_date || handover.date || ''}
                    </p>
                    {handover.source_shift_id && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                        Turno supervisor origen: #{handover.source_shift_id}
                      </p>
                    )}
                    {handover.notes_out && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '6px 0 0', fontStyle: 'italic' }}>
                        "{handover.notes_out}"
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {acceptLines.map((line, i) => {
                      const declared = line.qty_declared ?? line.quantity ?? 0
                      const diff = line.qty_accepted - declared
                      const diffColor = getDiffColor(diff, declared)
                      return (
                        <div key={line.product_id || i} style={{
                          padding: '12px 14px', borderRadius: TOKENS.radius.md,
                          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>{line.product || 'Producto'}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Declarado</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.textMuted, margin: 0 }}>{declared}</p>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Aceptado</p>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={line.qty_accepted}
                                onChange={e => updateAcceptLine(i, 'qty_accepted', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '100%', padding: '6px 8px', borderRadius: TOKENS.radius.sm,
                                  background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)',
                                  color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                                }}
                              />
                            </div>
                            <div style={{ flex: 1, textAlign: 'right' }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Dif.</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: diffColor, margin: 0 }}>
                                {diff > 0 ? '+' : ''}{diff}
                              </p>
                            </div>
                          </div>
                          {diff !== 0 && (
                            <input
                              type="text"
                              value={line.note}
                              onChange={e => updateAcceptLine(i, 'note', e.target.value)}
                              placeholder="Nota sobre diferencia..."
                              style={{
                                width: '100%', padding: '8px 10px', marginTop: 8,
                                borderRadius: TOKENS.radius.sm,
                                background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                                color: 'white', fontSize: 13, outline: 'none',
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Observaciones generales</p>
                    <textarea
                      value={acceptNotes}
                      onChange={e => setAcceptNotes(e.target.value)}
                      placeholder="Observaciones..."
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Productos</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{acceptLines.length}</p>
                    </div>
                    <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: acceptDiffCount > 0 ? TOKENS.colors.warningSoft : TOKENS.colors.successSoft, border: `1px solid ${acceptDiffCount > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,197,94,0.18)'}`, textAlign: 'center' }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Con diferencia</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: acceptDiffCount > 0 ? TOKENS.colors.warning : TOKENS.colors.success, margin: 0 }}>{acceptDiffCount}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => openConfirm(acceptDiffCount > 0 ? 'accept_diff' : 'accept')}
                      disabled={!canSubmitAcceptar || submitting}
                      style={{
                        width: '100%', padding: 14, borderRadius: TOKENS.radius.lg,
                        background: canSubmitAcceptar ? 'linear-gradient(90deg, #22c55e, #16a34a)' : TOKENS.colors.surface,
                        color: canSubmitAcceptar ? 'white' : TOKENS.colors.textMuted,
                        fontSize: 15, fontWeight: 600, opacity: submitting ? 0.6 : 1,
                        boxShadow: canSubmitAcceptar ? '0 10px 24px rgba(34,197,94,0.25)' : 'none',
                      }}
                    >
                      {acceptDiffCount > 0 ? 'Acepto con diferencias' : 'Acepto conforme'}
                    </button>
                    <button
                      onClick={() => openConfirm('reject')}
                      disabled={!canSubmitAcceptar || submitting}
                      style={{
                        width: '100%', padding: 14, borderRadius: TOKENS.radius.lg,
                        background: canSubmitAcceptar ? TOKENS.colors.errorSoft : TOKENS.colors.surface,
                        border: `1px solid ${canSubmitAcceptar ? 'rgba(239,68,68,0.3)' : TOKENS.colors.border}`,
                        color: canSubmitAcceptar ? TOKENS.colors.error : TOKENS.colors.textMuted,
                        fontSize: 14, fontWeight: 600,
                      }}
                    >
                      Disputo
                    </button>
                  </div>

                  {!hasScrolledBottom && acceptLines.length > 3 && (
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 10 }}>
                      Revisa todos los productos para habilitar las acciones
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {mode === MODES.ENTREGAR && (
            <>
              {/* Selector empleado entrante: backend exige shift_in_employee_id */}
              <div style={{ marginBottom: 14, marginTop: 4 }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>
                  Entregar turno a
                </p>
                {loadingReceivers ? (
                  <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, color: TOKENS.colors.textMuted, fontSize: 13 }}>
                    Cargando almacenistas disponibles…
                  </div>
                ) : eligibleReceivers.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: TOKENS.radius.md, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', color: TOKENS.colors.warning, fontSize: 13 }}>
                    No hay otros almacenistas PT en este almacén para recibir el turno.
                    Contacta a tu supervisor.
                  </div>
                ) : (
                  <select
                    value={shiftInEmployeeId || ''}
                    onChange={(e) => setShiftInEmployeeId(Number(e.target.value) || 0)}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 14, outline: 'none',
                      fontFamily: 'DM Sans, sans-serif',
                    }}
                  >
                    <option value="">— Selecciona compañero —</option>
                    {eligibleReceivers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}{r.barcode ? ` (${r.barcode})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {entregarLines.length === 0 ? (
                <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginTop: 20 }}>
                  <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>
                    {isRequiredPostClose ? 'No hay inventario PT disponible para el conteo' : 'Sin inventario para entregar'}
                  </p>
                </div>
              ) : (
                <>
                  {isRequiredPostClose && (
                    <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', marginBottom: 14 }}>
                      <p style={{ ...typo.body, color: TOKENS.colors.warning, margin: 0, fontWeight: 700 }}>
                        Captura obligatoria antes de reabrir PT
                      </p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '4px 0 0' }}>
                        Revisa todas las líneas del inventario. Si hay diferencias mayores al 5%, agrega nota.
                      </p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {entregarLines.map((line, i) => {
                      const diff = line.qty_declared - line.qty_system
                      const pct = line.qty_system > 0 ? Math.abs(diff) / line.qty_system : (diff !== 0 ? 1 : 0)
                      const diffColor = getDiffColor(diff, line.qty_system)
                      const needsNote = pct > 0.05
                      return (
                        <div key={line.product_id || i} style={{
                          padding: '12px 14px', borderRadius: TOKENS.radius.md,
                          background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        }}>
                          <p style={{ ...typo.caption, color: TOKENS.colors.text, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {line.product}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sistema</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.textMuted, margin: 0 }}>{line.qty_system}</p>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Conteo</p>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={line.qty_declared}
                                onChange={e => updateEntregarLine(i, 'qty_declared', parseFloat(e.target.value) || 0)}
                                style={{
                                  width: '100%', padding: '6px 8px', borderRadius: TOKENS.radius.sm,
                                  background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)',
                                  color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                                }}
                              />
                            </div>
                            <div style={{ flex: 1, textAlign: 'right' }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Dif.</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: diffColor, margin: 0 }}>
                                {diff > 0 ? '+' : ''}{diff}
                              </p>
                            </div>
                          </div>
                          {diff !== 0 && (
                            <input
                              type="text"
                              value={line.note}
                              onChange={e => updateEntregarLine(i, 'note', e.target.value)}
                              placeholder={needsNote ? 'Nota requerida (dif > 5%)...' : 'Nota (opcional)...'}
                              style={{
                                width: '100%', padding: '8px 10px', marginTop: 8,
                                borderRadius: TOKENS.radius.sm,
                                background: 'rgba(255,255,255,0.05)',
                                border: `1px solid ${needsNote && !line.note.trim() ? TOKENS.colors.error : TOKENS.colors.border}`,
                                color: 'white', fontSize: 13, outline: 'none',
                              }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '0 0 6px', fontWeight: 600 }}>Observaciones generales</p>
                    <textarea
                      value={entregarNotes}
                      onChange={e => setEntregarNotes(e.target.value)}
                      placeholder="Observaciones..."
                      rows={3}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
                        background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                        color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Productos</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{entregarLines.length}</p>
                    </div>
                    <div style={{ flex: 1, padding: 10, borderRadius: TOKENS.radius.md, background: entregarDiffCount > 0 ? TOKENS.colors.warningSoft : TOKENS.colors.successSoft, border: `1px solid ${entregarDiffCount > 0 ? 'rgba(245,158,11,0.18)' : 'rgba(34,197,94,0.18)'}`, textAlign: 'center' }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Con diferencia</p>
                      <p style={{ fontSize: 18, fontWeight: 700, color: entregarDiffCount > 0 ? TOKENS.colors.warning : TOKENS.colors.success, margin: 0 }}>{entregarDiffCount}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => openConfirm('entregar')}
                    disabled={!canSubmitEntregar || submitting}
                    style={{
                      width: '100%', padding: 14, borderRadius: TOKENS.radius.lg,
                      background: canSubmitEntregar ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                      color: canSubmitEntregar ? 'white' : TOKENS.colors.textMuted,
                      fontSize: 15, fontWeight: 600, opacity: submitting ? 0.6 : 1,
                      boxShadow: canSubmitEntregar ? '0 10px 24px rgba(43,143,224,0.25)' : 'none',
                    }}
                  >
                    {submitting ? 'Procesando...' : isRequiredPostClose ? 'Confirmar Conteo Total' : 'Entregar Turno'}
                  </button>

                  {!hasScrolledBottom && entregarLines.length > 3 && (
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 10 }}>
                      Revisa todos los productos para habilitar la entrega
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmAction === 'reject' ? 'Disputar turno' : confirmAction === 'entregar' ? 'Entregar turno' : 'Aceptar turno'}
        message={getConfirmMessage()}
        confirmLabel={confirmAction === 'reject' ? 'Disputar' : confirmAction === 'entregar' ? 'Entregar' : 'Aceptar'}
        variant={confirmAction === 'reject' ? 'danger' : 'default'}
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
        loading={submitting}
      />
    </ScreenShell>
  )
}
