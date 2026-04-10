// ─── AdminMateriaPrimaForm — Visor de materia prima V2 (desktop) ────────────
// Backend (wrappers `gf_pwa_admin` sobre stock/picking/transformation):
//   GET /pwa-admin/materia-prima/stock?company_id&warehouse_id
//   GET /pwa-admin/materia-prima/receipts?company_id&warehouse_id
//   GET /pwa-admin/materia-prima/consumption?company_id
//
// UI desktop con 3 pestañas:
//   · Stock       → stock.quant del almacén (producto, lote, qty disponible)
//   · Recepciones → stock.picking incoming del día (proveedor / cantidades)
//   · Consumos    → gf.transformation.order del día (input product / qty)
import { useEffect, useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import { useAdmin } from '../AdminContext'
import { getMpStock, getMpReceipts, getMpConsumption } from '../api'
import { BACKEND_CAPS } from '../adminService'
import MpKardexModal from '../components/MpKardexModal'

const TABS = [
  { id: 'stock',       label: 'Stock',       hint: 'Inventario disponible' },
  { id: 'receipts',    label: 'Recepciones', hint: 'Entradas del día' },
  { id: 'consumption', label: 'Consumos',    hint: 'Transformaciones del día' },
]

const nfmt = (n) => Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 3 })
const fmtMoney = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export default function AdminMateriaPrimaForm() {
  const { companyId, companyLabel, warehouseId } = useAdmin()

  const [tab, setTab] = useState('stock')
  const [query, setQuery] = useState('')

  const [stock, setStock] = useState([])
  const [receipts, setReceipts] = useState([])
  const [consumption, setConsumption] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Kardex modal
  const [kardexProduct, setKardexProduct] = useState(null)

  // ── Carga inicial y recarga al cambiar company/warehouse ─────────────────
  useEffect(() => {
    let alive = true
    async function loadAll() {
      if (!companyId) return
      setLoading(true)
      setError('')
      try {
        const [s, r, c] = await Promise.all([
          getMpStock({ companyId, warehouseId }).catch(() => null),
          getMpReceipts({ companyId, warehouseId }).catch(() => null),
          getMpConsumption({ companyId }).catch(() => null),
        ])
        if (!alive) return
        setStock(toRows(s, ['items', 'stock', 'quants']))
        setReceipts(toRows(r, ['items', 'receipts', 'pickings']))
        setConsumption(toRows(c, ['items', 'orders', 'transformations']))
      } catch (e) {
        if (alive) setError(e?.message || 'Error al cargar materia prima')
      } finally {
        if (alive) setLoading(false)
      }
    }
    loadAll()
    return () => { alive = false }
  }, [companyId, warehouseId])

  // ── Filtro por texto ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = tab === 'stock' ? stock : tab === 'receipts' ? receipts : consumption
    if (!q) return base
    return base.filter(row => {
      const hay = [
        row.product_name, row.product_code, row.default_code,
        row.lot_name, row.lot, row.partner_name, row.supplier,
        row.name, row.reference, row.origin,
        row.input_product_name, row.output_product_name,
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [tab, query, stock, receipts, consumption])

  // ── Totales rápidos ──────────────────────────────────────────────────────
  const stockTotal = useMemo(
    () => stock.reduce((s, r) => s + Number(r.qty_available ?? r.quantity ?? 0), 0),
    [stock],
  )
  const receiptsTotal = useMemo(
    () => receipts.reduce((s, r) => s + Number(r.total_qty ?? r.quantity ?? 0), 0),
    [receipts],
  )
  const consumptionTotal = useMemo(
    () => consumption.reduce((s, r) => s + Number(r.input_qty ?? r.quantity ?? 0), 0),
    [consumption],
  )

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
          color: TOKENS.colors.textLow, margin: 0,
        }}>
          MATERIA PRIMA · {companyLabel.toUpperCase()}
        </p>
        <h1 style={{
          fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em',
          color: TOKENS.colors.text, margin: '4px 0 0',
        }}>
          Stock, recepciones y consumos
        </h1>
      </div>

      {!BACKEND_CAPS.materiaPrima && (
        <div style={{
          padding: '10px 14px', borderRadius: TOKENS.radius.sm, marginBottom: 12,
          background: TOKENS.colors.warningSoft, border: `1px solid ${TOKENS.colors.warning}40`,
          fontSize: 12, fontWeight: 600, color: TOKENS.colors.warning,
        }}>
          Endpoints de materia prima no disponibles en este ambiente
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

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 12, marginBottom: 18,
      }}>
        <KpiCard
          label="STOCK TOTAL"
          value={nfmt(stockTotal)}
          hint={`${stock.length} SKU`}
          color={TOKENS.colors.blue3}
        />
        <KpiCard
          label="RECIBIDO HOY"
          value={nfmt(receiptsTotal)}
          hint={`${receipts.length} entradas`}
          color={TOKENS.colors.success}
        />
        <KpiCard
          label="CONSUMIDO HOY"
          value={nfmt(consumptionTotal)}
          hint={`${consumption.length} transformaciones`}
          color={TOKENS.colors.warning}
        />
      </div>

      {/* ── Tabs + búsqueda ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', gap: 4, padding: 4, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          {TABS.map(t => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: '8px 16px', borderRadius: TOKENS.radius.sm,
                  background: active ? `${TOKENS.colors.blue2}22` : 'transparent',
                  border: `1px solid ${active ? TOKENS.colors.blue2 : 'transparent'}`,
                  fontSize: 12, fontWeight: 700, color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filtrar por nombre, SKU, lote, proveedor…"
          style={{
            flex: 1, minWidth: 220,
            padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            fontSize: 13, color: TOKENS.colors.text, outline: 'none',
          }}
        />
      </div>

      {/* ── Tabla por pestaña ───────────────────────────────────────────── */}
      <div style={{
        borderRadius: TOKENS.radius.xl, overflow: 'hidden',
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 50 }}>
            <div style={{
              width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)',
              borderTop: '2px solid #2B8FE0', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: TOKENS.colors.textMuted, margin: 0 }}>
              {query ? 'Sin coincidencias con el filtro' : 'Sin registros en este ambiente'}
            </p>
          </div>
        ) : tab === 'stock' ? (
          <StockTable
            rows={filtered}
            onRowClick={BACKEND_CAPS.mpKardex ? (r) => setKardexProduct(r) : null}
          />
        ) : tab === 'receipts' ? (
          <ReceiptsTable rows={filtered} />
        ) : (
          <ConsumptionTable rows={filtered} />
        )}
      </div>

      <div style={{ height: 40 }} />

      {kardexProduct && (
        <MpKardexModal
          product={kardexProduct}
          companyId={companyId}
          warehouseId={warehouseId}
          onClose={() => setKardexProduct(null)}
        />
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Normaliza la respuesta del backend a un array de filas. */
function toRows(res, fallbackKeys = []) {
  if (!res) return []
  const data = res?.data ?? res
  if (Array.isArray(data)) return data
  for (const k of fallbackKeys) {
    if (Array.isArray(data?.[k])) return data[k]
  }
  return []
}

function KpiCard({ label, value, hint, color }) {
  return (
    <div style={{
      padding: 16, borderRadius: TOKENS.radius.xl,
      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        color: TOKENS.colors.textLow, margin: 0,
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 700, color: color || TOKENS.colors.text,
        margin: '6px 0 2px', letterSpacing: '-0.02em',
      }}>
        {value}
      </p>
      <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: 0 }}>
        {hint}
      </p>
    </div>
  )
}

// ── Sub-tablas ────────────────────────────────────────────────────────────

function HeaderRow({ cols, template }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: template, gap: 10,
      padding: '10px 16px',
      background: TOKENS.colors.surfaceSoft,
      borderBottom: `1px solid ${TOKENS.colors.border}`,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
      color: TOKENS.colors.textLow,
    }}>
      {cols.map((c, i) => (
        <span key={i} style={{ textAlign: c.align || 'left' }}>{c.label}</span>
      ))}
    </div>
  )
}

function DataRow({ children, template }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: template, gap: 10,
      padding: '10px 16px',
      borderBottom: `1px solid ${TOKENS.colors.border}30`,
      fontSize: 12, color: TOKENS.colors.textSoft,
      alignItems: 'center',
    }}>
      {children}
    </div>
  )
}

function StockTable({ rows, onRowClick }) {
  const template = 'minmax(0, 2.5fr) minmax(0, 1.2fr) 90px 90px'
  const clickable = typeof onRowClick === 'function'
  return (
    <div>
      <HeaderRow
        template={template}
        cols={[
          { label: 'PRODUCTO' },
          { label: 'LOTE' },
          { label: 'DISPONIBLE', align: 'right' },
          { label: 'UOM', align: 'right' },
        ]}
      />
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const name = r.product_name || r.name || r.product_id?.[1] || '—'
          const code = r.default_code || r.product_code
          const lot = r.lot_name || r.lot || r.lot_id?.[1] || '—'
          const qty = r.qty_available ?? r.quantity ?? 0
          const uom = r.uom || r.uom_name || r.product_uom?.[1] || 'u'
          const handleClick = clickable ? () => onRowClick(r) : undefined
          const handleKey = clickable
            ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRowClick(r) } }
            : undefined
          return (
            <div
              key={r.id || i}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={handleClick}
              onKeyDown={handleKey}
              style={{
                display: 'grid', gridTemplateColumns: template, gap: 10,
                padding: '10px 16px',
                borderBottom: `1px solid ${TOKENS.colors.border}30`,
                fontSize: 12, color: TOKENS.colors.textSoft,
                alignItems: 'center',
                cursor: clickable ? 'pointer' : 'default',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={clickable ? (e) => { e.currentTarget.style.background = `${TOKENS.colors.blue2}14` } : undefined}
              onMouseLeave={clickable ? (e) => { e.currentTarget.style.background = 'transparent' } : undefined}
            >
              <div style={{ overflow: 'hidden' }}>
                <p style={{
                  margin: 0, fontWeight: 600, color: TOKENS.colors.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {name}
                </p>
                {code && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: TOKENS.colors.textMuted }}>
                    {code}
                  </p>
                )}
              </div>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: TOKENS.colors.textMuted, fontSize: 11,
              }}>
                {lot}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 700,
                color: Number(qty) > 0 ? TOKENS.colors.success : TOKENS.colors.error,
              }}>
                {nfmt(qty)}
              </span>
              <span style={{ textAlign: 'right', color: TOKENS.colors.textMuted, fontSize: 11 }}>
                {uom}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ReceiptsTable({ rows }) {
  const template = 'minmax(0, 1.2fr) minmax(0, 2fr) minmax(0, 1.5fr) 100px 110px'
  return (
    <div>
      <HeaderRow
        template={template}
        cols={[
          { label: 'FOLIO' },
          { label: 'PROVEEDOR' },
          { label: 'PRODUCTO' },
          { label: 'CANTIDAD', align: 'right' },
          { label: 'ESTADO', align: 'right' },
        ]}
      />
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const folio = r.name || r.reference || r.origin || `#${r.id || i}`
          const partner = r.partner_name || r.supplier || r.partner_id?.[1] || '—'
          const product = r.product_name || r.product_id?.[1] || (Array.isArray(r.lines) ? `${r.lines.length} líneas` : '—')
          const qty = r.total_qty ?? r.quantity ?? 0
          const uom = r.uom || r.uom_name || 'u'
          const state = r.state || '—'
          return (
            <DataRow key={r.id || i} template={template}>
              <span style={{
                fontWeight: 600, color: TOKENS.colors.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {folio}
              </span>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {partner}
              </span>
              <span style={{
                color: TOKENS.colors.textMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {product}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 700, color: TOKENS.colors.success,
              }}>
                {nfmt(qty)} {uom}
              </span>
              <span style={{ textAlign: 'right' }}>
                <StateBadge state={state} />
              </span>
            </DataRow>
          )
        })}
      </div>
    </div>
  )
}

function ConsumptionTable({ rows }) {
  const template = 'minmax(0, 1fr) minmax(0, 1.8fr) minmax(0, 1.8fr) 100px 90px'
  return (
    <div>
      <HeaderRow
        template={template}
        cols={[
          { label: 'FOLIO' },
          { label: 'INSUMO' },
          { label: 'PRODUCTO FINAL' },
          { label: 'CANTIDAD', align: 'right' },
          { label: 'ESTADO', align: 'right' },
        ]}
      />
      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        {rows.map((r, i) => {
          const folio = r.name || r.reference || `#${r.id || i}`
          const input = r.input_product_name || r.input_product_id?.[1] || r.product_name || '—'
          const output = r.output_product_name || r.output_product_id?.[1] || '—'
          const qty = r.input_qty ?? r.quantity ?? 0
          const uom = r.input_uom || r.uom_name || 'u'
          const state = r.state || '—'
          return (
            <DataRow key={r.id || i} template={template}>
              <span style={{
                fontWeight: 600, color: TOKENS.colors.text,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {folio}
              </span>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {input}
              </span>
              <span style={{
                color: TOKENS.colors.textMuted,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {output}
              </span>
              <span style={{
                textAlign: 'right', fontWeight: 700, color: TOKENS.colors.warning,
              }}>
                {nfmt(qty)} {uom}
              </span>
              <span style={{ textAlign: 'right' }}>
                <StateBadge state={state} />
              </span>
            </DataRow>
          )
        })}
      </div>
    </div>
  )
}

function StateBadge({ state }) {
  const map = {
    draft:      { label: 'Borrador',  color: TOKENS.colors.textMuted },
    assigned:   { label: 'Asignado',  color: TOKENS.colors.blue2 },
    waiting:    { label: 'Esperando', color: TOKENS.colors.warning },
    confirmed:  { label: 'Confirmado',color: TOKENS.colors.blue2 },
    done:       { label: 'Hecho',     color: TOKENS.colors.success },
    cancel:     { label: 'Cancelado', color: TOKENS.colors.error },
    in_progress:{ label: 'En curso',  color: TOKENS.colors.blue3 },
  }
  const s = map[state] || { label: state || '—', color: TOKENS.colors.textMuted }
  return (
    <span style={{
      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
      background: `${s.color}15`, border: `1px solid ${s.color}30`,
      fontSize: 10, fontWeight: 700, color: s.color,
    }}>
      {s.label}
    </span>
  )
}
