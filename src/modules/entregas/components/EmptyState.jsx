import { TOKENS } from '../../../tokens'

/* ============================================================================
   EmptyState — Placeholder when a list has no items
============================================================================ */

export default function EmptyState({ icon = '📋', title, subtitle, typo }) {
  const t = typo || {}
  const h2Style = t.h2 || { fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }
  const bodyStyle = t.body || { fontSize: 14, fontWeight: 500 }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          fontSize: 48,
          lineHeight: 1,
          marginBottom: 16,
          display: 'block',
        }}
      >
        {icon}
      </span>

      <h3
        style={{
          ...h2Style,
          color: TOKENS.colors.textSoft,
          margin: '0 0 6px 0',
        }}
      >
        {title}
      </h3>

      {subtitle && (
        <p
          style={{
            ...bodyStyle,
            color: TOKENS.colors.textMuted,
            margin: 0,
            maxWidth: 260,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
}
