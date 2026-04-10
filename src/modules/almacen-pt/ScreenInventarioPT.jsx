// ScreenInventarioPT.jsx — V2 Inventario Producto Terminado
// Agrupado por ubicación (ROLITO/BARRA), semáforo FIFO, búsqueda, totales.
// Base: stock.quant (real).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getInventoryGrouped,
  getFIFOStatus,
  fmtNum,
  fmtKg,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'

export default function ScreenInventarioPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const g = await getInventoryGrouped(warehouseId)
      setGroups(g || [])
    } catch {
      setGroups([])
    }
    setLoading(false)
  }

  // Flatten for search
  const allItems = groups.flatMap(g => g.items.map(i => ({ ...i, group: g.line })))
  const filtered = filter
    ? allItems.filter(i => (i.product || i.product_name || '').toLowerCase().includes(filter.toLowerCase()))
    : null

  const totalQty = allItems.reduce((s, i) => s + (i.quantity || 0), 0)
  const totalKg = allItems.reduce((s, i) => s + (i.total_kg || 0), 0)
  const totalProducts = allItems.length

  // Find oldest items for FIFO alert
  const oldItems = allItems.filter(i => {
    const fifo = getFIFOStatus(i.in_date)
    return fifo.status === 'old'
  })

  const LINE_COLORS = {
    ROLITO: TOKENS.colors.blue2,
    BARRA: TOKENS.colors.warning,
    OTRO: TOKENS.colors.textMuted,
  }

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
          <button onClick={loadData} style={{
            marginLeft: 'auto', width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {/* Summary */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 12,
        }}>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Productos</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{totalProducts}</p>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Unidades</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.blue3, margin: 0 }}>{fmtNum(totalQty)}</p>
          </div>
          <div style={{ flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Total Kg</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.success, margin: 0 }}>{fmtNum(totalKg)}</p>
          </div>
        </div>

        {/* FIFO Alert */}
        {oldItems.length > 0 && (
          <div style={{
            marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.md,
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0, fontWeight: 700 }}>
              FIFO: {oldItems.length} producto{oldItems.length > 1 ? 's' : ''} con mas de 7 dias
            </p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 4 }}>
              {oldItems.slice(0, 3).map(i => i.product || i.product_name).join(', ')}
              {oldItems.length > 3 ? ` y ${oldItems.length - 3} mas` : ''}
            </p>
          </div>
        )}

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

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered ? (
          /* Search results (flat) */
          filtered.length === 0 ? (
            <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
              <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin resultados para "{filter}"</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((item, i) => (
                <InventoryRow key={item.id || i} item={item} typo={typo} />
              ))}
            </div>
          )
        ) : (
          /* Grouped by line */
          groups.length === 0 ? (
            <div style={{ padding: 20, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
              <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin inventario</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {groups.map(group => (
                <div key={group.line}>
                  {/* Group header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 8, paddingBottom: 6,
                    borderBottom: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: 5,
                        background: LINE_COLORS[group.line] || TOKENS.colors.textMuted,
                      }} />
                      <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>{group.line}</span>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>{group.location}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
                        {fmtNum(group.total_qty)} uds · {fmtKg(group.total_kg)}
                      </span>
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {group.items.map((item, i) => (
                      <InventoryRow key={item.id || i} item={item} typo={typo} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* FIFO note */}
        <div style={{
          marginTop: 20, padding: 10, borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
            Semaforo FIFO: dias desde in_date en stock.quant. Nota: in_date puede no ser confiable (Decision D8 pendiente).
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <span style={{ ...typo.caption, color: TOKENS.colors.success }}>● {'<'}3d OK</span>
            <span style={{ ...typo.caption, color: TOKENS.colors.warning }}>● 3-7d Viejo</span>
            <span style={{ ...typo.caption, color: TOKENS.colors.error }}>● {'>'}7d Urgente</span>
          </div>
        </div>

        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}

function InventoryRow({ item, typo }) {
  const fifo = getFIFOStatus(item.in_date)
  const qty = item.quantity || 0
  const kg = item.total_kg || 0
  const reserved = item.reserved || 0

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderRadius: TOKENS.radius.md,
      background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.product || item.product_name || 'Producto'}
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>
          {fmtNum(qty)} uds · {fmtKg(kg)}
          {reserved > 0 && <span style={{ color: TOKENS.colors.warning }}> · {fmtNum(reserved)} reserv.</span>}
        </p>
      </div>
      {/* FIFO badge */}
      {fifo.days !== null && (
        <div style={{
          padding: '3px 8px', borderRadius: TOKENS.radius.pill,
          background: `${fifo.color}15`, border: `1px solid ${fifo.color}30`,
          marginLeft: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: fifo.color }}>{fifo.label}</span>
        </div>
      )}
    </div>
  )
}
