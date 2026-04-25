// ── RequisitionReceiptModal ───────────────────────────────────────────────────
// Carga el picking de recepción real de Odoo y permite registrar cantidades
// parciales o totales por línea.
//
// Backend needed:
//   GET  /pwa-admin/requisition-receipt-detail?id=PO_ID
//   POST /pwa-admin/requisition-receive { id, lines: [{move_id, receive_now_qty}] }
import { useEffect, useState, useCallback } from 'react'
import { TOKENS } from '../../../tokens'
import { getRequisitionReceiptDetail, receiveRequisitionProducts } from '../api'
import {
  buildEditableReceiptLines,
  buildReceivePayloadLines,
  clampReceiveQty,
  computeReceivableTotals,
} from '../requisitionReceiptState'

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{
        width: 26, height: 26,
        border: '2px solid rgba(255,255,255,0.12)',
        borderTop: '2px solid #2B8FE0',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

export default function RequisitionReceiptModal({ requisitionId, onClose, onSaved }) {
  const [detail, setDetail]   = useState(null)
  const [lines, setLines]     = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')

  const loadDetail = useCallback(async () => {
    if (!requisitionId) return
    setLoading(true)
    setError('')
    try {
      const res = await getRequisitionReceiptDetail(requisitionId)
      const data = res?.data ?? res
      setDetail(data || null)
      setLines(buildEditableReceiptLines(Array.isArray(data?.lines) ? data.lines : []))
    } catch (e) {
      setError(e?.message || 'Error al cargar detalle de recepción')
    } finally {
      setLoading(false)
    }
  }, [requisitionId])

  useEffect(() => { loadDetail() }, [loadDetail])

  function handleQtyChange(idx, raw) {
    const line = lines[idx]
    const clamped = clampReceiveQty(parseFloat(raw) || 0, line.qty_pending ?? 0)
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, receive_now_qty: clamped } : l))
  }

  async function handleSave() {
    const payload = buildReceivePayloadLines(lines)
    if (!payload.length) {
      setError('Ingresa al menos una cantidad mayor a 0')
      return
    }
    setSaving(true)
    setError('')
    try {
      await receiveRequisitionProducts({ id: requisitionId, lines: payload })
      setSuccess('Recepción registrada')
      onSaved && onSaved(requisitionId)
      setTimeout(() => { onClose && onClose() }, 900)
    } catch (e) {
      setError(e?.message || 'Error al guardar recepción')
    } finally {
      setSaving(false)
    }
  }

  const totals = computeReceivableTotals(lines)

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(6,10,18,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680,
          maxHeight: 'calc(100dvh - 80px)', overflowY: 'auto',
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
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: TOKENS.colors.textLow, margin: 0 }}>
              RECEPCIÓN · REQUISICIÓN #{requisitionId}
            </p>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.text, margin: '4px 0 0', letterSpacing: '-0.02em' }}>
              {detail?.picking_name || 'Recibir producto'}
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

        {loading ? <Spinner /> : !detail ? (
          <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
            No se encontró el picking de recepción. El backend puede no tener este endpoint aún.
          </p>
        ) : (
          <>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0,2fr) 72px 72px 80px',
              gap: 8, padding: '7px 12px',
              background: TOKENS.colors.surfaceSoft,
              borderRadius: `${TOKENS.radius.md} ${TOKENS.radius.md} 0 0`,
              border: `1px solid ${TOKENS.colors.border}`,
              borderBottom: 'none',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              color: TOKENS.colors.textLow,
            }}>
              <span>PRODUCTO</span>
              <span style={{ textAlign: 'right' }}>PEDIDO</span>
              <span style={{ textAlign: 'right' }}>PENDIENTE</span>
              <span style={{ textAlign: 'right' }}>RECIBIR AHORA</span>
            </div>

            {/* Lines */}
            <div style={{
              border: `1px solid ${TOKENS.colors.border}`,
              borderRadius: `0 0 ${TOKENS.radius.md} ${TOKENS.radius.md}`,
              marginBottom: 14, overflow: 'hidden',
            }}>
              {lines.length === 0 ? (
                <div style={{ padding: '16px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>Sin líneas</p>
                </div>
              ) : lines.map((ln, i) => (
                <div
                  key={ln.move_id ?? i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,2fr) 72px 72px 80px',
                    gap: 8, padding: '8px 12px',
                    alignItems: 'center',
                    borderBottom: i < lines.length - 1 ? `1px solid ${TOKENS.colors.border}30` : 'none',
                    fontSize: 12, color: TOKENS.colors.textSoft,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ln.product_name || '—'}
                  </span>
                  <span style={{ textAlign: 'right' }}>{Number(ln.qty_ordered ?? 0).toFixed(2)}</span>
                  <span style={{ textAlign: 'right', color: Number(ln.qty_pending ?? 0) > 0 ? TOKENS.colors.warning : TOKENS.colors.textMuted }}>
                    {Number(ln.qty_pending ?? 0).toFixed(2)}
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={ln.qty_pending ?? 0}
                    step="0.01"
                    value={ln.receive_now_qty ?? 0}
                    onChange={(e) => handleQtyChange(i, e.target.value)}
                    disabled={saving}
                    style={{
                      padding: '5px 8px', borderRadius: TOKENS.radius.sm,
                      background: TOKENS.colors.surface,
                      border: `1px solid ${TOKENS.colors.borderBlue}`,
                      color: TOKENS.colors.text, fontSize: 12, fontWeight: 600,
                      textAlign: 'right', width: '100%',
                      fontFamily: "'DM Sans', sans-serif",
                      outline: 'none',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: TOKENS.radius.md, marginBottom: 14,
              background: TOKENS.colors.blueGlow, border: `1px solid ${TOKENS.colors.borderBlue}`,
              fontSize: 12,
            }}>
              <span style={{ color: TOKENS.colors.textSoft }}>
                {totals.line_count} línea{totals.line_count !== 1 ? 's' : ''} a recibir
              </span>
              <span style={{ fontWeight: 700, color: TOKENS.colors.blue3 }}>
                Total: {totals.qty_total.toFixed(2)} uds
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: TOKENS.radius.md,
                  background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                  fontSize: 13, fontWeight: 600, color: TOKENS.colors.textSoft,
                  fontFamily: "'DM Sans', sans-serif", cursor: saving ? 'wait' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || totals.line_count === 0}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: TOKENS.radius.md,
                  background: `linear-gradient(135deg, ${TOKENS.colors.blue3}, #1a70cc)`,
                  fontSize: 13, fontWeight: 700, color: 'white', border: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: saving || totals.line_count === 0 ? 'not-allowed' : 'pointer',
                  opacity: saving || totals.line_count === 0 ? 0.5 : 1,
                }}
              >
                {saving ? 'Guardando…' : 'Guardar recepción'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
