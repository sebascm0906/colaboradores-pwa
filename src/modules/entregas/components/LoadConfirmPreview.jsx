import { TOKENS } from '../../../tokens'

export default function LoadConfirmPreview({
  rows = [],
  typo,
  unitName = '',
  locationName = '',
  stockVerified = false,
}) {
  if (!rows.length) return null

  const totalRequested = rows.reduce((sum, row) => sum + Number(row.requested || 0), 0)
  const insufficientCount = stockVerified ? rows.filter((row) => !row.sufficient).length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        padding: '12px 14px',
        borderRadius: TOKENS.radius.lg,
        background: 'rgba(43,143,224,0.08)',
        border: '1px solid rgba(43,143,224,0.18)',
      }}>
        <p style={{ margin: 0, color: TOKENS.colors.text, fontSize: 13, fontWeight: 700 }}>
          Resumen previo de carga
        </p>
        <p style={{ margin: '4px 0 0', color: TOKENS.colors.textMuted, fontSize: 12, lineHeight: 1.45 }}>
          {`${locationName || 'CEDIS'} -> ${unitName || 'Unidad'}`}
        </p>
        <p style={{ margin: '6px 0 0', color: TOKENS.colors.textSoft, fontSize: 12, lineHeight: 1.45 }}>
          {rows.length} producto{rows.length !== 1 ? 's' : ''} · {totalRequested} unidad{totalRequested !== 1 ? 'es' : ''}
          {stockVerified
            ? (insufficientCount > 0 ? ` · ${insufficientCount} con faltante` : '')
            : ' · stock sin verificar'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.product_id}
            style={{
              padding: '10px 12px',
              borderRadius: TOKENS.radius.md,
              background: !stockVerified
                ? 'rgba(43,143,224,0.05)'
                : row.sufficient
                  ? 'rgba(34,197,94,0.06)'
                  : 'rgba(239,68,68,0.08)',
              border: `1px solid ${!stockVerified
                ? 'rgba(43,143,224,0.16)'
                : row.sufficient
                  ? 'rgba(34,197,94,0.16)'
                  : 'rgba(239,68,68,0.24)'}`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <p style={{
                margin: 0,
                color: TOKENS.colors.text,
                fontSize: typo?.caption?.fontSize || 12,
                fontWeight: 700,
                flex: 1,
                minWidth: 0,
              }}>
                {row.product_name || `Producto ${row.product_id}`}
              </p>
              <span style={{
                color: !stockVerified ? TOKENS.colors.blue2 : row.sufficient ? TOKENS.colors.success : '#ef4444',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}>
                {!stockVerified ? 'SIN VERIFICAR' : row.sufficient ? 'OK' : 'FALTA'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <MiniMetric label="En almacén" value={stockVerified ? row.onHand : 'N/D'} />
              <MiniMetric label="Se resta" value={row.requested} />
              <MiniMetric
                label="Quedaría"
                value={stockVerified ? row.remaining : 'N/D'}
                valueColor={!stockVerified || row.remaining >= 0 ? TOKENS.colors.text : '#ef4444'}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniMetric({ label, value, valueColor = TOKENS.colors.text }) {
  return (
    <div style={{
      minWidth: 88,
      padding: '7px 9px',
      borderRadius: TOKENS.radius.sm,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <p style={{ margin: 0, color: TOKENS.colors.textMuted, fontSize: 10, fontWeight: 600 }}>
        {label}
      </p>
      <p style={{ margin: '3px 0 0', color: valueColor, fontSize: 13, fontWeight: 700 }}>
        {value}
      </p>
    </div>
  )
}
