import { TOKENS } from '../../../tokens'

/* ============================================================================
   StatusBadge — Reusable status chip for steps, tickets, pallets, etc.
============================================================================ */

const STATUS_MAP = {
  pending:     { color: TOKENS.colors.warning,  bg: TOKENS.colors.warningSoft, label: 'Pendiente' },
  draft:       { color: TOKENS.colors.warning,  bg: TOKENS.colors.warningSoft, label: 'Borrador' },
  completed:   { color: TOKENS.colors.success,  bg: TOKENS.colors.successSoft, label: 'Completado' },
  done:        { color: TOKENS.colors.success,  bg: TOKENS.colors.successSoft, label: 'Hecho' },
  received:    { color: TOKENS.colors.success,  bg: TOKENS.colors.successSoft, label: 'Recibido' },
  dispatched:  { color: TOKENS.colors.success,  bg: TOKENS.colors.successSoft, label: 'Despachado' },
  in_progress: { color: TOKENS.colors.blue2,    bg: 'rgba(43,143,224,0.12)',   label: 'En progreso' },
  published:   { color: TOKENS.colors.blue2,    bg: 'rgba(43,143,224,0.12)',   label: 'Publicado' },
  sale:        { color: TOKENS.colors.blue2,    bg: 'rgba(43,143,224,0.12)',   label: 'Venta' },
  alert:       { color: TOKENS.colors.error,    bg: TOKENS.colors.errorSoft,   label: 'Alerta' },
  error:       { color: TOKENS.colors.error,    bg: TOKENS.colors.errorSoft,   label: 'Error' },
  rejected:    { color: TOKENS.colors.error,    bg: TOKENS.colors.errorSoft,   label: 'Rechazado' },
  locked:      { color: TOKENS.colors.textMuted, bg: 'rgba(255,255,255,0.06)', label: 'Bloqueado' },
  hold:        { color: TOKENS.colors.textMuted, bg: 'rgba(255,255,255,0.06)', label: 'En espera' },
}

const FALLBACK = { color: TOKENS.colors.textMuted, bg: 'rgba(255,255,255,0.06)', label: '—' }

export default function StatusBadge({ status, label }) {
  const cfg = STATUS_MAP[status] || FALLBACK
  const displayLabel = label || cfg.label

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: TOKENS.radius.pill,
        background: cfg.bg,
        fontSize: 11,
        fontWeight: 600,
        color: cfg.color,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        lineHeight: '18px',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
          flexShrink: 0,
        }}
      />
      {displayLabel}
    </span>
  )
}
