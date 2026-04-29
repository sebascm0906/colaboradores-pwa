import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyRoutePlan, getVehicleChecklist, submitVehicleCheck, completeVehicleChecklist, createVehicleChecklistShift, initVehicleChecklist, getVehicleChecks } from './api'
import { logScreenError } from '../shared/logScreenError'
import {
  normalizeChecklistPhotoValue,
  readFileAsDataURL,
  validateChecklistPhotoFile,
} from '../shared/checklistPhoto'

const CHECK_ICONS = {
  yes_no:  '\u2713',
  numeric: '#',
  photo:   '\ud83d\udcf7',
}

export default function ScreenChecklistUnidad() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const [loading, setLoading] = useState(true)
  const [checklist, setChecklist] = useState(null)
  const [checks, setChecks] = useState([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef(null)
  const [photoCheckId, setPhotoCheckId] = useState(null)

  useEffect(() => { loadChecklist() }, [])

  async function loadChecklist() {
    setLoading(true)
    try {
      const empId = session?.employee_id
      // 1. Buscar checklist existente para este empleado hoy
      const plan = await getMyRoutePlan(empId)
      let data = await getVehicleChecklist(plan?.id || 0)

      // 2. Si no existe, crear: dummy shift + checklist + checks
      if (!data) {
        const shiftResult = await createVehicleChecklistShift(empId)
        if (!shiftResult?.shift_id) { setError('No se pudo iniciar checklist'); return }
        const clResult = await initVehicleChecklist(shiftResult.shift_id, empId)
        if (!clResult?.checklist_id) { setError('No se pudo crear checklist'); return }
        data = { id: clResult.checklist_id, state: 'pending', check_ids: [] }
      }

      setChecklist(data)

      // 3. Leer los checks (si check_ids viene vacío o es array de IDs)
      if (data?.id) {
        const checksData = await getVehicleChecks(data.id)
        setChecks((checksData || []).map(c => ({
          ...c,
          localValue: c.passed ? c.result_bool : undefined,
          localNumeric: c.result_numeric || '',
          hasPhoto: !!c.result_photo,
          saved: c.passed === true,
        })))
      }
    } catch (e) {
      logScreenError('ScreenChecklistUnidad', 'loadChecklist', e)
      setError('No se pudo cargar el checklist')
    } finally {
      setLoading(false)
    }
  }

  function updateLocal(idx, field, value) {
    setChecks(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value, saved: false } : c))
  }

  async function saveCheck(idx) {
    const c = checks[idx]
    const data = {}
    if (c.check_type === 'yes_no') data.result_bool = c.localValue
    if (c.check_type === 'numeric') data.result_numeric = parseFloat(c.localNumeric)

    try {
      await submitVehicleCheck(c.id, data)
      setChecks(prev => prev.map((ch, i) => i === idx ? { ...ch, saved: true } : ch))
      setError('')
    } catch (e) {
      logScreenError('ScreenChecklistUnidad', 'submitVehicleCheck', e)
      // Antes el error era silencioso — el usuario veía el item sin marcar
      // pero pensaba que la app aún cargaba. Ahora mostramos error explícito
      // para que sepa que el backend rechazó y debe reintentar.
      setError('No se pudo guardar el ítem. Reintenta o reporta a soporte.')
    }
  }

  function handlePhotoClick(checkId) {
    setPhotoCheckId(checkId)
    fileInputRef.current?.click()
  }

  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0]
    if (!file || !photoCheckId) return

    const fileError = validateChecklistPhotoFile(file)
    if (fileError) {
      setError(fileError)
      e.target.value = ''
      setPhotoCheckId(null)
      return
    }

    try {
      const dataUrl = await readFileAsDataURL(file)
      await submitVehicleCheck(photoCheckId, { result_photo: normalizeChecklistPhotoValue(dataUrl) })
      setChecks(prev => prev.map(c => c.id === photoCheckId ? { ...c, saved: true, hasPhoto: true } : c))
      setError('')
    } catch (err) {
      logScreenError('ScreenChecklistUnidad', 'submitVehicleCheck(photo)', err)
      setError('Error subiendo foto — intenta de nuevo')
    } finally {
      e.target.value = ''
      setPhotoCheckId(null)
    }
  }

  async function handleComplete() {
    if (!checklist?.id) return
    setSubmitting(true)
    try {
      await completeVehicleChecklist(checklist.id)
      navigate('/ruta')
    } catch (e) {
      logScreenError('ScreenChecklistUnidad', 'completeVehicleChecklist', e)
      setError('No se pudo completar la inspección')
    } finally {
      setSubmitting(false)
    }
  }

  const allAnswered = checks.every(c => {
    if (c.check_type === 'yes_no') return c.localValue !== undefined
    if (c.check_type === 'numeric') return c.localNumeric !== ''
    if (c.check_type === 'photo') return c.saved || c.hasPhoto
    return true
  })

  const passedCount = checks.filter(c => c.saved).length
  const isCompleted = checklist?.state === 'completed'

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
        button { border: none; background: none; cursor: pointer; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} style={{ display: 'none' }} />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 12 }}>
          <button onClick={() => navigate('/ruta')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Checklist Unidad</span>
          </div>
          {checks.length > 0 && (
            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
              {passedCount}/{checks.length}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {checks.length > 0 && (
          <div style={{
            height: 4, borderRadius: 2,
            background: TOKENS.colors.surface,
            marginBottom: 20, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: passedCount === checks.length ? TOKENS.colors.success : TOKENS.colors.blue2,
              width: `${(passedCount / checks.length) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        )}

        {!loading && error && (
          <div style={{
            marginTop: 20, padding: 16, borderRadius: TOKENS.radius.lg,
            background: TOKENS.colors.errorSoft, border: `1px solid rgba(239,68,68,0.3)`,
            color: TOKENS.colors.error, ...typo.body, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {/* Completed state */}
        {!loading && isCompleted && (
          <div style={{
            marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl,
            background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.25)`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.success }}>Inspección completada</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>
              Todos los puntos fueron verificados. La unidad está lista para salir.
            </p>
          </div>
        )}

        {/* Check items */}
        {!loading && !isCompleted && checks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checks.map((check, idx) => (
              <CheckItem
                key={check.id || idx}
                check={check}
                idx={idx}
                typo={typo}
                onUpdate={updateLocal}
                onSave={saveCheck}
                onPhoto={handlePhotoClick}
              />
            ))}
          </div>
        )}

        {/* Complete button */}
        {!loading && !isCompleted && checks.length > 0 && (
          <div style={{ padding: '24px 0 32px' }}>
            <button
              onClick={handleComplete}
              disabled={!allAnswered || submitting}
              style={{
                width: '100%', padding: '14px',
                borderRadius: TOKENS.radius.lg,
                background: allAnswered ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: allAnswered ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600,
                opacity: submitting ? 0.6 : 1,
                boxShadow: allAnswered ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                transition: `opacity ${TOKENS.motion.fast}`,
              }}
            >
              {submitting ? 'Guardando...' : 'Completar Inspección'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckItem({ check, idx, typo, onUpdate, onSave, onPhoto }) {
  const icon = CHECK_ICONS[check.check_type] || '?'

  return (
    <div style={{
      padding: '14px 16px', borderRadius: TOKENS.radius.lg,
      background: check.saved ? 'rgba(34,197,94,0.06)' : TOKENS.glass.panel,
      border: `1px solid ${check.saved ? 'rgba(34,197,94,0.2)' : TOKENS.colors.border}`,
      transition: `border-color ${TOKENS.motion.fast}, background ${TOKENS.motion.fast}`,
    }}>
      {/* Check name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: check.saved ? 'rgba(34,197,94,0.15)' : TOKENS.colors.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
          color: check.saved ? TOKENS.colors.success : TOKENS.colors.textMuted,
        }}>
          {check.saved ? '\u2713' : icon}
        </span>
        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, lineHeight: 1.4 }}>
          {check.name}
        </p>
      </div>

      {/* yes_no */}
      {check.check_type === 'yes_no' && (
        <div style={{ display: 'flex', gap: 8, marginLeft: 38 }}>
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => { onUpdate(idx, 'localValue', val); setTimeout(() => onSave(idx), 100) }}
              style={{
                flex: 1, padding: '8px', borderRadius: TOKENS.radius.sm,
                background: check.localValue === val
                  ? (val ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)')
                  : TOKENS.colors.surface,
                border: `1px solid ${check.localValue === val
                  ? (val ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)')
                  : TOKENS.colors.border}`,
                color: check.localValue === val
                  ? (val ? TOKENS.colors.success : TOKENS.colors.error)
                  : TOKENS.colors.textMuted,
                fontSize: 13, fontWeight: 600,
              }}
            >
              {val ? 'Sí' : 'No'}
            </button>
          ))}
        </div>
      )}

      {/* numeric */}
      {check.check_type === 'numeric' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 38 }}>
          <input
            type="number"
            inputMode="decimal"
            value={check.localNumeric}
            onChange={e => onUpdate(idx, 'localNumeric', e.target.value)}
            onBlur={() => onSave(idx)}
            placeholder={`${check.min_value ?? ''} a ${check.max_value ?? ''}`}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: TOKENS.radius.sm,
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
              color: 'white', fontSize: 14, outline: 'none',
            }}
          />
          {check.min_value != null && (
            <span style={{ ...typo.caption, color: TOKENS.colors.textLow, whiteSpace: 'nowrap' }}>
              {check.min_value} a {check.max_value}
            </span>
          )}
        </div>
      )}

      {/* photo */}
      {check.check_type === 'photo' && (
        <div style={{ marginLeft: 38 }}>
          <button
            onClick={() => onPhoto(check.id)}
            style={{
              padding: '8px 16px', borderRadius: TOKENS.radius.sm,
              background: check.hasPhoto ? 'rgba(34,197,94,0.15)' : TOKENS.colors.surface,
              border: `1px solid ${check.hasPhoto ? 'rgba(34,197,94,0.3)' : TOKENS.colors.border}`,
              color: check.hasPhoto ? TOKENS.colors.success : TOKENS.colors.blue2,
              fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            {check.hasPhoto ? 'Foto tomada' : 'Tomar foto'}
          </button>
        </div>
      )}
    </div>
  )
}
