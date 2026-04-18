// ─── Loader / EmptyState / ErrorState — componentes UX consistentes ─────────
// Reemplazan los 20+ loaders y empty states duplicados en la app.
// Todos comparten el diseño del design system (TOKENS).

import { TOKENS } from '../tokens'

export function Loader({ label, size = 32, center = true }) {
  const spinner = (
    <div style={{
      width: size, height: size,
      border: '2px solid rgba(255,255,255,0.12)',
      borderTop: `2px solid ${TOKENS.colors.blue2}`,
      borderRadius: '50%',
      animation: 'gfSpin 0.8s linear infinite',
    }} />
  )
  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {spinner}
      {label && (
        <p style={{
          margin: 0, fontSize: 13, color: TOKENS.colors.textMuted,
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {label}
        </p>
      )}
      <style>{`@keyframes gfSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
  if (!center) return content
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', minHeight: 160,
    }}>
      {content}
    </div>
  )
}

export function EmptyState({ icon = '📭', title = 'Sin datos', subtitle, action }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '60px 20px', textAlign: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{ fontSize: 40, lineHeight: 1 }}>{icon}</div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TOKENS.colors.textSoft }}>{title}</p>
      {subtitle && (
        <p style={{ margin: 0, fontSize: 13, color: TOKENS.colors.textMuted, maxWidth: 320, lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      {action}
    </div>
  )
}

export function ErrorState({ title = 'Ocurrió un error', message, onRetry }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '60px 20px', textAlign: 'center',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
      }}>⚠️</div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: TOKENS.colors.error }}>{title}</p>
      {message && (
        <p style={{ margin: 0, fontSize: 13, color: TOKENS.colors.textMuted, maxWidth: 320, lineHeight: 1.5 }}>
          {message}
        </p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: 4, border: 'none', cursor: 'pointer', padding: '10px 22px',
            borderRadius: TOKENS.radius.pill,
            background: 'linear-gradient(90deg,#15499B,#2B8FE0)',
            color: 'white', fontSize: 13, fontWeight: 700,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  )
}
