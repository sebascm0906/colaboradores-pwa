import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getPendingPallets, getInventory, getReadyPallets } from './api'

export default function ScreenAlmacenPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [pending, setPending] = useState([])
  const [inventory, setInventory] = useState([])
  const [ready, setReady] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => { loadData() }, [])

  const warehouseId = session?.warehouse_id || 76 // default Planta Iguala

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const [p, inv, r] = await Promise.all([
        getPendingPallets(warehouseId).catch(() => []),
        getInventory(warehouseId).catch(() => []),
        getReadyPallets(warehouseId).catch(() => []),
      ])
      setPending(p || [])
      setInventory(inv || [])
      setReady(r || [])
    } catch (e) {
      setError('Error cargando datos')
    } finally { setLoading(false) }
  }

  const totalKgStock = inventory.reduce((s, i) => s + (i.quantity * (i.weight || 1)), 0)

  const ACTIONS = [
    {
      id: 'recepcion', label: 'Recepción', desc: `${pending.length} tarimas pendientes`,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
      route: '/almacen-pt/recepcion', color: pending.length > 0 ? TOKENS.colors.warning : TOKENS.colors.success,
      badge: pending.length || null,
    },
    {
      id: 'inventario', label: 'Inventario', desc: `${inventory.length} productos en stock`,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
      route: '/almacen-pt/inventario', color: TOKENS.colors.blue2,
    },
    {
      id: 'despacho', label: 'Despacho', desc: `${ready.length} tarimas listas`,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
      route: '/almacen-pt/despacho', color: TOKENS.colors.success,
      badge: ready.length || null,
    },
    {
      id: 'historial', label: 'Historial', desc: 'Traspasos realizados',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
      route: '/almacen-pt/historial', color: TOKENS.colors.blue3,
    },
  ]

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
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Almacén Producto Terminado</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{
              marginTop: 8, padding: 18, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              display: 'flex', gap: 10,
            }}>
              <StatBox label="Pendientes" value={pending.length} accent={pending.length > 0 ? TOKENS.colors.warning : TOKENS.colors.success} typo={typo} />
              <StatBox label="Productos" value={inventory.length} accent={TOKENS.colors.blue2} typo={typo} />
              <StatBox label="Listas" value={ready.length} accent={TOKENS.colors.success} typo={typo} />
            </div>

            {/* Acciones */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>ACCIONES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(a => (
                <ActionCard key={a.id} action={a} typo={typo} onClick={() => navigate(a.route)} />
              ))}
            </div>

            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value, accent, typo }) {
  return (
    <div style={{ flex: 1, borderRadius: TOKENS.radius.md, padding: '10px', background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}` }}>
      <div style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: typo.h2.fontSize - 2, fontWeight: 700, color: accent, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  )
}

function ActionCard({ action, typo, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        boxShadow: pressed ? 'none' : TOKENS.shadow.soft,
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}`, width: '100%', textAlign: 'left', position: 'relative',
      }}>
      <div style={{
        width: 42, height: 42, borderRadius: TOKENS.radius.md,
        background: `${action.color}14`, border: `1px solid ${action.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: action.color, flexShrink: 0,
      }}>{action.icon}</div>
      <div style={{ flex: 1 }}>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{action.label}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{action.desc}</p>
      </div>
      {action.badge > 0 && (
        <div style={{
          minWidth: 22, height: 22, borderRadius: TOKENS.radius.pill,
          background: action.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'white', padding: '0 6px',
        }}>{action.badge}</div>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  )
}
