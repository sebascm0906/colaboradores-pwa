// ScreenAlmacenPT.jsx — Hub V2 Almacenista Producto Terminado
// Resumen operativo con siguiente acción, inventario real, semáforo de pendientes.
// Base: stock.quant (real). gf.pallet descartado (0 registros en producción).

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getDaySummary,
  getNextAction,
  getTodayReceptionsLocal,
  getTodayTransfersLocal,
  fmtNum,
  fmtKg,
  DEFAULT_WAREHOUSE_ID,
} from './ptService'

export default function ScreenAlmacenPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const s = await getDaySummary(warehouseId)
      setSummary(s)
    } catch (e) {
      setError(e.message || 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  const todayReceptions = getTodayReceptionsLocal()
  const todayTransfers = getTodayTransfersLocal()
  const next = summary ? getNextAction(summary) : null

  const ACTIONS = [
    {
      id: 'recepcion', label: 'Recibir de producción',
      desc: todayReceptions.length > 0 ? `${todayReceptions.length} recepciones hoy` : 'Registrar lo que llega de planta',
      route: '/almacen-pt/recepcion',
      color: TOKENS.colors.warning,
      icon: 'inbox',
    },
    {
      id: 'inventario', label: 'Inventario',
      desc: summary ? `${fmtNum(summary.inventory?.total_products)} productos · ${fmtKg(summary.inventory?.total_kg)}` : 'Cargando...',
      route: '/almacen-pt/inventario',
      color: TOKENS.colors.blue2,
      icon: 'box',
    },
    {
      id: 'traspaso', label: 'Traspasar a CEDIS',
      desc: todayTransfers.length > 0 ? `${todayTransfers.length} traspasos hoy` : 'Surtir a almacén de entregas',
      route: '/almacen-pt/traspaso',
      color: TOKENS.colors.success,
      icon: 'truck',
    },
    {
      id: 'handover', label: 'Entrega de turno',
      desc: summary?.shift_handover_pending ? 'Turno pendiente de aceptar' : 'Entregar o aceptar turno',
      route: '/almacen-pt/handover',
      color: summary?.shift_handover_pending ? TOKENS.colors.error : TOKENS.colors.blue3,
      icon: 'clock',
    },
    {
      id: 'merma', label: 'Registrar merma',
      desc: 'Producto derretido, roto, caducado...',
      route: '/almacen-pt/merma',
      color: TOKENS.colors.warning,
      icon: 'alert',
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
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Almacén Producto Terminado</span>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>Planta Iguala</p>
          </div>
          <button onClick={loadData} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
            </svg>
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : error ? (
          <div style={{ marginTop: 24, padding: 16, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.25)', textAlign: 'center' }}>
            <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0 }}>{error}</p>
            <button onClick={loadData} style={{ ...typo.caption, color: TOKENS.colors.blue2, fontWeight: 600, marginTop: 8 }}>Reintentar</button>
          </div>
        ) : (
          <>
            {/* Handover pending banner */}
            {summary?.shift_handover_pending && (
              <button
                onClick={() => navigate('/almacen-pt/handover')}
                style={{
                  width: '100%', marginTop: 8, padding: '14px 16px',
                  borderRadius: TOKENS.radius.lg,
                  background: 'linear-gradient(90deg, rgba(239,68,68,0.22), rgba(239,68,68,0.10))',
                  border: `1px solid ${TOKENS.colors.error}`,
                  boxShadow: '0 8px 20px rgba(239,68,68,0.22)',
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: TOKENS.radius.md,
                  background: 'rgba(239,68,68,0.18)', border: `1px solid ${TOKENS.colors.error}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: TOKENS.colors.error, flexShrink: 0,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ ...typo.title, color: TOKENS.colors.error, margin: 0, fontWeight: 700 }}>Turno pendiente de aceptar</p>
                  <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, marginTop: 2 }}>Revisa y confirma la entrega del turno anterior</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.error} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}

            {/* KPI Cards */}
            <div style={{
              marginTop: summary?.shift_handover_pending ? 12 : 8, padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              display: 'flex', gap: 8,
            }}>
              <KpiBox label="Productos" value={fmtNum(summary?.inventory?.total_products || 0)} accent={TOKENS.colors.blue2} typo={typo} />
              <KpiBox label="Unidades" value={fmtNum(summary?.inventory?.total_qty || 0)} accent={TOKENS.colors.blue3} typo={typo} />
              <KpiBox label="Kg total" value={fmtKg(summary?.inventory?.total_kg || 0).replace(' kg', '')} accent={TOKENS.colors.success} typo={typo} sub="kg" />
            </div>

            {/* Inventory by line */}
            {summary?.inventory?.by_line && Object.keys(summary.inventory.by_line).length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {Object.entries(summary.inventory.by_line).map(([line, data]) => (
                  <div key={line} style={{
                    flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.md,
                    background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
                  }}>
                    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>{line}</p>
                    <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, marginTop: 4, fontWeight: 700 }}>{fmtNum(data.qty)} uds</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{fmtKg(data.kg)}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Today activity */}
            {(todayReceptions.length > 0 || todayTransfers.length > 0) && (
              <div style={{
                marginTop: 16, padding: 14, borderRadius: TOKENS.radius.lg,
                background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`,
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginBottom: 8 }}>ACTIVIDAD HOY</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  {todayReceptions.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: TOKENS.colors.warning }} />
                      <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{todayReceptions.length} recepciones</span>
                    </div>
                  )}
                  {todayTransfers.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: TOKENS.colors.success }} />
                      <span style={{ ...typo.caption, color: TOKENS.colors.textSoft }}>{todayTransfers.length} traspasos</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Next Action CTA */}
            {next && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 10 }}>SIGUIENTE ACCIÓN</p>
                <button onClick={() => navigate(next.route)} style={{
                  width: '100%', padding: '16px 18px', borderRadius: TOKENS.radius.lg,
                  background: 'linear-gradient(90deg, #15499B, #2B8FE0)',
                  boxShadow: '0 10px 24px rgba(21,73,155,0.30)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  color: 'white',
                }}>
                  <div>
                    <p style={{ ...typo.title, margin: 0, color: 'white' }}>{next.label}</p>
                    {next.count > 0 && <p style={{ ...typo.caption, margin: 0, marginTop: 2, color: 'rgba(255,255,255,0.7)' }}>{next.count} pendientes</p>}
                  </div>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                </button>
              </>
            )}

            {/* Actions Grid */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 10 }}>OPERACIONES</p>
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

function KpiBox({ label, value, accent, typo, sub }) {
  return (
    <div style={{ flex: 1, borderRadius: TOKENS.radius.md, padding: '10px', background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}` }}>
      <div style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: typo.h2.fontSize - 2, fontWeight: 700, color: accent, letterSpacing: '-0.02em' }}>
        {value}{sub && <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 2 }}>{sub}</span>}
      </div>
    </div>
  )
}

function ActionCard({ action, typo, onClick }) {
  const [pressed, setPressed] = useState(false)

  const iconMap = {
    inbox: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    box: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    truck: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    clock: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
    alert: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  }

  return (
    <button
      onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
        background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
        boxShadow: pressed ? 'none' : TOKENS.shadow.soft,
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: `transform ${TOKENS.motion.fast}`, width: '100%', textAlign: 'left',
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: TOKENS.radius.md,
        background: `${action.color}14`, border: `1px solid ${action.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: action.color, flexShrink: 0,
      }}>
        {iconMap[action.icon] || iconMap.box}
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{action.label}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{action.desc}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>
  )
}
