// ─── ScreenLiquidaciones — entrada al módulo Liquidaciones V2 ───────────────
// Desktop (≥1024px): AdminShell + AdminLiquidacionesForm consumiendo los
// wrappers /pwa-admin/liquidaciones/* sobre gf_logistics_ops.
// Mobile (<1024px): muestra mensaje "usa la versión desktop" (no hay legacy
// propio del auxiliar — las vistas mobile de ruta las ve el chofer, no este
// rol).
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS } from '../../tokens'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import AdminLiquidacionesForm from './forms/AdminLiquidacionesForm'

export default function ScreenLiquidaciones() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (sw < 1024) return <MobileNotice />

  return (
    <AdminProvider>
      <AdminShell activeBlock="liquidaciones" title="Liquidaciones">
        <AdminLiquidacionesForm />
      </AdminShell>
    </AdminProvider>
  )
}

function MobileNotice() {
  const navigate = useNavigate()
  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
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
          <span style={{ fontSize: 18, fontWeight: 700, color: TOKENS.colors.textSoft }}>Liquidaciones</span>
        </div>

        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 20px',
        }}>
          <div style={{
            padding: 24, borderRadius: TOKENS.radius.xl, textAlign: 'center',
            background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            maxWidth: 320,
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: TOKENS.colors.textLow, margin: '0 0 8px',
            }}>
              LIQUIDACIONES
            </p>
            <p style={{ fontSize: 14, color: TOKENS.colors.textSoft, margin: '0 0 8px' }}>
              La validación de liquidaciones está diseñada para pantallas grandes.
            </p>
            <p style={{ fontSize: 12, color: TOKENS.colors.textMuted, margin: 0 }}>
              Abre la PWA desde una computadora para continuar.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
