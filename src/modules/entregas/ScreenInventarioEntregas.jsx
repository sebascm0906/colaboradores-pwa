import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { api } from '../../lib/api'

const FILTERS = [
  { key: 'all',      label: 'Todos' },
  { key: 'avail',    label: 'Libre > 0' },
  { key: 'zero',     label: 'Agotados' },
  { key: 'negative', label: 'Negativos' },
]

function fmtNum(n) {
  if (n == null) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000) return n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
  return n.toLocaleString('es-MX', { maximumFractionDigits: 1 })
}

export default function ScreenInventarioEntregas() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || 0

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [filter, setFilter]   = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await api('GET', `/pwa-entregas/live-inventory?warehouse_id=${warehouseId}`)
      setData(res || null)
    } catch {
      setData(null)
    }
    setLoading(false)
  }

  const items = useMemo(() => {
    if (!data?.items) return []
    let list = data.items

    if (filter === 'avail')    list = list.filter(i => i.available_qty > 0)
    if (filter === 'zero')     list = list.filter(i => i.available_qty <= 0 && i.on_hand_qty >= 0)
    if (filter === 'negative') list = list.filter(i => i.on_hand_qty < 0)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(i => i.product_name.toLowerCase().includes(q))
    }
    return list
  }, [data, filter, search])

  const totals = data?.totals || {}
  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .inv-row:hover { background: rgba(255,255,255,0.04); }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/entregas/operacion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Inventario</span>
            {data?.warehouse_name && (
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{data.warehouse_name}</p>
            )}
          </div>
          <button onClick={load} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {/* Totales */}
        {!loading && data && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'En stock', value: fmtNum(totals.on_hand), color: TOKENS.colors.textSoft },
              { label: 'Reservado', value: fmtNum(totals.reserved), color: TOKENS.colors.warning },
              { label: 'Libre', value: fmtNum(totals.available), color: TOKENS.colors.success },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                flex: 1, padding: '10px 8px', borderRadius: TOKENS.radius.md,
                background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center',
              }}>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>{label}</p>
                <p style={{ fontSize: 17, fontWeight: 700, color, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Búsqueda */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          style={{
            width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
            color: 'white', fontSize: 14, outline: 'none', marginBottom: 10,
          }}
        />

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: TOKENS.radius.pill, flexShrink: 0,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: filter === f.key ? TOKENS.colors.blue2 : TOKENS.colors.surface,
                color: filter === f.key ? '#fff' : TOKENS.colors.textMuted,
                border: `1px solid ${filter === f.key ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: `2px solid ${TOKENS.colors.blue2}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{
            padding: 24, borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
            textAlign: 'center',
          }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>
              {search ? `Sin resultados para "${search}"` : 'Sin inventario'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map(item => (
              <ItemRow key={item.product_id} item={item} typo={typo} />
            ))}
          </div>
        )}

        {/* Footer */}
        {generatedAt && !loading && (
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, textAlign: 'center', marginTop: 16 }}>
            Actualizado {generatedAt} · {items.length} producto{items.length !== 1 ? 's' : ''}
          </p>
        )}

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function ItemRow({ item, typo }) {
  const isNegative = item.on_hand_qty < 0
  const isZero     = !isNegative && item.available_qty <= 0
  const hasReserve = item.reserved_qty > 0

  const availColor = isNegative
    ? TOKENS.colors.error
    : isZero
      ? TOKENS.colors.warning
      : TOKENS.colors.success

  return (
    <div className="inv-row" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
      transition: 'background 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.product_name}
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
          stock {fmtNum(item.on_hand_qty)}
          {hasReserve && (
            <span style={{ color: TOKENS.colors.warning }}> · reserv. {fmtNum(item.reserved_qty)}</span>
          )}
        </p>
      </div>
      <div style={{
        padding: '3px 10px', borderRadius: TOKENS.radius.pill, flexShrink: 0, marginLeft: 10,
        background: `${availColor}18`, border: `1px solid ${availColor}35`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: availColor }}>
          {fmtNum(item.available_qty)}
        </span>
      </div>
    </div>
  )
}
