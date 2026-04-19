import { TOKENS } from '../tokens'
import { ROLE_LABELS } from '../lib/roleContext'

export default function ModuleRolePrompt({
  title = 'Selecciona un puesto',
  subtitle = 'Este módulo cambia según el puesto con el que lo abras.',
  roles = [],
  onSelect,
  onCancel,
}) {
  if (!Array.isArray(roles) || roles.length === 0) return null

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 16,
      paddingRight: 16,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: 20,
        borderRadius: TOKENS.radius.xl,
        background: TOKENS.glass.hero,
        border: `1px solid ${TOKENS.colors.borderBlue}`,
        boxShadow: TOKENS.shadow.soft,
      }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: TOKENS.colors.textLow, margin: 0 }}>
          CONTEXTO DE ACCESO
        </p>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: TOKENS.colors.text, margin: '8px 0 0' }}>
          {title}
        </h1>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.colors.textMuted, margin: '10px 0 0' }}>
          {subtitle}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
          {roles.map((role) => (
            <button
              key={role}
              onClick={() => onSelect?.(role)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: TOKENS.radius.lg,
                background: TOKENS.glass.panel,
                border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text,
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              {ROLE_LABELS[role] || role}
            </button>
          ))}
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: 14,
              width: '100%',
              padding: '12px 16px',
              borderRadius: TOKENS.radius.pill,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Volver
          </button>
        )}
      </div>
    </div>
  )
}
