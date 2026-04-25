import { useEffect, useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import {
  getRequisitionReceiptDetail,
  receiveRequisitionProducts,
} from '../api'
import {
  buildEditableReceiptLines,
  buildReceivePayloadLines,
  clampReceiveQty,
  computeReceivableTotals,
} from '../requisitionReceiptState'

const fmt = (n) => Number(n || 0).toFixed(2)

export default function RequisitionReceiptModal({ requisitionId, onClose, onSaved }) {
  const [detail, setDetail] = useState(null)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!requisitionId) return
    setLoading(true)
    setError('')
    try {
      const res = await getRequisitionReceiptDetail(requisitionId)
      const data = res?.data ?? res
      const rawLines = Array.isArray(data?.lines)
        ? data.lines
        : Array.isArray(data?.moves)
          ? data.moves
          : []
      setDetail(data || null)
      setLines(buildEditableReceiptLines(rawLines))
    } catch (e) {
      setError(e?.message || 'Error al cargar la recepción')
      setDetail(null)
      setLines([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let alive = true
    if (!requisitionId) return undefined

    ;(async () => {
      if (!alive) return
      await load()
    })()

    return () => { alive = false }
  }, [requisitionId])

  const totals = useMemo(() => computeReceivableTotals(lines), [lines])

  function updateReceiveQty(lineId, nextValue) {
    setLines((prev) => prev.map((line) => {
      if (line.id !== lineId) return line
      return {
        ...line,
        receive_now_qty: clampReceiveQty(nextValue, line.qty_pending),
      }
    }))
  }

  async function handleSave() {
    if (!detail || saving) return

    const payloadLines = buildReceivePayloadLines(lines)
    if (!payloadLines.length) {
      setError('Captura al menos una cantidad mayor a cero para recibir.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await receiveRequisitionProducts({
        purchase_order_id: Number(detail?.purchase_order_id || detail?.id || requisitionId),
        picking_id: Number(detail?.picking_id || detail?.incoming_picking_id || 0) || undefined,
        lines: payloadLines,
      })
      onSaved && onSaved()
      onClose && onClose()
    } catch (e) {
      setError(e?.message || 'Error al guardar la recepción')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(6, 10, 18, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 760,
          maxHeight: 'calc(100dvh - 80px)',
          overflowY: 'auto',
          background: TOKENS.colors.bg1,
          border: `1px solid ${TOKENS.colors.border}`,
          borderRadius: TOKENS.radius.xl,
          padding: 24,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: TOKENS.colors.textLow,
              margin: 0,
            }}>
              RECEPCION DE REQUISICION
            </p>
            <h2 style={{
              fontSize: 20,
              fontWeight: 700,
              color: TOKENS.colors.text,
              margin: '4px 0 0',
              letterSpacing: '-0.02em',
            }}>
              {detail?.name || `Requisición #${requisitionId}`}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: TOKENS.colors.textMuted,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px',
            borderRadius: TOKENS.radius.sm,
            marginBottom: 14,
            background: TOKENS.colors.errorSoft,
            border: `1px solid ${TOKENS.colors.error}40`,
            fontSize: 12,
            fontWeight: 600,
            color: TOKENS.colors.error,
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div style={{
              width: 28,
              height: 28,
              border: '2px solid rgba(255,255,255,0.12)',
              borderTop: '2px solid #2B8FE0',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : !detail ? (
          <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
            Sin detalle de recepción disponible.
          </p>
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}>
              <MetaCell label="PICKING">
                <span style={{ fontSize: 13, color: TOKENS.colors.text }}>
                  {detail?.picking_name || detail?.incoming_picking_name || detail?.picking_id || '—'}
                </span>
              </MetaCell>
              <MetaCell label="LINEAS">
                <span style={{ fontSize: 13, color: TOKENS.colors.text }}>
                  {lines.length}
                </span>
              </MetaCell>
              <MetaCell label="RECIBIR AHORA">
                <span style={{ fontSize: 13, color: TOKENS.colors.blue3, fontWeight: 700 }}>
                  {fmt(totals.qty_total)}
                </span>
              </MetaCell>
            </div>

            {lines.length === 0 ? (
              <div style={{
                padding: '16px 12px',
                borderRadius: TOKENS.radius.md,
                textAlign: 'center',
                background: TOKENS.glass.panelSoft,
                border: `1px dashed ${TOKENS.colors.border}`,
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
                  No hay movimientos pendientes por recibir.
                </p>
              </div>
            ) : (
              <div style={{
                borderRadius: TOKENS.radius.md,
                overflow: 'hidden',
                marginBottom: 14,
                border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 2fr) 80px 80px 80px 110px',
                  gap: 8,
                  padding: '8px 12px',
                  background: TOKENS.colors.surfaceSoft,
                  borderBottom: `1px solid ${TOKENS.colors.border}`,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: TOKENS.colors.textLow,
                }}>
                  <span>PRODUCTO</span>
                  <span style={{ textAlign: 'right' }}>ORD.</span>
                  <span style={{ textAlign: 'right' }}>REC.</span>
                  <span style={{ textAlign: 'right' }}>PEND.</span>
                  <span style={{ textAlign: 'right' }}>AHORA</span>
                </div>
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 2fr) 80px 80px 80px 110px',
                        gap: 8,
                        padding: '8px 12px',
                        borderBottom: `1px solid ${TOKENS.colors.border}30`,
                        fontSize: 12,
                        color: TOKENS.colors.textSoft,
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.product_name || '—'}
                        </span>
                        {line.uom && (
                          <span style={{ fontSize: 10, color: TOKENS.colors.textLow }}>
                            {line.uom}
                          </span>
                        )}
                      </div>
                      <span style={{ textAlign: 'right' }}>{fmt(line.qty_ordered)}</span>
                      <span style={{ textAlign: 'right' }}>{fmt(line.qty_received)}</span>
                      <span style={{ textAlign: 'right' }}>{fmt(line.qty_pending)}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={line.qty_pending}
                        value={line.receive_now_qty}
                        onChange={(e) => updateReceiveQty(line.id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 8px',
                          borderRadius: TOKENS.radius.sm,
                          background: TOKENS.colors.surface,
                          border: `1px solid ${TOKENS.colors.border}`,
                          color: TOKENS.colors.text,
                          fontSize: 12,
                          textAlign: 'right',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surface,
                  border: `1px solid ${TOKENS.colors.border}`,
                  fontSize: 12,
                  fontWeight: 600,
                  color: TOKENS.colors.textSoft,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || totals.line_count === 0}
                style={{
                  flex: 1,
                  padding: '12px 0',
                  borderRadius: TOKENS.radius.md,
                  background: `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'white',
                  fontFamily: "'DM Sans', sans-serif",
                  opacity: saving || totals.line_count === 0 ? 0.6 : 1,
                  cursor: saving ? 'wait' : 'pointer',
                  border: 'none',
                }}
              >
                {saving ? 'Guardando…' : 'Guardar recepción'}
              </button>
            </div>
          </>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </div>
  )
}

function MetaCell({ label, children }) {
  return (
    <div style={{
      padding: 10,
      borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: TOKENS.colors.textLow,
        margin: '0 0 4px',
      }}>
        {label}
      </p>
      {children}
    </div>
  )
}
