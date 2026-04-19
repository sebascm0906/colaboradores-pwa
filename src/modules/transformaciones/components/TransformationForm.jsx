import { TOKENS, getTypo } from '../../../tokens'

function fieldStyle(hasError) {
  return {
    width: '100%',
    borderRadius: TOKENS.radius.md,
    border: `1px solid ${hasError ? 'rgba(239,68,68,0.30)' : TOKENS.colors.border}`,
    background: TOKENS.colors.surface,
    color: TOKENS.colors.textSoft,
    padding: '12px 14px',
    fontSize: 15,
    outline: 'none',
  }
}

export default function TransformationForm({
  sw,
  roleConfig,
  recipes,
  draft,
  errors,
  onChange,
  onSubmit,
  saving,
}) {
  const typo = getTypo(sw)
  const selectedRecipe = recipes.find((recipe) => recipe.recipe_code === draft.recipe_code) || null
  const inputOptions = selectedRecipe?.input_product_options || []

  return (
    <div style={{
      padding: 16,
      borderRadius: TOKENS.radius.xl,
      background: TOKENS.glass.hero,
      border: `1px solid ${TOKENS.colors.borderBlue}`,
      boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0 }}>NUEVA TRANSFORMACION</p>

      <div>
        <select value={draft.recipe_code} onChange={(event) => onChange('recipe_code', event.target.value)} style={fieldStyle(errors.recipe_code)}>
          <option value="">Selecciona receta...</option>
          {recipes.map((recipe) => (
            <option key={recipe.recipe_code} value={recipe.recipe_code}>{recipe.label}</option>
          ))}
        </select>
        {errors.recipe_code ? <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{errors.recipe_code}</p> : null}
      </div>

      <div>
        <select value={draft.input_product_id} onChange={(event) => onChange('input_product_id', event.target.value)} style={fieldStyle(errors.input_product_id)}>
          <option value="">Producto de entrada...</option>
          {inputOptions.map((option) => (
            <option key={option.product_id} value={option.product_id}>{option.name}</option>
          ))}
        </select>
        {errors.input_product_id ? <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{errors.input_product_id}</p> : null}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder="Barras utilizadas"
            value={draft.input_qty_units}
            onChange={(event) => onChange('input_qty_units', event.target.value)}
            style={fieldStyle(errors.input_qty_units)}
          />
          {errors.input_qty_units ? <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{errors.input_qty_units}</p> : null}
        </div>
        <div style={{ flex: 1 }}>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            placeholder={`${roleConfig.outputUomLabel} producidas`}
            value={draft.output_qty_units}
            onChange={(event) => onChange('output_qty_units', event.target.value)}
            style={fieldStyle(errors.output_qty_units)}
          />
          {errors.output_qty_units ? <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '4px 0 0' }}>{errors.output_qty_units}</p> : null}
        </div>
      </div>

      <textarea
        rows="3"
        placeholder="Notas opcionales"
        value={draft.notes}
        onChange={(event) => onChange('notes', event.target.value)}
        style={{ ...fieldStyle(false), resize: 'vertical' }}
      />

      <button
        onClick={onSubmit}
        disabled={saving}
        style={{
          height: 44,
          borderRadius: TOKENS.radius.pill,
          background: 'linear-gradient(90deg,#15499B,#2B8FE0)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          border: 'none',
        }}
      >
        {saving ? 'Guardando...' : 'Confirmar transformacion'}
      </button>
    </div>
  )
}
