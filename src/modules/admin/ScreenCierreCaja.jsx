// ─── ScreenCierreCaja — entrada responsive al cierre del día ────────────────
// Desktop (≥1024px): AdminShell + AdminCierreForm (arqueo formal V2).
// Mobile (<1024px): vista legacy (read-only summary).
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getTodaySales, getTodayExpenses, getCashClosing } from './api'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import AdminCierreForm from './forms/AdminCierreForm'

export default function ScreenCierreCaja() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (sw < 1024) return <MobileCierreCaja />

  return (
    <AdminProvider>
      <AdminShell activeBlock="cierre" title="Cierre del día">
        <AdminCierreForm />
      </AdminShell>
    </AdminProvider>
  )
}

function MobileCierreCaja() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  const warehouseId = session?.warehouse_id || 89
  const sucursal = session?.sucursal || 'Sin sucursal'

  useEffect(() => {
    async function load() {
      try {
        const [s, e] = await Promise.all([
          getTodaySales(warehouseId).catch(() => []),
          getTodayExpenses().catch(() => []),
        ])
        setSales(s || [])
        setExpenses(e || [])
      } catch { setSales([]); setExpenses([]) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const totalVentas = sales.reduce((s, v) => s + (v.total || 0), 0)
  const ventasCount = sales.length
  const totalGastos = expenses.reduce((s, g) => s + (g.amount || 0), 0)
  const gastosCount = expenses.length
  const saldoCaja = totalVentas - totalGastos

  const today = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  function stateBadge(state) {
    const map = {
      draft: { label: 'Borrador', color: TOKENS.colors.textMuted },
      posted: { label: 'Publicado', color: TOKENS.colors.blue2 },
      done: { label: 'Hecho', color: TOKENS.colors.success },
      cancel: { label: 'Cancelado', color: TOKENS.colors.error },
      paid: { label: 'Pagado', color: TOKENS.colors.success },
    }
    const s = map[state] || { label: state || '—', color: TOKENS.colors.textMuted }
    return (
      <span style={{ padding: '3px 8px', borderRadius: TOKENS.radius.pill, background: `${s.color}15`, border: `1px solid ${s.color}30`, fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/admin')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Cierre de Caja</span>
        </div>

        {/* Date + Sucursal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textTransform: 'capitalize' }}>{today}</p>
          <span style={{ padding: '3px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(43,143,224,0.12)', border: '1px solid rgba(43,143,224,0.25)', fontSize: 11, fontWeight: 700, color: TOKENS.colors.blue2 }}>{sucursal}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* Hero card */}
            <div style={{ padding: 20, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.borderBlue}`, boxShadow: TOKENS.shadow.md, marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Ventas ({ventasCount})</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.success, margin: '6px 0 0' }}>${totalVentas.toFixed(2)}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Gastos ({gastosCount})</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.warning, margin: '6px 0 0' }}>${totalGastos.toFixed(2)}</p>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Saldo Caja</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: TOKENS.colors.blue2, margin: '6px 0 0' }}>${saldoCaja.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Detalle Ventas */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>DETALLE VENTAS</p>
            {sales.length === 0 ? (
              <div style={{ padding: 16, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginBottom: 20 }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin movimientos hoy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {sales.map((v, i) => (
                  <div key={v.id || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: TOKENS.radius.md,
                    background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                    border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{v.name || v.folio || '—'}</p>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{v.customer || '—'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {stateBadge(v.state)}
                      <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.success }}>${(v.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Detalle Gastos */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>DETALLE GASTOS</p>
            {expenses.length === 0 ? (
              <div style={{ padding: 16, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center', marginBottom: 20 }}>
                <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>Sin movimientos hoy</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {expenses.map((g, i) => (
                  <div key={g.id || i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: TOKENS.radius.md,
                    background: i % 2 === 0 ? TOKENS.colors.surfaceSoft : 'transparent',
                    border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, fontWeight: 600 }}>{g.name || '—'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {stateBadge(g.state)}
                      <span style={{ fontSize: 14, fontWeight: 700, color: TOKENS.colors.warning }}>${(g.amount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
