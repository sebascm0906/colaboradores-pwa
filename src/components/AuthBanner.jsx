// ─── AuthBanner — banner de "requiere autorización" para montos altos ───────
// Uso en Auxiliar Administrativo (gastos grandes, cierre con diferencia, etc.)
// Visual consistente y accionable.
//
// <AuthBanner
//   level="manager"   // "manager" | "director" | "info"
//   title="Requiere autorización del gerente"
//   reason="Monto mayor a $5,000"
//   details="Se notificará al gerente al enviar este gasto."
// />

import { TOKENS } from '../tokens'

const LEVELS = {
  manager: {
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.35)',
    color: '#fbbf24',
    label: 'REQUIERE AUTORIZACIÓN GERENTE',
    icon: '🔐',
  },
  director: {
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.40)',
    color: '#f87171',
    label: 'REQUIERE AUTORIZACIÓN DIRECCIÓN',
    icon: '🛑',
  },
  info: {
    bg: 'rgba(43,143,224,0.12)',
    border: 'rgba(43,143,224,0.35)',
    color: '#60a5fa',
    label: 'INFORMACIÓN',
    icon: 'ℹ️',
  },
}

export default function AuthBanner({
  level = 'manager',
  title,
  reason,
  details,
}) {
  const c = LEVELS[level] || LEVELS.info

  return (
    <div
      role="status"
      style={{
        padding: '12px 14px',
        borderRadius: TOKENS.radius.md,
        background: c.bg,
        border: `1px solid ${c.border}`,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{c.icon}</span>
      <div style={{ flex: 1 }}>
        <p style={{
          margin: 0, fontSize: 10, fontWeight: 800,
          letterSpacing: '0.1em', color: c.color,
        }}>{c.label}</p>
        {title && (
          <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 700, color: TOKENS.colors.textSoft }}>
            {title}
          </p>
        )}
        {reason && (
          <p style={{ margin: '2px 0 0', fontSize: 12, color: TOKENS.colors.textMuted }}>
            {reason}
          </p>
        )}
        {details && (
          <p style={{ margin: '6px 0 0', fontSize: 11, color: TOKENS.colors.textLow, lineHeight: 1.5 }}>
            {details}
          </p>
        )}
      </div>
    </div>
  )
}
