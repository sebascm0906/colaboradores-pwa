// ─── AdminCierreForm — Cierre del día V2 (desktop) ──────────────────────────
// Backend:
//   GET  /pwa-admin/cash-closing         → read-only summary del día
//   POST /pwa-admin/cash-closing         → arqueo formal (Sprint 3, Sebastián)
//
// Flujo:
//   1. Lee el summary del día (ventas/gastos computados por backend)
//   2. Usuario ingresa fondo inicial + conteo por denominación MXN
//   3. Muestra en vivo: physical_total, expected_total, diferencia
//   4. Botón "Cerrar día" confirma y dispara POST (bloquea edición)
//
// Mobile legacy sigue en ScreenCierreCaja.jsx.
import { useEffect, useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import {
  getCashClosing,
  getCashClosingHistory,
  getCashClosingDetail,
} from '../api'
import {
  createCashClosing,
  CASH_DENOMINATIONS,
  BACKEND_CAPS,
} from '../adminService'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function emptyCounts() {
  const out = {}
  for (const d of CASH_DENOMINATIONS) out[d.key] = 0
  return out
}

export default function AdminCierreForm() {
  const { companyId, companyLabel, warehouseId, sucursal, employeeName } = useAdmin()

  const [view, setView] = useState('today') // 'today' | 'history'
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [openingFund, setOpeningFund] = useState('')
  const [counts, setCounts] = useState(() => emptyCounts())
  const [otherIncome, setOtherIncome] = useState('')
  const [otherExpense, setOtherExpense] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [closedState, setClosedState] = useState(null) // state === 'closed' si ya se cerró

  // ── Carga del summary ─────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      if (!companyId || !warehouseId) return
      setLoading(true)
      setError('')
      setSuccess('')
      setClosedState(null)
      try {
        const res = await getCashClosing({ companyId, warehouseId })
        const data = res?.data ?? res
        if (alive) {
          setSummary(data || null)
          // Si el backend ya devolvió un closing existente (state=closed) del día,
          // prefill + bloqueo de edición
          if (data?.state === 'closed') {
            setClosedState('closed')
            setOpeningFund(String(data.opening_fund ?? ''))
            if (Array.isArray(data.denominations)) {
              const next = emptyCounts()
              for (const d of data.denominations) {
                if (d?.denomination != null) next[String(d.denomination)] = Number(d.count || 0)
              }
              setCounts(next)
            }
            setOtherIncome(String(data.other_income ?? ''))
            setOtherExpense(String(data.other_expense ?? ''))
            setNotes(data.notes || '')
          }
        }
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar resumen del día')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [companyId, warehouseId])

  // Reset cuando cambia company/warehouse (si no está cerrado)
  useEffect(() => {
    if (closedState === 'closed') return
    setOpeningFund('')
    setCounts(emptyCounts())
    setOtherIncome('')
    setOtherExpense('')
    setNotes('')
    setConfirmOpen(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, warehouseId])

  // ── Cálculos live ─────────────────────────────────────────────────────────
  const salesTotal = Number(summary?.sales_total ?? summary?.ventas_total ?? 0)
  const expensesTotal = Number(summary?.expenses_total ?? summary?.gastos_total ?? 0)

  const physicalTotal = useMemo(() => {
    return CASH_DENOMINATIONS.reduce((acc, d) => acc + (Number(counts[d.key] || 0) * d.value), 0)
  }, [counts])

  const expectedTotal = useMemo(() => {
    const fund = Number(openingFund || 0)
    const inc = Number(otherIncome || 0)
    const exp = Number(otherExpense || 0)
    return fund + salesTotal + inc - expensesTotal - exp
  }, [openingFund, otherIncome, otherExpense, salesTotal, expensesTotal])

  const difference = physicalTotal - expectedTotal

  const diffColor = Math.abs(difference) < 0.01
    ? TOKENS.colors.success
    : (difference > 0 ? TOKENS.colors.blue3 : TOKENS.colors.error)
  const diffLabel = Math.abs(difference) < 0.01
    ? 'Cuadrado'
    : (difference > 0 ? 'Sobrante' : 'Faltante')

  const locked = closedState === 'closed' || submitting
  const canSubmit = BACKEND_CAPS.cashClosingWrite && !locked && openingFund !== '' && physicalTotal > 0

  // ── Handlers ──────────────────────────────────────────────────────────────
  function updateCount(key, raw) {
    const n = Number(raw)
    setCounts(prev => ({ ...prev, [key]: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0 }))
  }

  async function doClose() {
    if (!canSubmit) return
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const denominations = CASH_DENOMINATIONS
        .filter(d => Number(counts[d.key] || 0) > 0)
        .map(d => ({ denomination: d.key, count: Number(counts[d.key]) }))

      const res = await createCashClosing({
        companyId,
        warehouseId,
        openingFund: Number(openingFund),
        denominations,
        otherIncome: Number(otherIncome || 0),
        otherExpense: Number(otherExpense || 0),
        notes,
        close: true,
      })
      const data = res?.data ?? res
      setClosedState('closed')
      setSuccess(
        data?.difference != null
          ? `Cierre registrado. Diferencia: ${fmt(data.difference)}`
          : 'Cierre registrado correctamente.'
      )
      setConfirmOpen(false)
    } catch (e) {
      setError(e?.message || 'Error al cerrar el día')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Estilos ───────────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 13, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          CIERRE DEL DÍA · {companyLabel.toUpperCase()}
          {sucursal && <> · {sucursal.toUpperCase()}</>}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Arqueo de caja
        </h1>
      </div>

      {BACKEND_CAPS.cashClosingHistory && (
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 16,
        }}>
          {[
            { id: 'today', label: 'Hoy' },
            { id: 'history', label: 'Historial' },
          ].map(t => {
            const active = view === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setView(t.id)}
                style={{
                  padding: '8px 18px', borderRadius: TOKENS.radius.sm,
                  background: active ? `${TOKENS.colors.blue2}22` : 'transparent',
                  border: `1px solid ${active ? TOKENS.colors.blue2 : 'transparent'}`,
                  fontSize: 12, fontWeight: 700,
                  color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                  fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}

      {view === 'history' ? (
        <CashClosingHistory companyId={companyId} warehouseId={warehouseId} />
      ) : (<>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.successSoft, border: `1px solid ${TOKENS.colors.success}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.success,
        }}>
          {success}
        </div>
      )}

      {closedState === 'closed' && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: `${TOKENS.colors.success}12`, border: `1px solid ${TOKENS.colors.success}40`,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: TOKENS.colors.success }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: TOKENS.colors.success }}>
            Día cerrado — edición bloqueada
          </span>
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ── Izquierda: conteo físico por denominación ── */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, marginTop: 0, marginBottom: 14,
          }}>
            CONTEO FÍSICO
          </p>

          <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
            Fondo inicial *
          </label>
          <input
            type="number" min="0" step="0.01"
            value={openingFund}
            onChange={e => setOpeningFund(e.target.value)}
            disabled={locked}
            placeholder="0.00"
            style={{ ...inputStyle, marginBottom: 16, opacity: locked ? 0.6 : 1 }}
          />

          <label style={{ fontSize: 12, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 8 }}>
            Denominaciones MXN
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 8,
            marginBottom: 14,
          }}>
            {CASH_DENOMINATIONS.map(d => {
              const count = counts[d.key] || 0
              const line = count * d.value
              return (
                <div key={d.key} style={{
                  padding: 10, borderRadius: TOKENS.radius.md,
                  background: count > 0 ? `${TOKENS.colors.blue2}10` : TOKENS.colors.surface,
                  border: `1px solid ${count > 0 ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.textSoft }}>
                      {d.label}
                    </span>
                    {line > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: TOKENS.colors.blue3 }}>
                        {fmt(line)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number" min="0" step="1"
                    value={count || ''}
                    onChange={e => updateCount(d.key, e.target.value)}
                    disabled={locked}
                    placeholder="0"
                    style={{
                      ...inputStyle, padding: '6px 10px', fontSize: 12, textAlign: 'right',
                      opacity: locked ? 0.6 : 1,
                    }}
                  />
                </div>
              )
            })}
          </div>

          <div style={{
            padding: 14, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.colors.textLow }}>
                TOTAL FÍSICO
              </span>
              <span style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.text }}>
                {fmt(physicalTotal)}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                Otros ingresos
              </label>
              <input
                type="number" min="0" step="0.01"
                value={otherIncome}
                onChange={e => setOtherIncome(e.target.value)}
                disabled={locked}
                placeholder="0.00"
                style={{ ...inputStyle, opacity: locked ? 0.6 : 1 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
                Otros egresos
              </label>
              <input
                type="number" min="0" step="0.01"
                value={otherExpense}
                onChange={e => setOtherExpense(e.target.value)}
                disabled={locked}
                placeholder="0.00"
                style={{ ...inputStyle, opacity: locked ? 0.6 : 1 }}
              />
            </div>
          </div>

          <label style={{ fontSize: 11, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>
            Notas (opcional)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            disabled={locked}
            placeholder="Observaciones del día…"
            style={{ ...inputStyle, resize: 'vertical', opacity: locked ? 0.6 : 1 }}
          />
        </div>

        {/* ── Derecha: summary + comparativa + acción ── */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          position: 'sticky', top: 84,
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, margin: 0,
          }}>
            RESUMEN DEL DÍA
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
              <div style={{
                width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : (
            <>
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <Row label="Fondo inicial" value={fmt(Number(openingFund || 0))} />
                <Row label="Ventas del día" value={fmt(salesTotal)} color={TOKENS.colors.success} />
                <Row label="Otros ingresos" value={fmt(Number(otherIncome || 0))} />
                <Row label="Gastos del día" value={`− ${fmt(expensesTotal)}`} color={TOKENS.colors.warning} />
                <Row label="Otros egresos" value={`− ${fmt(Number(otherExpense || 0))}`} />
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: 8, marginTop: 6,
                  borderTop: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.textSoft }}>
                    Esperado en caja
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.blue3 }}>
                    {fmt(expectedTotal)}
                  </span>
                </div>
              </div>

              <div style={{
                padding: 14, borderRadius: TOKENS.radius.md,
                background: `${diffColor}0f`, border: `1px solid ${diffColor}40`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: diffColor }}>
                    {diffLabel.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 700, color: diffColor }}>
                    {Math.abs(difference) < 0.01 ? fmt(0) : fmt(difference)}
                  </span>
                </div>
                <p style={{ fontSize: 10, color: TOKENS.colors.textMuted, margin: 0 }}>
                  Físico {fmt(physicalTotal)} − Esperado {fmt(expectedTotal)}
                </p>
              </div>

              {employeeName && (
                <p style={{ fontSize: 11, color: TOKENS.colors.textLow, margin: 0, textAlign: 'center' }}>
                  Responsable: <strong style={{ color: TOKENS.colors.textSoft }}>{employeeName}</strong>
                </p>
              )}

              {confirmOpen ? (
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md,
                  background: `${TOKENS.colors.warning}10`, border: `1px solid ${TOKENS.colors.warning}40`,
                }}>
                  <p style={{ fontSize: 12, color: TOKENS.colors.textSoft, margin: '0 0 10px', textAlign: 'center' }}>
                    ¿Confirmar cierre del día? <strong>No se podrá modificar después.</strong>
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      disabled={submitting}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        fontSize: 12, fontWeight: 600, color: TOKENS.colors.textSoft,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={doClose}
                      disabled={submitting}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                        background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                        fontSize: 12, fontWeight: 700, color: 'white',
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: submitting ? 0.6 : 1, cursor: submitting ? 'wait' : 'pointer',
                      }}
                    >
                      {submitting ? 'Cerrando…' : 'Sí, cerrar día'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canSubmit}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: TOKENS.radius.md,
                    background: canSubmit
                      ? `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`
                      : TOKENS.colors.surface,
                    border: canSubmit ? 'none' : `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                    opacity: canSubmit ? 1 : 0.5,
                  }}
                >
                  {closedState === 'closed' ? 'Día cerrado' : 'Cerrar día'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div style={{ height: 40 }} />
      </>)}
    </div>
  )
}

function CashClosingHistory({ companyId, warehouseId }) {
  const today = new Date()
  const weekAgo = new Date(); weekAgo.setDate(today.getDate() - 30)
  const iso = (d) => d.toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(iso(weekAgo))
  const [dateTo, setDateTo] = useState(iso(today))
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!companyId) return
      setLoading(true); setError('')
      try {
        const res = await getCashClosingHistory({
          companyId, warehouseId, dateFrom, dateTo, limit: 100,
        })
        const data = res?.data ?? res
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : [])
        if (alive) setItems(rows)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar historial')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [companyId, warehouseId, dateFrom, dateTo])

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let alive = true
    async function loadDetail() {
      setDetailLoading(true)
      try {
        const res = await getCashClosingDetail(selectedId)
        const data = res?.data ?? res
        if (alive) setDetail(data || null)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar detalle')
      } finally {
        if (alive) setDetailLoading(false)
      }
    }
    loadDetail()
    return () => { alive = false }
  }, [selectedId])

  const dateInput = {
    padding: '8px 12px', borderRadius: TOKENS.radius.md,
    background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
    color: TOKENS.colors.text, fontSize: 12, outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>Del</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={dateInput} />
        <label style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>al</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={dateInput} />
        <span style={{ fontSize: 11, color: TOKENS.colors.textLow, marginLeft: 'auto' }}>
          {items.length} cierres
        </span>
      </div>

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
        }}>
          {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.3fr)',
        gap: 20, alignItems: 'start',
      }}>
        {/* Lista */}
        <div style={{
          padding: 18, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <div style={{
                width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : items.length === 0 ? (
            <div style={{
              padding: '28px 16px', borderRadius: TOKENS.radius.md, textAlign: 'center',
              background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
            }}>
              <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
                Sin cierres en el rango seleccionado
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100dvh - 340px)', overflowY: 'auto' }}>
              {items.map(c => {
                const active = c.id === selectedId
                const diff = Number(c.difference || 0)
                const diffColor = Math.abs(diff) < 0.01
                  ? TOKENS.colors.success
                  : diff > 0 ? TOKENS.colors.blue3 : TOKENS.colors.error
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: TOKENS.radius.md,
                      background: active ? `${TOKENS.colors.blue2}1f` : TOKENS.colors.surface,
                      border: `1px solid ${active ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                      textAlign: 'left', cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 12, fontWeight: 700, color: TOKENS.colors.text, margin: 0,
                      }}>
                        {c.date ? new Date(c.date).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short' }) : `#${c.id}`}
                      </p>
                      <p style={{ fontSize: 10, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                        Físico {fmt(c.physical_total || 0)} · Esperado {fmt(c.expected_total || 0)}
                      </p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: diffColor, whiteSpace: 'nowrap' }}>
                      {diff === 0 ? '=' : (diff > 0 ? '+' : '')}{fmt(Math.abs(diff))}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detalle */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          minHeight: 300,
        }}>
          {!selectedId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 260 }}>
              <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
                Selecciona un cierre del historial
              </p>
            </div>
          ) : detailLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div style={{
                width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : !detail ? (
            <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
              Sin detalle disponible
            </p>
          ) : (
            <CashClosingDetailView detail={detail} />
          )}
        </div>
      </div>
    </div>
  )
}

function CashClosingDetailView({ detail }) {
  const denominations = Array.isArray(detail.denominations) ? detail.denominations : []
  const diff = Number(detail.difference || 0)
  const diffColor = Math.abs(diff) < 0.01
    ? TOKENS.colors.success
    : diff > 0 ? TOKENS.colors.blue3 : TOKENS.colors.error
  const diffLabel = Math.abs(diff) < 0.01 ? 'Cuadrado' : (diff > 0 ? 'Sobrante' : 'Faltante')

  return (
    <div>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
        color: TOKENS.colors.textLow, margin: 0,
      }}>
        CIERRE #{detail.id}
      </p>
      <h2 style={{
        fontSize: 18, fontWeight: 700, color: TOKENS.colors.text,
        margin: '4px 0 16px', letterSpacing: '-0.02em',
      }}>
        {detail.date ? new Date(detail.date).toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
      </h2>

      <div style={{
        padding: 14, borderRadius: TOKENS.radius.md, marginBottom: 14,
        background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <Row label="Fondo inicial" value={fmt(detail.opening_fund || 0)} />
        <Row label="Ventas" value={fmt(detail.sales_total || 0)} color={TOKENS.colors.success} />
        <Row label="Otros ingresos" value={fmt(detail.other_income || 0)} />
        <Row label="Gastos" value={`− ${fmt(detail.expenses_total || 0)}`} color={TOKENS.colors.warning} />
        <Row label="Otros egresos" value={`− ${fmt(detail.other_expense || 0)}`} />
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 8, marginTop: 6, borderTop: `1px solid ${TOKENS.colors.border}`,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.textSoft }}>
            Esperado
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.blue3 }}>
            {fmt(detail.expected_total || 0)}
          </span>
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.textSoft }}>
            Físico contado
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.text }}>
            {fmt(detail.physical_total || 0)}
          </span>
        </div>
      </div>

      <div style={{
        padding: 14, borderRadius: TOKENS.radius.md, marginBottom: 14,
        background: `${diffColor}10`, border: `1px solid ${diffColor}40`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: diffColor }}>
          {diffLabel.toUpperCase()}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: diffColor }}>
          {fmt(diff)}
        </span>
      </div>

      {denominations.length > 0 && (
        <>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: TOKENS.colors.textLow, margin: '0 0 8px',
          }}>
            DENOMINACIONES
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6,
            marginBottom: 14,
          }}>
            {denominations.map((d, i) => {
              const val = Number(d.denomination || 0) * Number(d.count || 0)
              return (
                <div key={i} style={{
                  padding: 8, borderRadius: TOKENS.radius.sm,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TOKENS.colors.textMuted }}>
                    ${Number(d.denomination).toFixed(Number(d.denomination) < 1 ? 2 : 0)}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.textSoft }}>
                    ×{d.count}
                  </span>
                  <span style={{ fontSize: 10, color: TOKENS.colors.blue3, fontWeight: 600 }}>
                    {fmt(val)}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {detail.notes && (
        <div style={{
          padding: 12, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: TOKENS.colors.textLow, margin: '0 0 6px',
          }}>
            NOTAS
          </p>
          <p style={{ fontSize: 12, color: TOKENS.colors.textSoft, margin: 0, whiteSpace: 'pre-wrap' }}>
            {detail.notes}
          </p>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || TOKENS.colors.textSoft }}>{value}</span>
    </div>
  )
}
