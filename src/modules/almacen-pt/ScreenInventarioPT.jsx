import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getInventory } from './api'

export default function ScreenInventarioPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const warehouseId = session?.warehouse_id || 76

  useEffect(() => {
    async function load() {
      try {
        const inv = await getInventory(warehouseId)
        setItems(inv || [])
      } catch { setItems([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = filter
    ? items.filter(i => i.product?.toLowerCase().includes(filter.toLowerCase()))
    : items

  const totalKg = filtered.reduce((s, i) => s + (i.total_kg || i.quantity * (i.weight || 1)), 0)
  const totalProducts = filtered.length

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/almacen-pt')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Inventario PT</span>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input type="text" value={filter} onChange={e => setFilter(e.target.value)}
            placeholder="Buscar producto..."
            style={{
              width: '100%', padding: '10px 14px', borderRadius: TOKENS.radius.md,
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
              color: 'white', fontSize: 14, outline: 'none',
            }}
          />
        </div>

        {/* Summary */}
        <div style={{
          display: 'flex', gap: 10, marginBottom: 16,
        }}>
          <div style={{ flex: 1, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Productos</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{totalProducts}</p>
          </div>
          <div style={{ flex: 1, padding: 12, borderRadius: TOKENS.radius.md, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Total Kg</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: TOKENS.colors.success, margin: 0 }}>{totalKg.toFixed(0)}</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>{filter ? 'Sin resultados' : 'Sin inventario'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map((item, i) => {
              const coverage = item.daily_sales > 0 ? Math.round(item.quantity / item.daily_sales) : null
              const coverageColor = coverage === null ? TOKENS.colors.textMuted : coverage <= 2 ? TOKENS.colors.error : coverage <= 5 ? TOKENS.colors.warning : TOKENS.colors.success
              return (
                <div key={item.product_id || i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                  border: `1px solid ${TOKENS.colors.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.product}
                    </p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
                      {item.quantity} unidades &middot; {(item.total_kg || item.quantity * (item.weight || 1)).toFixed(0)} kg
                    </p>
                  </div>
                  {coverage !== null && (
                    <div style={{
                      padding: '3px 8px', borderRadius: TOKENS.radius.pill,
                      background: `${coverageColor}15`, border: `1px solid ${coverageColor}30`,
                      marginLeft: 8, flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: coverageColor }}>{coverage}d</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
