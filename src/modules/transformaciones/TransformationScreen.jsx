import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { useTransformationCatalog } from './hooks/useTransformationCatalog'
import { useTransformationHistory } from './hooks/useTransformationHistory'
import { cancelTransformation, createTransformation } from './services/transformationsApi'
import TransformationForm from './components/TransformationForm'
import TransformationHistoryList from './components/TransformationHistoryList'
import TransformationSummaryCard from './components/TransformationSummaryCard'
import {
  buildTransformationPayload,
  getRoleScopeConfig,
  getVisibleRecipes,
  validateTransformationDraft,
} from './utils/transformationHelpers'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function TransformationScreen({ roleScope }) {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const roleConfig = getRoleScopeConfig(roleScope)
  const warehouseId = Number(session?.warehouse_id || 0)
  const employeeId = Number(session?.employee_id || 0)
  const [draft, setDraft] = useState({
    recipe_code: '',
    input_product_id: '',
    input_qty_units: '',
    output_qty_units: '',
    notes: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [savingError, setSavingError] = useState('')
  const [summary, setSummary] = useState(null)
  const [cancellingId, setCancellingId] = useState(0)

  const { recipes, loading: catalogLoading, error: catalogError } = useTransformationCatalog(roleScope, warehouseId, employeeId)
  const { history, loading: historyLoading, error: historyError, reload } = useTransformationHistory(roleScope, warehouseId, employeeId, todayIso())

  const visibleRecipes = getVisibleRecipes(recipes)
  const blockedRecipes = recipes.filter((recipe) => !recipe.active)

  function updateDraft(field, value) {
    setDraft((current) => {
      const next = { ...current, [field]: value }
      if (field === 'recipe_code') next.input_product_id = ''
      return next
    })
    setErrors((current) => ({ ...current, [field]: '' }))
    setSavingError('')
  }

  async function handleSubmit() {
    const validationErrors = validateTransformationDraft(draft)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return

    setSaving(true)
    setSavingError('')
    try {
      const payload = buildTransformationPayload({
        warehouseId,
        employeeId,
        roleScope,
        recipeCode: draft.recipe_code,
        inputProductId: draft.input_product_id,
        inputQtyUnits: draft.input_qty_units,
        outputQtyUnits: draft.output_qty_units,
        notes: draft.notes,
      })
      const result = await createTransformation(payload)
      setSummary(result)
      setDraft({
        recipe_code: '',
        input_product_id: '',
        input_qty_units: '',
        output_qty_units: '',
        notes: '',
      })
      await reload()
    } catch (err) {
      setSavingError(err.message || 'No se pudo guardar la transformacion')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(item) {
    const reason = window.prompt('Motivo de cancelacion')
    if (!reason || !reason.trim()) return
    setCancellingId(item.transformation_id)
    try {
      await cancelTransformation(roleScope, item.transformation_id, employeeId, reason.trim())
      await reload()
    } catch (err) {
      setSavingError(err.message || 'No se pudo cancelar la transformacion')
    } finally {
      setCancellingId(0)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(roleConfig.backTo)} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: 0 }}>{roleConfig.title}</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>{roleConfig.subtitle}</p>
          </div>
        </div>

        {blockedRecipes.length ? (
          <div style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: TOKENS.radius.lg,
            background: 'rgba(245,158,11,0.10)',
            border: '1px solid rgba(245,158,11,0.20)',
          }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0 }}>
              {blockedRecipes.length} receta(s) bloqueada(s) por configuracion de Odoo.
            </p>
          </div>
        ) : null}

        {savingError ? (
          <div style={{
            marginBottom: 12,
            padding: 12,
            borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.errorSoft,
            border: '1px solid rgba(239,68,68,0.20)',
          }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{savingError}</p>
          </div>
        ) : null}

        <TransformationSummaryCard summary={summary} sw={sw} />
        <div style={{ height: summary ? 12 : 0 }} />

        {catalogError ? (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.20)' }}>
            <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{catalogError}</p>
          </div>
        ) : null}

        <TransformationForm
          sw={sw}
          roleConfig={roleConfig}
          recipes={visibleRecipes}
          draft={draft}
          errors={errors}
          onChange={updateDraft}
          onSubmit={handleSubmit}
          saving={saving || catalogLoading}
        />

        <div style={{ marginTop: 18 }}>
          <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>HISTORIAL DEL DIA</p>
          {historyError ? (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: TOKENS.radius.lg, background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.20)' }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: 0 }}>{historyError}</p>
            </div>
          ) : null}
          {historyLoading ? (
            <div style={{ padding: 16, borderRadius: TOKENS.radius.lg, background: TOKENS.glass.panelSoft, border: `1px solid ${TOKENS.colors.border}` }}>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>Cargando historial...</p>
            </div>
          ) : (
            <TransformationHistoryList items={history} sw={sw} onCancel={handleCancel} cancellingId={cancellingId} />
          )}
        </div>
      </div>
    </div>
  )
}
