import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getLockedForecasts, unlockForecast } from './api'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenForecastUnlock() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)
  const [unlocking, setUnlocking] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const f = await getLockedForecasts()
      setForecasts(Array.isArray(f) ? f : [])
    } catch (e) {
      const msg = logScreenError('ScreenForecastUnlock', 'getLockedForecasts', e)
      setError(msg)
      setForecasts([])
    } finally {
      setLoading(false)
    }
  }

  async function handleUnlock(id) {
    setUnlocking(id)
    setError('')
    try {
      await unlockForecast(id)
      await loadData()
    } catch (e) {
      const msg = logScreenError('ScreenForecastUnlock', 'unlockForecast', e)
      setError(msg)
    } finally {
      setUnlocking(null)
    }
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
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/gerente')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Desbloquear Forecast</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <>
            {error && (
              <div style={{
                marginTop: 8, padding: '10px 14px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: `1px solid ${TOKENS.colors.error}40`,
                fontSize: 12, fontWeight: 600, color: TOKENS.colors.error,
              }}>
                {error}
              </div>
            )}
            {forecasts.length === 0 ? (
              <div style={{
                marginTop: 40, padding: 32, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                textAlign: 'center',
              }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                <p style={{ ...typo.title, color: TOKENS.colors.text }}>Sin forecasts bloqueados</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>No hay forecasts confirmados pendientes.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                {forecasts.map((fc) => {
                  const isUnlocked = fc.state === 'draft' || fc.state === 'unlocked'
                  const stateColor = isUnlocked ? TOKENS.colors.success : TOKENS.colors.warning
                  const stateLabel = isUnlocked ? 'DESBLOQUEADO' : 'CONFIRMADO'
                  const isProcessing = unlocking === fc.id

                  return (
                    <div key={fc.id} style={{
                      padding: '16px', borderRadius: TOKENS.radius.lg,
                      background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
                      boxShadow: TOKENS.shadow.soft,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0, flex: 1 }}>{fc.name || 'Forecast'}</p>
                        <span style={{
                          padding: '3px 10px', borderRadius: TOKENS.radius.pill, fontSize: 10, fontWeight: 700,
                          background: `${stateColor}18`, color: stateColor, letterSpacing: '0.04em',
                        }}>
                          {isUnlocked ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                              {stateLabel}
                            </span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                              {stateLabel}
                            </span>
                          )}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                        <DetailRow label="Fecha objetivo" value={fc.date_target ? new Date(fc.date_target).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'} typo={typo} />
                        <DetailRow label="Sucursal" value={fc.sucursal || '-'} typo={typo} />
                        <DetailRow label="Lineas" value={fc.line_count ?? '-'} typo={typo} />
                        <DetailRow label="Creado por" value={fc.created_by || '-'} typo={typo} />
                      </div>

                      {!isUnlocked && (
                        <button
                          onClick={() => handleUnlock(fc.id)}
                          disabled={isProcessing}
                          style={{
                            width: '100%', padding: '10px 0', borderRadius: TOKENS.radius.md,
                            background: `linear-gradient(135deg, ${TOKENS.colors.warning}, ${TOKENS.colors.blue2})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            opacity: isProcessing ? 0.6 : 1,
                            cursor: isProcessing ? 'wait' : 'pointer',
                          }}
                        >
                          {isProcessing ? (
                            <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
                            {isProcessing ? 'Desbloqueando...' : 'Desbloquear'}
                          </span>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ height: 32 }} />
          </>
        )}
      </div>
    </div>
  )
}

function DetailRow({ label, value, typo }) {
  return (
    <div>
      <p style={{ fontSize: 9, fontWeight: 600, color: TOKENS.colors.textLow, margin: 0, letterSpacing: '0.08em' }}>{label}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textSoft, margin: 0, marginTop: 1 }}>{value}</p>
    </div>
  )
}
