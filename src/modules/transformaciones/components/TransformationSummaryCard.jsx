import { TOKENS, getTypo } from '../../../tokens'

export default function TransformationSummaryCard({ summary, sw }) {
  if (!summary) return null
  const typo = getTypo(sw)
  return (
    <div style={{
      padding: 14,
      borderRadius: TOKENS.radius.lg,
      background: summary.irregularity_flag ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)',
      border: `1px solid ${summary.irregularity_flag ? 'rgba(245,158,11,0.25)' : 'rgba(34,197,94,0.25)'}`,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>ULTIMA TRANSFORMACION</p>
      <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: '6px 0 0' }}>{summary.recipe_code || 'Transformacion confirmada'}</p>
      <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
        Esperado: {Number(summary.expected_output_qty_units || 0).toFixed(2)} · Real: {Number(summary.actual_output_qty_units || 0).toFixed(2)} · Variacion: {Number(summary.variance_units || 0).toFixed(2)}
      </p>
    </div>
  )
}
