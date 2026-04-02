import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getReconciliation } from './api'

export default function ScreenConciliacion() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [recon, setRecon] = useState(null)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const p = await getMyRoutePlan(session?.employee_id)
        setPlan(p)
        if (p?.reconciliation_id) {
          const r = await getReconciliation(p.id)
          setRecon(r)
        }
      } catch { /* empty */ }
      finally { setLoading(false) }
    }
    load()
  }, [])

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap'); * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; } button { border: none; background: none; cursor: pointer; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/ruta')} style={{ width: 38, height: 38, borderRadius: TOKENS.radius.md, background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Conciliación</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !recon ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.colors.surfaceSoft, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4CB;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin conciliación</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>{plan ? 'La conciliación se genera al cerrar la ruta.' : 'Sin ruta activa hoy.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 16, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}` }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>CONCILIACIÓN</p>
              <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>{recon.name || 'Conciliación del día'}</p>
              <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: recon.state === 'done' ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${recon.state === 'done' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`, display: 'inline-block', marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: recon.state === 'done' ? TOKENS.colors.success : TOKENS.colors.warning }}>{recon.state === 'done' ? 'COMPLETADA' : 'PENDIENTE'}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <KpiCard label="Cargado" value={recon.qty_loaded?.toFixed(0) || '0'} color={TOKENS.colors.blue2} typo={typo} />
              <KpiCard label="Entregado" value={recon.qty_delivered?.toFixed(0) || '0'} color={TOKENS.colors.success} typo={typo} />
              <KpiCard label="Devuelto" value={recon.qty_returned?.toFixed(0) || '0'} color={TOKENS.colors.warning} typo={typo} />
              <KpiCard label="Merma" value={recon.qty_scrap?.toFixed(0) || '0'} color={TOKENS.colors.error} typo={typo} />
            </div>

            {recon.qty_difference !== 0 && (
              <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: recon.qty_difference > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${recon.qty_difference > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`, textAlign: 'center' }}>
                <span style={{ ...typo.body, color: recon.qty_difference > 0 ? TOKENS.colors.error : TOKENS.colors.success, fontWeight: 700 }}>
                  Diferencia: {recon.qty_difference > 0 ? '+' : ''}{recon.qty_difference?.toFixed(0)} unidades
                </span>
              </div>
            )}
            <div style={{ height: 32 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, color, typo }) {
  return (
    <div style={{ padding: 14, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}` }}>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, marginBottom: 6 }}>{label}</p>
      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color, letterSpacing: '-0.03em' }}>{value}</p>
    </div>
  )
}
