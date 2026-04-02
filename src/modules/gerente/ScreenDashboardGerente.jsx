import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'

export default function ScreenDashboardGerente() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [iframeLoading, setIframeLoading] = useState(true)

  useEffect(() => {
    const h = () => setSw(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const metabaseUrl = import.meta.env.VITE_METABASE_URL || ''

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/gerente')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Dashboard Gerente</span>
        </div>
      </div>

      {metabaseUrl ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px 16px', position: 'relative' }}>
          {iframeLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'absolute', inset: 0, zIndex: 1 }}>
              <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          <iframe
            src={metabaseUrl}
            onLoad={() => setIframeLoading(false)}
            style={{
              flex: 1, width: '100%', minHeight: 'calc(100dvh - 90px)',
              border: 'none', borderRadius: TOKENS.radius.xl,
              background: TOKENS.colors.surface,
            }}
            title="Dashboard Gerente"
            allow="fullscreen"
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <div style={{
            padding: 24, borderRadius: TOKENS.radius.xl,
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            textAlign: 'center', maxWidth: 320,
          }}>
            <p style={{ ...typo.title, color: TOKENS.colors.text }}>Dashboard no configurado</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 8 }}>Configura la variable VITE_METABASE_URL para habilitar el dashboard.</p>
          </div>
        </div>
      )}
    </div>
  )
}
