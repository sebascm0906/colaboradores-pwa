import { TOKENS } from '../../../tokens'

/* ============================================================================
   StepTimeline — Vertical timeline for the 7 almacenist steps
============================================================================ */

const STATUS_COLORS = {
  locked:      TOKENS.colors.textMuted,
  pending:     TOKENS.colors.warning,
  in_progress: TOKENS.colors.blue2,
  completed:   TOKENS.colors.success,
  alert:       TOKENS.colors.error,
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function StepDot({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.locked
  const isActive = status === 'in_progress'
  const isCompleted = status === 'completed'
  const isLocked = status === 'locked'
  const size = isCompleted ? 22 : 14

  return (
    <div
      style={{
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {isCompleted ? (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CheckIcon />
        </div>
      ) : (
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: isLocked ? 'transparent' : color,
            border: isLocked ? `2px solid ${TOKENS.colors.textMuted}` : 'none',
            boxShadow: isActive ? `0 0 0 4px ${color}33, 0 0 12px ${color}44` : 'none',
            animation: isActive ? 'entregasPulse 2s ease-in-out infinite' : 'none',
          }}
        />
      )}
    </div>
  )
}

export default function StepTimeline({ steps = [], onStepClick, typo }) {
  const t = typo || {}
  const bodyStyle = t.body || { fontSize: 14, fontWeight: 500 }
  const captionStyle = t.caption || { fontSize: 12, fontWeight: 500 }

  return (
    <div style={{ position: 'relative' }}>
      <style>{`
        @keyframes entregasPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
      `}</style>

      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const isLocked = step.status === 'locked'
        const color = STATUS_COLORS[step.status] || STATUS_COLORS.locked

        return (
          <button
            key={step.id}
            onClick={() => !isLocked && onStepClick?.(step)}
            disabled={isLocked}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14,
              width: '100%',
              padding: '0 0 0 0',
              marginBottom: 0,
              background: 'none',
              border: 'none',
              cursor: isLocked ? 'default' : 'pointer',
              opacity: isLocked ? 0.45 : 1,
              textAlign: 'left',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Left column: dot + line */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
                width: 22,
              }}
            >
              <StepDot status={step.status} />
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    height: 36,
                    background: step.status === 'completed'
                      ? TOKENS.colors.success
                      : TOKENS.colors.border,
                    borderRadius: 1,
                    flexShrink: 0,
                  }}
                />
              )}
            </div>

            {/* Right column: label + badge */}
            <div
              style={{
                flex: 1,
                paddingBottom: isLast ? 0 : 20,
                minHeight: isLast ? 22 : 58,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div>
                <span
                  style={{
                    ...bodyStyle,
                    color: step.status === 'in_progress'
                      ? TOKENS.colors.text
                      : TOKENS.colors.textSoft,
                    fontWeight: step.status === 'in_progress' ? 700 : 500,
                    display: 'block',
                    lineHeight: '22px',
                  }}
                >
                  {step.label}
                </span>
                {step.status === 'in_progress' && (
                  <span
                    style={{
                      ...captionStyle,
                      color: TOKENS.colors.blue3,
                      marginTop: 2,
                      display: 'block',
                    }}
                  >
                    En curso
                  </span>
                )}
              </div>

              {step.badge && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: TOKENS.radius.pill,
                    background: `${color}22`,
                    color: color,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: '18px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {step.badge}
                </span>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
