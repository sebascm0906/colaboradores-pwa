import { TOKENS } from '../../tokens'

export default function BrineReadingModal({
  tank,
  typo,
  form,
  errors,
  saveError,
  saving,
  onChange,
  onCancel,
  onSave,
}) {
  if (!tank) return null

  const canClose = !saving

  return (
    <div
      onClick={() => canClose && onCancel()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(3,8,17,0.75)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: `linear-gradient(180deg, ${TOKENS.colors.bg2} 0%, ${TOKENS.colors.bg1} 100%)`,
          borderTop: `1px solid ${TOKENS.colors.border}`,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          padding: 20,
          paddingBottom: 28,
          boxShadow: '0 -20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <p style={{ ...typo.overline, color: TOKENS.colors.blue3, margin: 0 }}>LECTURA DE SALMUERA</p>
        <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: '4px 0 0' }}>{tank.display_name || tank.name}</p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 0' }}>
          Registra la lectura operativa del tanque para habilitar la cosecha del día.
        </p>

        <div style={{ marginTop: 16 }}>
          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
            Nivel de sal
          </label>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            step="0.1"
            value={form.saltLevel}
            onChange={(e) => onChange('saltLevel', e.target.value)}
            placeholder="65.0"
            style={inputStyle}
          />
          {errors.saltLevel && <ErrorText typo={typo} message={errors.saltLevel} />}
        </div>

        <div style={{ marginTop: 14 }}>
          <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
            Temperatura de salmuera (opcional)
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            value={form.brineTemp}
            onChange={(e) => onChange('brineTemp', e.target.value)}
            placeholder="-7.0"
            style={inputStyle}
          />
          {errors.brineTemp && <ErrorText typo={typo} message={errors.brineTemp} />}
        </div>

        {saveError && (
          <div style={{
            marginTop: 12,
            padding: 10,
            borderRadius: TOKENS.radius.sm,
            background: TOKENS.colors.errorSoft,
            border: '1px solid rgba(239,68,68,0.3)',
            color: TOKENS.colors.error,
            ...typo.caption,
            textAlign: 'center',
          }}>
            {saveError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={!canClose}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: TOKENS.radius.md,
              background: TOKENS.colors.surface,
              border: `1px solid ${TOKENS.colors.border}`,
              color: TOKENS.colors.textSoft,
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: TOKENS.radius.md,
              background: 'linear-gradient(90deg, #0f766e, #14b8a6)',
              color: 'white',
              fontSize: 14,
              fontWeight: 700,
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Guardando...' : 'Guardar lectura'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ErrorText({ typo, message }) {
  return (
    <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '6px 0 0' }}>
      {message}
    </p>
  )
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: TOKENS.radius.md,
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${TOKENS.colors.border}`,
  color: 'white',
  fontSize: 16,
  fontWeight: 600,
  outline: 'none',
}
