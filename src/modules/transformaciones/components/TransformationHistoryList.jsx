import { TOKENS, getTypo } from '../../../tokens'
import TransformationStateBadges from './TransformationStateBadges'

export default function TransformationHistoryList({ items, sw, onCancel, cancellingId }) {
  const typo = getTypo(sw)
  if (!items.length) {
    return (
      <div style={{ padding: 16, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}` }}>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Sin transformaciones registradas hoy.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item) => (
        <div key={item.transformation_id} style={{
          padding: 14,
          borderRadius: TOKENS.radius.lg,
          background: TOKENS.glass.panelSoft,
          border: `1px solid ${TOKENS.colors.border}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: 0 }}>{item.recipe_code || item.name}</p>
              <div style={{ marginTop: 6 }}>
                <TransformationStateBadges item={item} />
              </div>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '4px 0 0' }}>
                Barras: {Number(item.input_qty_units || item.input_qty || 0).toFixed(0)} · Salida: {Number(item.actual_output_qty_units || item.output_qty_units || 0).toFixed(2)}
              </p>
              <p style={{ ...typo.caption, color: item.irregularity_flag ? TOKENS.colors.warning : TOKENS.colors.success, margin: '4px 0 0' }}>
                Esperado {Number(item.expected_output_qty_units || 0).toFixed(2)} · Variacion {Number(item.variance_units || 0).toFixed(2)}
              </p>
              {item.cancel_reason ? (
                <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>Cancelada: {item.cancel_reason}</p>
              ) : null}
            </div>
            {!item.cancel_reason && item.state !== 'cancelled' ? (
              <button
                onClick={() => onCancel(item)}
                disabled={cancellingId === item.transformation_id}
                style={{
                  height: 34,
                  padding: '0 12px',
                  borderRadius: TOKENS.radius.pill,
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.20)',
                  color: TOKENS.colors.error,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {cancellingId === item.transformation_id ? 'Cancelando...' : 'Cancelar'}
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}
