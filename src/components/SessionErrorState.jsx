// ─── SessionErrorState — pantalla de error cuando falta contexto de sesión ──
// Se muestra cuando requireWarehouse/requireCompany/requireEmployee lanzan
// SessionIncompleteError. La usamos en los catch de cada pantalla.
//
// Diseño: clara, actionable, sin tecnicismos para el usuario final.

import { useNavigate } from 'react-router-dom'
import { TOKENS } from '../tokens'

export default function SessionErrorState({ error, onRetry, backTo = '/' }) {
  const navigate = useNavigate()
  const missing = error?.missing || 'contexto'
  const userMessage = error?.userMessage
    || `No pudimos cargar esta pantalla porque tu sesión no tiene "${missing}".`

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'DM Sans', sans-serif", gap: 16,
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
      }}>⚠️</div>

      <p style={{ color: TOKENS.colors.textSoft, fontSize: 18, fontWeight: 700, margin: 0, textAlign: 'center' }}>
        Sesión incompleta
      </p>
      <p style={{ color: TOKENS.colors.textMuted, fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 320, lineHeight: 1.5 }}>
        {userMessage}
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              cursor: 'pointer', padding: '12px 24px',
              borderRadius: TOKENS.radius.pill,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft, fontSize: 13, fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Reintentar
          </button>
        )}
        <button
          onClick={() => navigate(backTo)}
          style={{
            border: 'none', cursor: 'pointer', padding: '12px 24px',
            borderRadius: TOKENS.radius.pill,
            background: 'linear-gradient(90deg,#15499B,#2B8FE0)',
            color: 'white', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit',
          }}
        >
          Volver al inicio
        </button>
      </div>
    </div>
  )
}
