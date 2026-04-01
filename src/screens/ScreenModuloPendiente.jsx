import { useNavigate, useLocation } from 'react-router-dom'
import { TOKENS, getTypo } from '../tokens'
import { MODULES } from '../modules/registry'
import { useMemo } from 'react'

export default function ScreenModuloPendiente() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const sw        = window.innerWidth
  const typo      = useMemo(() => getTypo(sw), [sw])

  // Buscar el módulo por route actual
  const mod = MODULES.find(m => m.route === location.pathname)

  const title = mod?.pendingLabel ?? 'Módulo en construcción'
  const desc  = mod?.pendingDesc  ?? 'Este módulo estará disponible próximamente.'

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '20px 16px 12px',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>
          {title}
        </span>
      </div>

      {/* Contenido centrado */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        gap: 20,
        textAlign: 'center',
      }}>
        {/* Icono */}
        <div style={{
          width: 80, height: 80,
          borderRadius: TOKENS.radius.xl,
          background: 'linear-gradient(180deg, rgba(43,143,224,0.18), rgba(43,143,224,0.06))',
          border: '1px solid rgba(97,178,255,0.20)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 32px rgba(43,143,224,0.12)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(97,178,255,0.7)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>

        {/* Texto */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>
            {title}
          </h2>
          <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0, lineHeight: 1.6 }}>
            {desc}
          </p>
        </div>

        {/* Badge de estado */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(245,158,11,0.10)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: TOKENS.radius.pill,
          padding: '6px 14px',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#f59e0b',
            animation: 'pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>
            En desarrollo
          </span>
        </div>

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.4; }
          }
        `}</style>
      </div>

      {/* Botón volver */}
      <div style={{ padding: '0 16px 32px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            width: '100%',
            background: TOKENS.colors.surface,
            border: `1px solid ${TOKENS.colors.border}`,
            borderRadius: TOKENS.radius.lg,
            padding: '14px',
            color: TOKENS.colors.textSoft,
            fontSize: 15, fontWeight: 600,
            cursor: 'pointer',
            transition: `opacity ${TOKENS.motion.fast}`,
          }}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  )
}
