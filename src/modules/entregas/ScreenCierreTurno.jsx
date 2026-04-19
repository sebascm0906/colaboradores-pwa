import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { safeNumber } from '../../lib/safeNumber'
import {
  getCedisInventory, getPendingHandover,
  createShiftHandover, acceptShiftHandover,
} from './entregasService'
import { ScreenShell, ConfirmDialog } from './components'

/* ============================================================================
   ScreenCierreTurno — Entregar turno (outgoing) + Aceptar turno (incoming)
============================================================================ */

const MODES = { ACEPTAR: 'aceptar', ENTREGAR: 'entregar' }

export default function ScreenCierreTurno() {
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = Number(session?.warehouse_id || 0) || null
  const employeeId = Number(session?.employee_id || 0) || null
  const employeeName = session?.name || ''

  // ── Shared state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState(MODES.ENTREGAR)
  const [loadingInit, setLoadingInit] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // 'accept' | 'accept_diff' | 'reject' | 'entregar'
  const [submitting, setSubmitting] = useState(false)
  const [hasScrolledBottom, setHasScrolledBottom] = useState(false)
  const scrollRef = useRef(null)

  // ── Handover data (aceptar mode) ──────────────────────────────────────────
  const [handover, setHandover] = useState(null)
  const [acceptLines, setAcceptLines] = useState([])
  const [acceptNotes, setAcceptNotes] = useState('')

  // ── Inventory data (entregar mode) ────────────────────────────────────────
  const [inventory, setInventory] = useState([])
  const [entregarLines, setEntregarLines] = useState([])
  const [entregarNotes, setEntregarNotes] = useState('')

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadingInit(true)
    setError('')
    try {
      const [ho, inv] = await Promise.allSettled([
        getPendingHandover(warehouseId),
        getCedisInventory(warehouseId),
      ])

      const handoverData = ho.status === 'fulfilled' ? ho.value : null
      const invData = inv.status === 'fulfilled' && Array.isArray(inv.value) ? inv.value : []

      setHandover(handoverData)
      setInventory(invData)

      // Auto-detect mode
      if (handoverData) {
        setMode(MODES.ACEPTAR)
        // Initialize accept lines from handover (backend returns qty_system + qty_declared)
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
      }

      // Initialize entregar lines from inventory
      setEntregarLines(invData.map(item => ({
        product_id: item.product_id,
        product: item.product,
        qty_system: item.quantity || 0,
        qty_declared: item.quantity || 0,
        weight: item.weight || 1,
        note: '',
      })))
    } catch (e) {
      if (e.message !== 'no_session') setError('Error al cargar datos')
    } finally { setLoadingInit(false) }
  }, [warehouseId])

  useEffect(() => { loadData() }, [loadData])

  // ── Scroll tracking for anti-skip ─────────────────────────────────────────
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
      // Check immediately (in case content fits without scroll)
      setTimeout(checkScroll, 300)
      return () => el.removeEventListener('scroll', checkScroll)
    }
  }, [mode, loadingInit])

  // ── Aceptar mode: update a line ───────────────────────────────────────────
  function updateAcceptLine(index, field, value) {
    setAcceptLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  // ── Entregar mode: update a line ──────────────────────────────────────────
  function updateEntregarLine(index, field, value) {
    setEntregarLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l))
  }

  // ── Difference helpers ────────────────────────────────────────────────────
  function getDiffColor(diff, base) {
    if (diff === 0) return TOKENS.colors.success
    const pct = base > 0 ? Math.abs(diff) / base : 1
    if (pct > 0.05) return TOKENS.colors.error
    return TOKENS.colors.warning
  }

  // ── Validation ────────────────────────────────────────────────────────────
  function validateEntregar() {
    // Lines with >5% difference need notes
    for (const line of entregarLines) {
      const diff = line.qty_declared - line.qty_system
      const pct = line.qty_system > 0 ? Math.abs(diff) / line.qty_system : (diff !== 0 ? 1 : 0)
      if (pct > 0.05 && !line.note.trim()) {
        setError(`La linea "${line.product}" tiene diferencia mayor al 5% y requiere nota.`)
        return false
      }
    }
    return true
  }

  // ── Open confirm dialog ───────────────────────────────────────────────────
  function openConfirm(action) {
    setError('')
    if (action === 'entregar') {
      if (!validateEntregar()) return
    }
    setConfirmAction(action)
    setConfirmOpen(true)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
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
          entregarNotes.trim() || undefined
        )
        setSuccess('Turno entregado correctamente')
        setConfirmOpen(false)
        setTimeout(() => setSuccess(''), 4000)
      } else {
        // Accept / reject handover
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
        setConfirmOpen(false)
        setTimeout(() => setSuccess(''), 4000)
      }
    } catch (e) {
      setConfirmOpen(false)
      setError(e.message || 'Error al procesar turno')
    } finally { setSubmitting(false) }
  }

  // ── Computed summaries ────────────────────────────────────────────────────
  const entregarDiffCount = entregarLines.filter(l => l.qty_declared !== l.qty_system).length
  const acceptDiffCount = acceptLines.filter(l => l.qty_accepted !== (l.qty_declared ?? l.quantity ?? 0)).length

  function getConfirmMessage() {
    switch (confirmAction) {
      case 'entregar': return `Entregar turno con ${entregarLines.length} productos${entregarDiffCount > 0 ? ` (${entregarDiffCount} con diferencia)` : ''}?`
      case 'accept': return 'Aceptar turno conforme?'
      case 'accept_diff': return `Aceptar turno con ${acceptDiffCount} diferencia(s)?`
      case 'reject': return 'Disputar la entrega de turno?'
      default: return ''
    }
  }

  const canSubmitEntregar = entregarLines.length === 0 || hasScrolledBottom
  const canSubmitAcceptar = hasScrolledBottom && acceptLines.length > 0

  return (
    <ScreenShell title="Turno" backTo="/entregas">
      <style>{`
        @keyframes entregasTurnoSpin { to { transform: rotate(360deg); } }
        input, textarea { font-family: 'DM Sans', sans-serif; }
      `}</style>

      {/* ── Mode tabs ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: TOKENS.radius.md, overflow: 'hidden', border: `1px solid ${TOKENS.colors.border}` }}>
        {[
          { key: MODES.ACEPTAR, label: 'Aceptar turno', badge: handover ? 1 : 0 },
          { key: MODES.ENTREGAR, label: 'Entregar turno', badge: 0 },
        ].map(tab => {
          const active = mode === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => { setMode(tab.key); setHasScrolledBottom(false); setError(''); setSuccess('') }}
              style={{
                flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 600,
                color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                background: active ? 'rgba(43,143,224,0.12)' : TOKENS.colors.surfaceSoft,
                borderBottom: active ? `2px solid ${TOKENS.colors.blue2}` : '2px solid transparent',
                transition: `all ${TOKENS.motion.fast}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
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

      {/* Messages */}
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
      {loadingInit ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
          <div style={{
            width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)',
            borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%',
            animation: 'entregasTurnoSpin 0.8s linear infinite',
          }} />
        </div>
      ) : (
        <div ref={scrollRef} style={{ maxHeight: 'calc(100dvh - 220px)', overflowY: 'auto', paddingRight: 2 }}>

          {/* ════════════════════════════════════════════════════════════════
              MODE: ACEPTAR TURNO
          ════════════════════════════════════════════════════════════════ */}
          {mode === MODES.ACEPTAR && (
            <>
              {!handover ? (
                <div style={{ padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginTop: 20 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
                  <p style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Sin turno pendiente de aceptar</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Cambia a "Entregar turno" para iniciar tu entrega.</p>
                </div>
              ) : (
                <>
                  {/* Handover header */}
                  <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: 'rgba(43,143,224,0.08)', border: `1px solid ${TOKENS.colors.borderBlue}`, marginBottom: 14 }}>
                    <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, fontWeight: 600 }}>
                      Entrega de {handover.shift_out_employee || handover.employee_name || 'Empleado'}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                      {handover.name ? `${handover.name} \u00B7 ` : ''}{handover.submitted_at || handover.create_date || handover.date || ''}
                    </p>
                    {handover.notes_out && (
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: '6px 0 0', fontStyle: 'italic' }}>
                        "{handover.notes_out}"
                      </p>
                    )}
                  </div>

                  {/* Accept lines */}
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
                            {/* Declared (readonly) */}
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Declarado</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.textMuted, margin: 0 }}>{declared}</p>
                            </div>
                            {/* Accepted (editable) */}
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Aceptado</p>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={line.qty_accepted}
                                onChange={e => updateAcceptLine(i, 'qty_accepted', safeNumber(e.target.value, { min: 0 }))}
                                style={{
                                  width: '100%', padding: '6px 8px', borderRadius: TOKENS.radius.sm,
                                  background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)',
                                  color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                                }}
                              />
                            </div>
                            {/* Difference */}
                            <div style={{ flex: 1, textAlign: 'right' }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Dif.</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: diffColor, margin: 0 }}>
                                {diff > 0 ? '+' : ''}{diff}
                              </p>
                            </div>
                          </div>
                          {/* Note when difference */}
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

                  {/* General observations */}
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

                  {/* Summary */}
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

                  {/* Action buttons */}
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

          {/* ════════════════════════════════════════════════════════════════
              MODE: ENTREGAR TURNO
          ════════════════════════════════════════════════════════════════ */}
          {mode === MODES.ENTREGAR && (
            <>
              {entregarLines.length === 0 && (
                <div style={{ padding: 14, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginBottom: 12 }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0 }}>Sin inventario en sistema. Puedes entregar un turno vacio para inicializar el ciclo.</p>
                </div>
              )}
              {/* Product lines */}
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
                            {/* System qty (readonly) */}
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sistema</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.textMuted, margin: 0 }}>{line.qty_system}</p>
                            </div>
                            {/* Declared qty (editable) */}
                            <div style={{ flex: 1 }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Conteo</p>
                              <input
                                type="number"
                                inputMode="decimal"
                                value={line.qty_declared}
                                onChange={e => updateEntregarLine(i, 'qty_declared', safeNumber(e.target.value, { min: 0 }))}
                                style={{
                                  width: '100%', padding: '6px 8px', borderRadius: TOKENS.radius.sm,
                                  background: 'rgba(43,143,224,0.08)', border: '1px solid rgba(43,143,224,0.15)',
                                  color: 'white', fontSize: 16, fontWeight: 700, outline: 'none', textAlign: 'center',
                                }}
                              />
                            </div>
                            {/* Difference */}
                            <div style={{ flex: 1, textAlign: 'right' }}>
                              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Dif.</p>
                              <p style={{ fontSize: 16, fontWeight: 700, color: diffColor, margin: 0 }}>
                                {diff > 0 ? '+' : ''}{diff}
                              </p>
                            </div>
                          </div>
                          {/* Note for lines with significant difference */}
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

                  {/* General observations */}
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

                  {/* Summary */}
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

                  {/* Submit */}
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
                    {submitting ? 'Procesando...' : 'Entregar Turno'}
                  </button>

              {!hasScrolledBottom && entregarLines.length > 3 && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 10 }}>
                  Revisa todos los productos para habilitar la entrega
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Confirm dialog ─────────────────────────────────────────────── */}
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
