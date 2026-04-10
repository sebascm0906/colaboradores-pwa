// ─── RequisitionDetailModal — detalle y cancelación de requisición ─────────
// Backend:
//   GET  /pwa-admin/requisition-detail?id=
//   POST /pwa-admin/requisition-cancel { id }
//
// Muestra líneas (product, qty, price_unit, subtotal), estado y totales.
// Permite cancelar si el estado es `draft` o `sent`.
import { useEffect, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { getRequisitionDetail, cancelRequisition } from '../api'
import { BACKEND_CAPS } from '../adminService'

const fmt = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const STATUS_MAP = {
  draft:    { label: 'Borrador',   color: '#8b92a1' },
  sent:     { label: 'Enviado',    color: '#4ba3e0' },
  purchase: { label: 'Confirmado', color: '#4ba3e0' },
  done:     { label: 'Completado', color: '#35c792' },
  cancel:   { label: 'Cancelado',  color: '#e05a5a' },
}

export default function RequisitionDetailModal({ requisitionId, onClose, onCancelled }) {
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!requisitionId) return
      setLoading(true)
      setError('')
      try {
        const res = await getRequisitionDetail(requisitionId)
        const data = res?.data ?? res
        if (alive) setDetail(data || null)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar detalle')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [requisitionId])

  async function doCancel() {
    setCancelling(true)
    setError('')
    try {
      await cancelRequisition(requisitionId)
      setConfirmOpen(false)
      onCancelled && onCancelled(requisitionId)
      onClose && onClose()
    } catch (e) {
      setError(e?.message || 'Error al cancelar requisición')
    } finally {
      setCancelling(false)
    }
  }

  const state = detail?.state || 'draft'
  const st = STATUS_MAP[state] || STATUS_MAP.draft
  const lines = Array.isArray(detail?.lines) ? detail.lines : []
  const total = lines.reduce((s, l) => s + Number(l.price_subtotal ?? l.subtotal ?? (Number(l.quantity || 0) * Number(l.price_unit || 0))), 0)
  const canCancel = (state === 'draft' || state === 'sent') && BACKEND_CAPS.requisitionDetail

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(6, 10, 18, 0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680, maxHeight: 'calc(100dvh - 80px)',
          overflowY: 'auto',
          background: TOKENS.colors.bg1,
          border: `1px solid ${TOKENS.colors.border}`,
          borderRadius: TOKENS.radius.xl,
          padding: 24,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: TOKENS.colors.textLow, margin: 0,
            }}>
              REQUISICIÓN #{requisitionId}
            </p>
            <h2 style={{
              fontSize: 20, fontWeight: 700, color: TOKENS.colors.text,
              margin: '4px 0 0', letterSpacing: '-0.02em',
            }}>
              {detail?.name || `Requisición #${requisitionId}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: TOKENS.colors.textMuted,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 14,
            background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
            fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
            <div style={{
              width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
              borderTop: '2px solid #2B8FE0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : !detail ? (
          <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
            Sin detalle disponible
          </p>
        ) : (
          <>
            {/* Meta */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10,
              marginBottom: 16,
            }}>
              <MetaCell label="ESTADO">
                <span style={{
                  padding: '3px 10px', borderRadius: TOKENS.radius.pill,
                  background: `${st.color}15`, border: `1px solid ${st.color}40`,
                  fontSize: 11, fontWeight: 700, color: st.color,
                }}>
                  {st.label}
                </span>
              </MetaCell>
              <MetaCell label="FECHA">
                <span style={{ fontSize: 13, color: TOKENS.colors.text }}>
                  {detail.date_order
                    ? new Date(detail.date_order).toLocaleDateString('es-MX')
                    : detail.date
                      ? new Date(detail.date).toLocaleDateString('es-MX')
                      : '—'}
                </span>
              </MetaCell>
              <MetaCell label="PROVEEDOR">
                <span style={{
                  fontSize: 13, color: TOKENS.colors.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'block',
                }}>
                  {detail.partner_name || detail.partner_id?.[1] || '—'}
                </span>
              </MetaCell>
            </div>

            {/* Líneas */}
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              color: TOKENS.colors.textLow, margin: '0 0 8px',
            }}>
              LÍNEAS · {lines.length}
            </p>
            {lines.length === 0 ? (
              <div style={{
                padding: '16px 12px', borderRadius: TOKENS.radius.md, textAlign: 'center',
                background: TOKENS.glass.panelSoft, border: `1px dashed ${TOKENS.colors.border}`,
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
                  Sin líneas capturadas
                </p>
              </div>
            ) : (
              <div style={{
                borderRadius: TOKENS.radius.md, overflow: 'hidden', marginBottom: 14,
                border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 2fr) 70px 90px 90px',
                  gap: 8, padding: '8px 12px',
                  background: TOKENS.colors.surfaceSoft,
                  borderBottom: `1px solid ${TOKENS.colors.border}`,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                  color: TOKENS.colors.textLow,
                }}>
                  <span>PRODUCTO</span>
                  <span style={{ textAlign: 'right' }}>CANT.</span>
                  <span style={{ textAlign: 'right' }}>P.U.</span>
                  <span style={{ textAlign: 'right' }}>SUBTOTAL</span>
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                  {lines.map((ln, i) => {
                    const sub = Number(ln.price_subtotal ?? ln.subtotal ?? (Number(ln.quantity || 0) * Number(ln.price_unit || 0)))
                    return (
                      <div key={ln.id || i} style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 2fr) 70px 90px 90px',
                        gap: 8, padding: '8px 12px',
                        borderBottom: `1px solid ${TOKENS.colors.border}30`,
                        fontSize: 12, color: TOKENS.colors.textSoft,
                      }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ln.product_name || ln.name || ln.product_id?.[1] || '—'}
                        </span>
                        <span style={{ textAlign: 'right' }}>{Number(ln.quantity || 0).toFixed(2)}</span>
                        <span style={{ textAlign: 'right' }}>{fmt(ln.price_unit)}</span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color: TOKENS.colors.text }}>
                          {fmt(sub)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Total */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 14px', borderRadius: TOKENS.radius.md, marginBottom: 16,
              background: TOKENS.colors.blueGlow, border: `1px solid ${TOKENS.colors.borderBlue}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.textSoft, letterSpacing: '0.08em' }}>
                TOTAL
              </span>
              <span style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.blue3 }}>
                {fmt(detail.amount_total ?? total)}
              </span>
            </div>

            {/* Notas */}
            {detail.notes && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md, marginBottom: 16,
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

            {/* Acciones */}
            {canCancel && (
              confirmOpen ? (
                <div style={{
                  padding: 12, borderRadius: TOKENS.radius.md,
                  background: `${TOKENS.colors.error}10`, border: `1px solid ${TOKENS.colors.error}40`,
                }}>
                  <p style={{ fontSize: 12, color: TOKENS.colors.textSoft, margin: '0 0 10px', textAlign: 'center' }}>
                    ¿Cancelar esta requisición? El PO pasa a <strong>cancel</strong> y no se puede revertir desde aquí.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setConfirmOpen(false)}
                      disabled={cancelling}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                        background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                        fontSize: 12, fontWeight: 600, color: TOKENS.colors.textSoft,
                        fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                      }}
                    >
                      No, cerrar
                    </button>
                    <button
                      type="button"
                      onClick={doCancel}
                      disabled={cancelling}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: TOKENS.radius.md,
                        background: `linear-gradient(135deg, ${TOKENS.colors.error}, #d44)`,
                        fontSize: 12, fontWeight: 700, color: 'white',
                        fontFamily: "'DM Sans', sans-serif",
                        opacity: cancelling ? 0.6 : 1, cursor: cancelling ? 'wait' : 'pointer',
                        border: 'none',
                      }}
                    >
                      {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: TOKENS.radius.md,
                    background: 'transparent', border: `1px solid ${TOKENS.colors.error}60`,
                    fontSize: 13, fontWeight: 700, color: TOKENS.colors.error,
                    fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
                  }}
                >
                  Cancelar requisición
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MetaCell({ label, children }) {
  return (
    <div style={{
      padding: 10, borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
        color: TOKENS.colors.textLow, margin: '0 0 4px',
      }}>
        {label}
      </p>
      {children}
    </div>
  )
}
