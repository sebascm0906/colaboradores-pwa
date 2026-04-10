// ─── MpKardexModal — Kardex de movimientos de materia prima ────────────────
// Muestra los movimientos (stock.move) de un producto en un rango de fechas
// vía GET /pwa-admin/materia-prima/moves?product_id&company_id&warehouse_id&date_from&date_to
import { useEffect, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { getMpMoves } from '../api'

const nfmt = (n) => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 })

export default function MpKardexModal({ product, companyId, warehouseId, onClose }) {
  const today = new Date()
  const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
  const toIso = (d) => d.toISOString().slice(0, 10)

  const [dateFrom, setDateFrom] = useState(toIso(monthAgo))
  const [dateTo, setDateTo] = useState(toIso(today))
  const [moves, setMoves] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const productId = product?.product_id || product?.id
  const productName = product?.product_name || product?.name || product?.product_id_display || `#${productId}`
  const uom = product?.uom || product?.uom_name || 'u'

  useEffect(() => {
    let alive = true
    async function load() {
      if (!productId) return
      setLoading(true)
      setError('')
      try {
        const res = await getMpMoves({
          productId,
          companyId,
          warehouseId,
          dateFrom,
          dateTo,
          limit: 200,
        })
        const data = res?.data ?? res
        const rows = Array.isArray(data)
          ? data
          : (Array.isArray(data?.moves) ? data.moves : (Array.isArray(data?.items) ? data.items : []))
        if (alive) setMoves(rows)
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar kardex')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [productId, companyId, warehouseId, dateFrom, dateTo])

  // Runnig balance (opcional si el backend no lo trae)
  const computedMoves = (() => {
    let running = 0
    return moves.map(m => {
      const inQty = Number(m.qty_in ?? m.quantity_in ?? 0)
      const outQty = Number(m.qty_out ?? m.quantity_out ?? 0)
      const delta = m.delta != null ? Number(m.delta) : (inQty - outQty)
      running += delta
      return { ...m, _delta: delta, _running: m.balance != null ? Number(m.balance) : running }
    })
  })()

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(8, 14, 24, 0.72)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 920,
          maxHeight: 'calc(100dvh - 48px)',
          display: 'flex', flexDirection: 'column',
          borderRadius: TOKENS.radius.xl,
          background: TOKENS.glass.panel,
          border: `1px solid ${TOKENS.colors.border}`,
          boxShadow: '0 30px 90px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '18px 22px',
          borderBottom: `1px solid ${TOKENS.colors.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: TOKENS.colors.textLow, margin: 0,
            }}>
              KARDEX DE MATERIA PRIMA
            </p>
            <h2 style={{
              fontSize: 18, fontWeight: 700, color: TOKENS.colors.text,
              margin: '4px 0 0', letterSpacing: '-0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {productName}
            </h2>
            {(product?.default_code || product?.product_code) && (
              <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                {product.default_code || product.product_code}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft, cursor: 'pointer',
              fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Filtros de fecha ────────────────────────────────────────────── */}
        <div style={{
          padding: '14px 22px',
          borderBottom: `1px solid ${TOKENS.colors.border}`,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
          background: TOKENS.colors.surfaceSoft,
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
                padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface,
                border: `1px solid ${TOKENS.colors.border}`,
                fontSize: 12, color: TOKENS.colors.text,
                fontFamily: "'DM Sans', sans-serif",
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
                padding: '8px 12px', borderRadius: TOKENS.radius.sm,
                background: TOKENS.colors.surface,
                border: `1px solid ${TOKENS.colors.border}`,
                fontSize: 12, color: TOKENS.colors.text,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </label>
        </div>

        {/* ── Tabla de movimientos ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
              <div style={{
                width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
                borderTop: '2px solid #2B8FE0', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
            </div>
          ) : error ? (
            <div style={{
              margin: 16, padding: '10px 14px',
              borderRadius: TOKENS.radius.sm,
              background: TOKENS.colors.errorSoft,
              border: `1px solid ${TOKENS.colors.error}40`,
              fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
            }}>
              {error}
            </div>
          ) : computedMoves.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
                Sin movimientos en este rango
              </p>
            </div>
          ) : (
            <div>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '110px minmax(0, 1.4fr) minmax(0, 1fr) 80px 80px 90px',
                gap: 10, padding: '10px 22px',
                position: 'sticky', top: 0,
                background: TOKENS.colors.surfaceSoft,
                borderBottom: `1px solid ${TOKENS.colors.border}`,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                color: TOKENS.colors.textLow,
                zIndex: 1,
              }}>
                <span>FECHA</span>
                <span>ORIGEN</span>
                <span>REFERENCIA</span>
                <span style={{ textAlign: 'right' }}>ENTRADA</span>
                <span style={{ textAlign: 'right' }}>SALIDA</span>
                <span style={{ textAlign: 'right' }}>SALDO</span>
              </div>

              {/* Rows */}
              {computedMoves.map((m, i) => {
                const fecha = m.date || m.date_done || m.create_date || '—'
                const origen = m.location_from || m.origin_name || m.origin || m.source_name || '—'
                const ref = m.reference || m.name || m.picking_name || m.move_name || '—'
                const inQty = Number(m.qty_in ?? m.quantity_in ?? (m._delta > 0 ? m._delta : 0))
                const outQty = Number(m.qty_out ?? m.quantity_out ?? (m._delta < 0 ? -m._delta : 0))
                return (
                  <div key={m.id || i} style={{
                    display: 'grid',
                    gridTemplateColumns: '110px minmax(0, 1.4fr) minmax(0, 1fr) 80px 80px 90px',
                    gap: 10, padding: '10px 22px',
                    borderBottom: `1px solid ${TOKENS.colors.border}30`,
                    fontSize: 11, color: TOKENS.colors.textSoft,
                    alignItems: 'center',
                  }}>
                    <span style={{ color: TOKENS.colors.textMuted, fontSize: 10 }}>
                      {typeof fecha === 'string' ? fecha.slice(0, 16).replace('T', ' ') : fecha}
                    </span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: TOKENS.colors.text, fontWeight: 600,
                    }}>
                      {origen}
                    </span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: TOKENS.colors.textMuted, fontSize: 10,
                    }}>
                      {ref}
                    </span>
                    <span style={{
                      textAlign: 'right', fontWeight: 700,
                      color: inQty > 0 ? TOKENS.colors.success : TOKENS.colors.textLow,
                    }}>
                      {inQty > 0 ? nfmt(inQty) : '—'}
                    </span>
                    <span style={{
                      textAlign: 'right', fontWeight: 700,
                      color: outQty > 0 ? TOKENS.colors.error : TOKENS.colors.textLow,
                    }}>
                      {outQty > 0 ? nfmt(outQty) : '—'}
                    </span>
                    <span style={{
                      textAlign: 'right', fontWeight: 700, color: TOKENS.colors.blue3,
                    }}>
                      {nfmt(m._running)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 22px',
          borderTop: `1px solid ${TOKENS.colors.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: TOKENS.colors.surfaceSoft,
          fontSize: 11, color: TOKENS.colors.textMuted,
        }}>
          <span>
            {computedMoves.length} movimiento{computedMoves.length === 1 ? '' : 's'} · UOM: {uom}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 18px', borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              fontSize: 12, fontWeight: 600, color: TOKENS.colors.textSoft,
              fontFamily: "'DM Sans', sans-serif", cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
