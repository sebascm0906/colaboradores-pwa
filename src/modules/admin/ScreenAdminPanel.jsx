// ─── ScreenAdminPanel — entrada del rol Auxiliar Administrativo ─────────────
// Wrapper responsive:
//   - ≥1024px  → AdminShell (desktop) + HubV2
//   - < 1024px → vista mobile legacy (tarjetas verticales)
// La vista mobile queda como fallback hasta que tengamos diseño mobile V2.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { getTodaySales, getTodayExpenses } from './api'
import { logScreenError } from '../shared/logScreenError'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import HubV2 from './components/HubV2'

export default function ScreenAdminPanel() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (sw < 1024) return <MobileAdminHub />

  return (
    <AdminProvider>
      <AdminShell activeBlock="hub" title="Administración de sucursal">
        <HubV2 />
      </AdminShell>
    </AdminProvider>
  )
}

// ── Vista mobile legacy (fallback) ──────────────────────────────────────────
function MobileAdminHub() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [salesCount, setSalesCount] = useState(0)
  const [expensesCount, setExpensesCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const warehouseId = session?.warehouse_id || 89

  useEffect(() => {
    let alive = true
    async function loadData() {
      setLoading(true)
      try {
        const [sales, expenses] = await Promise.all([
          getTodaySales(warehouseId).catch((e) => { logScreenError('ScreenAdminPanel', 'getTodaySales', e); return [] }),
          getTodayExpenses().catch((e) => { logScreenError('ScreenAdminPanel', 'getTodayExpenses', e); return [] }),
        ])
        if (!alive) return
        setSalesCount(Array.isArray(sales) ? sales.length : 0)
        setExpensesCount(Array.isArray(expenses) ? expenses.length : 0)
      } catch (e) { logScreenError('ScreenAdminPanel', 'loadData', e) }
      finally { if (alive) setLoading(false) }
    }
    loadData()
    return () => { alive = false }
  }, [warehouseId])

  const ACTIONS = [
    { id: 'pos',              label: 'POS Mostrador',      desc: 'Punto de venta mostrador',   route: '/admin/pos',              color: TOKENS.colors.success, badge: salesCount || null },
    { id: 'gastos',           label: 'Gastos',             desc: 'Registrar gastos del día',   route: '/admin/gastos',           color: TOKENS.colors.warning, badge: expensesCount || null },
    { id: 'historial_gastos', label: 'Historial de Gastos',desc: 'Consultar gastos',            route: '/admin/gastos-historial', color: TOKENS.colors.blue3 },
    { id: 'requisiciones',    label: 'Requisiciones',      desc: 'Solicitudes de compra',       route: '/admin/requisiciones',    color: TOKENS.colors.blue2 },
    { id: 'cierre',           label: 'Cierre de Caja',     desc: 'Resumen y cierre del día',    route: '/admin/cierre',           color: TOKENS.colors.blue3 },
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Administración Sucursal</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>ACCIONES</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(a => (
                <MobileActionCard key={a.id} action={a} typo={typo} onClick={() => navigate(a.route)} />
              ))}
            </div>
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function MobileActionCard({ action, typo, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
        borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel,
        border: `1px solid ${TOKENS.colors.border}`,
        boxShadow: pressed ? 'none' : TOKENS.shadow.soft,
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}`,
        width: '100%', textAlign: 'left', position: 'relative',
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: TOKENS.radius.md,
        background: `${action.color}14`, border: `1px solid ${action.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: action.color, flexShrink: 0,
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: action.color }} />
      </div>
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
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18l6-6-6-6"/>
      </svg>
    </button>
  )
}
