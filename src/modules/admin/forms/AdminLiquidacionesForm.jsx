// ─── AdminLiquidacionesForm — Validación de liquidaciones V2 (desktop) ──────
// Backend (wrappers sobre gf_logistics_ops):
//   GET  /pwa-admin/liquidaciones/pending?company_id&warehouse_id
//   GET  /pwa-admin/liquidaciones/detail?plan_id
//   POST /pwa-admin/liquidaciones/validate  { plan_id }
//
// UI desktop (2 columnas):
//   ┌───────────────────┬─────────────────────┐
//   │ Planes pendientes │ Detalle del plan    │
//   │ (clickable list)  │  · pagos (efectivo, │
//   │                   │    crédito, trans)  │
//   │                   │  · líneas reconcil. │
//   │                   │  · Validar          │
//   └───────────────────┴─────────────────────┘
import { useEffect, useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import {
  getPendingLiquidations,
  getLiquidationDetail,
  validateLiquidation,
  getLiquidationsHistory,
} from '../api'
import { BACKEND_CAPS } from '../adminService'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const PAYMENT_LABELS = {
  cash: 'Efectivo',
  credit: 'Crédito',
  transfer: 'Transferencia',
  card: 'Tarjeta',
}

export default function AdminLiquidacionesForm() {
  const { companyId, companyLabel, warehouseId } = useAdmin()

  const [view, setView] = useState('pending') // 'pending' | 'history'
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const [validating, setValidating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // ── Carga lista de pendientes ─────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    async function load() {
      if (!companyId) return
      setLoading(true)
      setError('')
      setSelectedId(null)
      setDetail(null)
      try {
        const res = await getPendingLiquidations({ companyId, warehouseId })
        const data = res?.data ?? res
        const rows = Array.isArray(data) ? data : (Array.isArray(data?.plans) ? data.plans : [])
        if (alive) setList(rows)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar liquidaciones pendientes')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [companyId, warehouseId])

  // ── Carga detalle del plan seleccionado ───────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let alive = true
    async function loadDetail() {
      setDetailLoading(true)
      setError('')
      try {
        const res = await getLiquidationDetail(selectedId)
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

  // ── Validación ────────────────────────────────────────────────────────────
  async function doValidate() {
    if (!selectedId) return
    setValidating(true)
    setError('')
    setSuccess('')
    try {
      await validateLiquidation(selectedId)
      setSuccess(`Liquidación del plan #${selectedId} validada`)
      setConfirmOpen(false)
      // Recargar lista (el plan validado debería desaparecer)
      const res = await getPendingLiquidations({ companyId, warehouseId })
      const data = res?.data ?? res
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.plans) ? data.plans : [])
      setList(rows)
      setSelectedId(null)
      setDetail(null)
      setTimeout(() => setSuccess(''), 3500)
    } catch (e) {
      setError(e?.message || 'Error al validar liquidación')
    } finally {
      setValidating(false)
    }
  }

  // ── Derivaciones del detalle ──────────────────────────────────────────────
  const summary = detail?.summary || detail?.liquidation_summary || null
  const lines = useMemo(() => {
    const raw = detail?.reconciliation_lines || detail?.lines || []
    return Array.isArray(raw) ? raw : []
  }, [detail])

  const paymentEntries = useMemo(() => {
    if (!summary) return []
    // El backend puede devolver { cash, credit, transfer } como dict o array
    if (Array.isArray(summary.payments)) return summary.payments
    if (summary.by_method && typeof summary.by_method === 'object') {
      return Object.entries(summary.by_method).map(([method, amount]) => ({ method, amount }))
    }
    // Fallback: detectar claves conocidas
    const out = []
    for (const key of ['cash', 'credit', 'transfer', 'card']) {
      if (summary[key] != null) out.push({ method: key, amount: summary[key] })
    }
    return out
  }, [summary])

  const totalPayments = useMemo(
    () => paymentEntries.reduce((s, p) => s + Number(p.amount || 0), 0),
    [paymentEntries],
  )

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          LIQUIDACIONES · {companyLabel.toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Validación de rutas
        </h1>
      </div>

      {BACKEND_CAPS.liquidacionesHistory && (
        <div style={{
          display: 'inline-flex', gap: 4, padding: 4, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
          marginBottom: 16,
        }}>
          {[
            { id: 'pending', label: 'Pendientes' },
            { id: 'history', label: 'Validadas' },
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
        <LiquidacionesHistory companyId={companyId} warehouseId={warehouseId} />
      ) : (<>

      {!BACKEND_CAPS.liquidaciones && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.warningSoft, border: `1px solid ${TOKENS.colors.warning}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.warning,
        }}>
          Módulo gf_logistics_ops no disponible en este ambiente
        </div>
      )}

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

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.3fr)',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ── Izquierda: lista de pendientes ── */}
        <div style={{
          padding: 18, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
            color: TOKENS.colors.textLow, margin: '0 0 12px',
          }}>
            PENDIENTES · {list.length}
          </p>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
              <div style={{
                width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : list.length === 0 ? (
            <div style={{
              padding: '28px 16px', borderRadius: TOKENS.radius.md, textAlign: 'center',
              background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
            }}>
              <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
                Sin liquidaciones pendientes
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100dvh - 260px)', overflowY: 'auto' }}>
              {list.map(plan => {
                const active = plan.id === selectedId
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedId(plan.id)}
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
                        fontSize: 12, fontWeight: 700, color: TOKENS.colors.text,
                        margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {plan.name || `Plan #${plan.id}`}
                      </p>
                      <p style={{ fontSize: 10, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                        {plan.route_name || plan.vehicle_name || '—'}
                        {plan.driver_name && ` · ${plan.driver_name}`}
                      </p>
                    </div>
                    {plan.total != null && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.blue3, whiteSpace: 'nowrap' }}>
                        {fmt(plan.total)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Derecha: detalle del plan ── */}
        <div style={{
          padding: 22, borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
          minHeight: 360,
        }}>
          {!selectedId ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 300,
            }}>
              <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
                Selecciona una liquidación pendiente
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
            <>
              <div style={{ marginBottom: 16 }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
                  color: TOKENS.colors.textLow, margin: 0,
                }}>
                  PLAN DE RUTA #{detail.id || selectedId}
                </p>
                <h2 style={{
                  fontSize: 18, fontWeight: 700, color: TOKENS.colors.text,
                  margin: '4px 0 0', letterSpacing: '-0.02em',
                }}>
                  {detail.name || `Plan #${selectedId}`}
                </h2>
                {(detail.route_name || detail.driver_name || detail.vehicle_name) && (
                  <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                    {[detail.route_name, detail.driver_name, detail.vehicle_name].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>

              {/* Resumen de pagos */}
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.md, marginBottom: 14,
                background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  color: TOKENS.colors.textLow, margin: '0 0 10px',
                }}>
                  PAGOS RECIBIDOS
                </p>
                {paymentEntries.length === 0 ? (
                  <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
                    Sin información de pagos
                  </p>
                ) : (
                  <>
                    {paymentEntries.map(p => (
                      <div key={p.method} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
                      }}>
                        <span style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>
                          {PAYMENT_LABELS[p.method] || p.method}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: TOKENS.colors.text }}>
                          {fmt(p.amount)}
                        </span>
                      </div>
                    ))}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      paddingTop: 8, marginTop: 6,
                      borderTop: `1px solid ${TOKENS.colors.border}`,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.textSoft }}>
                        Total cobrado
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: TOKENS.colors.blue3 }}>
                        {fmt(totalPayments)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Conciliación de inventario */}
              <p style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                color: TOKENS.colors.textLow, margin: '0 0 8px',
              }}>
                CONCILIACIÓN DE INVENTARIO · {lines.length} líneas
              </p>
              {lines.length === 0 ? (
                <div style={{
                  padding: '16px 12px', borderRadius: TOKENS.radius.md, textAlign: 'center',
                  background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
                  marginBottom: 14,
                }}>
                  <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
                    Sin líneas de reconciliación
                  </p>
                </div>
              ) : (
                <div style={{
                  borderRadius: TOKENS.radius.md, overflow: 'hidden', marginBottom: 14,
                  border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 2fr) 70px 70px 70px 70px',
                    gap: 8, padding: '8px 12px',
                    background: TOKENS.colors.surfaceSoft,
                    borderBottom: `1px solid ${TOKENS.colors.border}`,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    color: TOKENS.colors.textLow,
                  }}>
                    <span>PRODUCTO</span>
                    <span style={{ textAlign: 'right' }}>CARGADO</span>
                    <span style={{ textAlign: 'right' }}>ENTREG.</span>
                    <span style={{ textAlign: 'right' }}>DEVUEL.</span>
                    <span style={{ textAlign: 'right' }}>MERMA</span>
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {lines.map((ln, i) => (
                      <div key={ln.id || i} style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 2fr) 70px 70px 70px 70px',
                        gap: 8, padding: '8px 12px',
                        borderBottom: `1px solid ${TOKENS.colors.border}30`,
                        fontSize: 11, color: TOKENS.colors.textSoft,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ln.product_name || ln.product_id?.[1] || '—'}
                        </span>
                        <span style={{ textAlign: 'right' }}>{Number(ln.qty_loaded || 0).toFixed(0)}</span>
                        <span style={{ textAlign: 'right', color: TOKENS.colors.success }}>
                          {Number(ln.qty_delivered || 0).toFixed(0)}
                        </span>
                        <span style={{ textAlign: 'right' }}>{Number(ln.qty_returned || 0).toFixed(0)}</span>
                        <span style={{ textAlign: 'right', color: Number(ln.qty_scrap || 0) > 0 ? TOKENS.colors.error : TOKENS.colors.textMuted }}>
                          {Number(ln.qty_scrap || 0).toFixed(0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validar */}
              {confirmOpen ? (
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md,
                  background: `${TOKENS.colors.warning}10`, border: `1px solid ${TOKENS.colors.warning}40`,
                }}>
                  <p style={{ fontSize: 12, color: TOKENS.colors.textSoft, margin: '0 0 10px', textAlign: 'center' }}>
                    ¿Validar la liquidación del plan #{selectedId}? Marca la reconciliación como <strong>done</strong>.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      disabled={validating}
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
                      onClick={doValidate}
                      disabled={validating}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                        background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                        fontSize: 12, fontWeight: 700, color: 'white',
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: validating ? 0.6 : 1, cursor: validating ? 'wait' : 'pointer',
                      }}
                    >
                      {validating ? 'Validando…' : 'Sí, validar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!BACKEND_CAPS.liquidaciones || validating}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                    fontSize: 13, fontWeight: 700, color: 'white',
                    fontFamily: "'DM Sans', sans-serif",
                    opacity: BACKEND_CAPS.liquidaciones ? 1 : 0.5,
                    cursor: BACKEND_CAPS.liquidaciones ? 'pointer' : 'not-allowed',
                  }}
                >
                  Validar liquidación
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

// ─── LiquidacionesHistory — tab "Validadas" ─────────────────────────────────
function LiquidacionesHistory({ companyId, warehouseId }) {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const toIso = (d) => d.toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(toIso(firstOfMonth))
  const [dateTo, setDateTo] = useState(toIso(today))
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      if (!companyId) return
      setLoading(true)
      setError('')
      try {
        const res = await getLiquidationsHistory({
          companyId, warehouseId,
          dateFrom, dateTo,
          limit: 100,
        })
        const data = res?.data ?? res
        const rows = Array.isArray(data)
          ? data
          : (Array.isArray(data?.plans) ? data.plans : (Array.isArray(data?.history) ? data.history : []))
        if (alive) setList(rows)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar historial')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [companyId, warehouseId, dateFrom, dateTo])

  return (
    <div>
      <div style={{
        padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 14,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
      }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: TOKENS.colors.textLow,
          }}>
            DESDE
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: '10px 12px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              fontSize: 13, color: TOKENS.colors.text, fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            color: TOKENS.colors.textLow,
          }}>
            HASTA
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: '10px 12px', borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              fontSize: 13, color: TOKENS.colors.text, fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </label>
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
        padding: 18, borderRadius: TOKENS.radius.xl,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: '0 0 12px',
        }}>
          VALIDADAS · {list.length}
        </p>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
            <div style={{
              width: 24, height: 24, border: '2px solid rgba(255,255,255,0.12)',
              borderTop: '2px solid #2B8FE0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : list.length === 0 ? (
          <div style={{
            padding: '28px 16px', borderRadius: TOKENS.radius.md, textAlign: 'center',
            background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
          }}>
            <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
              Sin liquidaciones validadas en este rango
            </p>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            maxHeight: 'calc(100dvh - 380px)', overflowY: 'auto',
          }}>
            {list.map(plan => (
              <div
                key={plan.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13, fontWeight: 700, color: TOKENS.colors.text,
                    margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {plan.name || `Plan #${plan.id}`}
                  </p>
                  <p style={{ fontSize: 10, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                    {[plan.route_name, plan.driver_name, plan.vehicle_name].filter(Boolean).join(' · ') || '—'}
                    {plan.validated_date && ` · ${plan.validated_date}`}
                  </p>
                </div>
                {plan.total != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.blue3, whiteSpace: 'nowrap' }}>
                    {fmt(plan.total)}
                  </span>
                )}
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  background: `${TOKENS.colors.success}22`, color: TOKENS.colors.success,
                  border: `1px solid ${TOKENS.colors.success}40`,
                }}>
                  Validada
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
