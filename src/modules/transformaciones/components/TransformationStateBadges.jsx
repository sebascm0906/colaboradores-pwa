import { TOKENS } from '../../../tokens'
import { normalizeTransformationUiState } from '../utils/transformationState'

const TONE_MAP = {
  success: {
    color: TOKENS.colors.success,
    background: 'rgba(34,197,94,0.10)',
    border: 'rgba(34,197,94,0.20)',
  },
  warning: {
    color: TOKENS.colors.warning,
    background: 'rgba(245,158,11,0.10)',
    border: 'rgba(245,158,11,0.20)',
  },
  error: {
    color: TOKENS.colors.error,
    background: TOKENS.colors.errorSoft,
    border: 'rgba(239,68,68,0.20)',
  },
  muted: {
    color: TOKENS.colors.textMuted,
    background: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.10)',
  },
}

function badgeStyle(tone) {
  const config = TONE_MAP[tone] || TONE_MAP.muted
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 10px',
    borderRadius: TOKENS.radius.pill,
    background: config.background,
    border: `1px solid ${config.border}`,
    color: config.color,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
  }
}

export default function TransformationStateBadges({ item }) {
  const { primary, secondary } = normalizeTransformationUiState(item)

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      <span style={badgeStyle(primary?.tone)}>{primary?.label}</span>
      {secondary ? <span style={badgeStyle(secondary.tone)}>{secondary.label}</span> : null}
    </div>
  )
}
