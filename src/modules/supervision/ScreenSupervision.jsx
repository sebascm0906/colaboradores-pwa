import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import { getActiveShift, getDowntimes, getScraps, getEnergyReadings } from './api'

export default function ScreenSupervision() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [shift, setShift] = useState(null)
  const [downtimes, setDowntimes] = useState([])
  const [scraps, setScraps] = useState([])
  const [energy, setEnergy] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift()
      setShift(s)
      if (s?.id) {
        const [d, sc, en] = await Promise.all([
          getDowntimes(s.id).catch(() => []),
          getScraps(s.id).catch(() => []),
          getEnergyReadings(s.id).catch(() => []),
        ])
        setDowntimes(d || [])
        setScraps(sc || [])
        setEnergy(en || [])
      }
    } catch { /* empty */ }
    finally { setLoading(false) }
  }

  const openDowntimes = downtimes.filter(d => d.state === 'open').length
  const totalDowntimeMin = downtimes.reduce((s, d) => s + (d.minutes || 0), 0)
  const totalScrapKg = scraps.reduce((s, sc) => s + (sc.kg || 0), 0)
  const energyStart = energy.find(e => e.reading_type === 'start')
  const energyEnd = energy.find(e => e.reading_type === 'end')
  const energyKwh = energyStart && energyEnd ? (energyEnd.kwh_value - energyStart.kwh_value) : null

  const ACTIONS = [
    { id: 'paros', label: 'Paros de Línea', desc: openDowntimes > 0 ? `${openDowntimes} activos` : 'Sin paros activos', route: '/supervision/paros',
      color: openDowntimes > 0 ? TOKENS.colors.error : TOKENS.colors.success, badge: openDowntimes || null,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> },
    { id: 'merma', label: 'Merma', desc: `${totalScrapKg.toFixed(1)} kg registrados`, route: '/supervision/merma',
      color: TOKENS.colors.warning,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> },
    { id: 'energia', label: 'Energía', desc: energyKwh !== null ? `${energyKwh.toFixed(1)} kWh` : 'Sin lecturas', route: '/supervision/energia',
      color: TOKENS.colors.blue2,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
    { id: 'mantenimiento', label: 'Mantenimiento', desc: 'Solicitudes de planta', route: '/supervision/mantenimiento',
      color: '#a78bfa',
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> },
    { id: 'turno', label: 'Control de Turno', desc: shift ? `${shift.state === 'in_progress' ? 'Activo' : shift.state}` : 'Gestionar turno', route: '/supervision/turno',
      color: TOKENS.colors.blue3,
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Supervisión de Producción</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {/* KPI Dashboard */}
            {shift && (
              <div style={{
                marginTop: 8, padding: 16, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
                boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 4 }}>TURNO ACTIVO</p>
                    <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{shift.name || `Turno ${shift.shift_code}`}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{shift.date} &middot; {TURNO_LABELS[shift.shift_code] || ''}</p>
                  </div>
                  <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>Score {shift.x_compliance_score || 0}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <KpiMini label="Kg Prod" value={shift.total_kg_produced?.toFixed(0) || '0'} color={TOKENS.colors.blue2} typo={typo} />
                  <KpiMini label="Kg Emp" value={shift.total_kg_packed?.toFixed(0) || '0'} color={TOKENS.colors.success} typo={typo} />
                  <KpiMini label="Ciclos" value={shift.x_cycles_completed || '0'} color={TOKENS.colors.blue3} typo={typo} />
                  <KpiMini label="Paros" value={`${totalDowntimeMin.toFixed(0)}m`} color={openDowntimes > 0 ? TOKENS.colors.error : TOKENS.colors.textMuted} typo={typo} />
                  <KpiMini label="Merma" value={`${totalScrapKg.toFixed(1)}kg`} color={totalScrapKg > 0 ? TOKENS.colors.warning : TOKENS.colors.textMuted} typo={typo} />
                  <KpiMini label="kWh" value={energyKwh !== null ? energyKwh.toFixed(0) : '—'} color={TOKENS.colors.blue2} typo={typo} />
                </div>
              </div>
            )}

            {!shift && (
              <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F3ED;</div>
                <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin turno activo</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno desde Control de Turno.</p>
              </div>
            )}

            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginTop: 24, marginBottom: 12 }}>GESTIÓN</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {ACTIONS.map(a => (
                <button key={a.id} onClick={() => navigate(a.route)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: TOKENS.radius.lg,
                  background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                  boxShadow: TOKENS.shadow.soft, width: '100%', textAlign: 'left', cursor: 'pointer',
                  position: 'relative',
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: TOKENS.radius.md,
                    background: `${a.color}14`, border: `1px solid ${a.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color, flexShrink: 0,
                  }}>{a.icon}</div>
                  <div style={{ flex: 1 }}>
                    <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>{a.label}</p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginTop: 2 }}>{a.desc}</p>
                  </div>
                  {a.badge > 0 && <div style={{ minWidth: 22, height: 22, borderRadius: TOKENS.radius.pill, background: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', padding: '0 6px' }}>{a.badge}</div>}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              ))}
            </div>
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function KpiMini({ label, value, color, typo }) {
  return (
    <div style={{ padding: '8px 6px', borderRadius: TOKENS.radius.sm, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textMuted, margin: 0, letterSpacing: '0.1em' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 700, color, margin: 0, marginTop: 2, letterSpacing: '-0.02em' }}>{value}</p>
    </div>
  )
}
