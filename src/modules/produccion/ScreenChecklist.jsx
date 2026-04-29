import { useEffect, useMemo, useState, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyShift, getChecklist, submitCheck, completeChecklist } from './api'
import { resolveChecklistRoleContext } from './checklistContext'
import { logScreenError } from '../shared/logScreenError'
import {
  normalizeChecklistPhotoValue,
  readFileAsDataURL,
  validateChecklistPhotoFile,
} from '../shared/checklistPhoto'

const CHECK_ICONS = {
  yes_no:  '✓',
  numeric: '#',
  photo:   '📷',
  text:    '📝',
}

export default function ScreenChecklist() {
  const { session } = useSession()
  const location = useLocation()
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
  const activeRole = resolveChecklistRoleContext(session, location.state?.selected_role)
  const productionState = activeRole ? { selected_role: activeRole } : undefined

  useEffect(() => { loadChecklist() }, [])

  async function loadChecklist() {
    setLoading(true)
    try {
      const shift = await getMyShift()
      if (!shift?.id) { setError('Sin turno activo'); return }
      const data = await getChecklist(shift.id, activeRole)
      setError('')
      setChecklist(data)
      setChecks((data?.checks || []).map(c => {
        const attempted =
          (c.check_type === 'yes_no' && c.result_bool !== undefined && c.result_bool !== null) ||
          (c.check_type === 'numeric' && c.result_numeric !== undefined && c.result_numeric !== null && c.result_numeric !== '') ||
          (c.check_type === 'text' && (c.result_text || '') !== '') ||
          (c.check_type === 'photo' && !!c.result_photo)

        return {
          ...c,
          localValue: c.check_type === 'yes_no'
            ? (c.result_bool === true ? true : c.result_bool === false ? false : undefined)
            : undefined,
          localNumeric: c.result_numeric !== undefined && c.result_numeric !== null && c.result_numeric !== ''
            ? String(c.result_numeric)
            : '',
          localText: c.result_text || '',
          hasPhoto: !!c.result_photo,
          attempted,
          saved: Boolean(c.passed),
        }
      }))
    } catch (e) {
      logScreenError('ScreenChecklist', 'loadChecklist', e)
      setError('No se pudo cargar el checklist')
    } finally {
      setLoading(false)
    }
  }

  function updateLocal(idx, field, value) {
    setChecks(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value, attempted: true, saved: false } : c))
  }

  async function saveCheck(idx, overrides = null) {
    // Read latest state via functional setChecks — avoids stale closure when called from setTimeout.
    let snapshot = null
    setChecks(prev => { snapshot = prev; return prev })
    const c = { ...(snapshot?.[idx] || checks[idx]), ...(overrides || {}) }
    if (!c || !c.id) return
    const data = {}
    if (c.check_type === 'yes_no') data.result_bool = !!c.localValue
    if (c.check_type === 'numeric') data.result_numeric = parseFloat(c.localNumeric || 0)
    if (c.check_type === 'text') data.result_text = c.localText || ''

    try {
      await submitCheck(c.id, data)
      await loadChecklist()
      return true
    } catch (e) {
      logScreenError('ScreenChecklist', 'submitCheck', e)
      setError('No se pudo guardar uno de los checks. Revisa los datos e intenta de nuevo.')
      return false
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
      await submitCheck(photoCheckId, { result_photo: normalizeChecklistPhotoValue(dataUrl) })
      setError('')
      await loadChecklist()
    } catch (err) {
      logScreenError('ScreenChecklist', 'submitCheck(photo)', err)
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
      setError('')
      let currentChecks = checks
      for (let idx = 0; idx < currentChecks.length; idx += 1) {
        const c = currentChecks[idx]
        const needsSave =
          c.check_type === 'yes_no'
            ? c.localValue !== undefined && !c.saved
            : c.check_type === 'numeric'
              ? c.localNumeric !== '' && !c.saved
              : c.check_type === 'text'
                ? !!c.localText?.trim() && !c.saved
                : false
        if (!needsSave) continue
        const ok = await saveCheck(idx)
        if (!ok) return
        const shiftSnapshot = await getMyShift()
        const latest = await getChecklist(shiftSnapshot.id, activeRole)
        currentChecks = (latest?.checks || []).map(c2 => ({
          ...c2,
          localValue: c2.check_type === 'yes_no'
            ? (c2.result_bool === true ? true : c2.result_bool === false ? false : undefined)
            : undefined,
          localNumeric: c2.result_numeric !== undefined && c2.result_numeric !== null && c2.result_numeric !== ''
            ? String(c2.result_numeric)
            : '',
          localText: c2.result_text || '',
          hasPhoto: !!c2.result_photo,
          attempted:
            (c2.check_type === 'yes_no' && c2.result_bool !== undefined && c2.result_bool !== null) ||
            (c2.check_type === 'numeric' && c2.result_numeric !== undefined && c2.result_numeric !== null && c2.result_numeric !== '') ||
            (c2.check_type === 'text' && (c2.result_text || '') !== '') ||
            (c2.check_type === 'photo' && !!c2.result_photo),
          saved: Boolean(c2.passed),
        }))
      }

      const shift = await getMyShift()
      const fresh = await getChecklist(shift.id, activeRole)
      const pending = (fresh?.checks || []).filter(c => !c.passed)
      if (pending.length) {
        setChecklist(fresh)
        setChecks((fresh?.checks || []).map(c => ({
          ...c,
          localValue: c.check_type === 'yes_no'
            ? (c.result_bool === true ? true : c.result_bool === false ? false : undefined)
            : undefined,
          localNumeric: c.result_numeric !== undefined && c.result_numeric !== null && c.result_numeric !== ''
            ? String(c.result_numeric)
            : '',
          localText: c.result_text || '',
          hasPhoto: !!c.result_photo,
          attempted:
            (c.check_type === 'yes_no' && c.result_bool !== undefined && c.result_bool !== null) ||
            (c.check_type === 'numeric' && c.result_numeric !== undefined && c.result_numeric !== null && c.result_numeric !== '') ||
            (c.check_type === 'text' && (c.result_text || '') !== '') ||
            (c.check_type === 'photo' && !!c.result_photo),
          saved: Boolean(c.passed),
        })))
        setError('Hay checks pendientes o fallidos. Revisa los puntos marcados antes de completar.')
        return
      }

      await completeChecklist(checklist.id)
      navigate('/produccion', { state: productionState })
    } catch (e) {
      logScreenError('ScreenChecklist', 'completeChecklist', e)
      setError('No se pudo completar el checklist')
    } finally {
      setSubmitting(false)
    }
  }

  const allAnswered = checks.every(c => {
    if (c.check_type === 'yes_no') return c.localValue !== undefined
    if (c.check_type === 'numeric') return c.localNumeric !== ''
    if (c.check_type === 'photo') return c.saved || c.hasPhoto
    if (c.check_type === 'text') return c.localText?.trim() !== ''
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
          <button onClick={() => navigate('/produccion', { state: productionState })} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Inspección y Limpieza</span>
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
              Todos los puntos fueron verificados. Puedes continuar con la producción.
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

        {/* Botón completar */}
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
      {/* Nombre del punto */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: check.saved ? 'rgba(34,197,94,0.15)' : TOKENS.colors.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
          color: check.saved ? TOKENS.colors.success : TOKENS.colors.textMuted,
        }}>
          {check.saved ? '✓' : icon}
        </span>
        <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, lineHeight: 1.4 }}>
          {check.name}
        </p>
      </div>

      {/* Input según tipo */}
      {check.attempted && !check.saved && (
        <p style={{ ...typo.caption, color: TOKENS.colors.error, margin: '0 0 10px 38px' }}>
          Este punto aun no cumple la validacion de Odoo.
        </p>
      )}

      {check.check_type === 'yes_no' && (
        <div style={{ display: 'flex', gap: 8, marginLeft: 38 }}>
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => { onUpdate(idx, 'localValue', val); onSave(idx, { localValue: val }) }}
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
              {check.min_value}° a {check.max_value}°
            </span>
          )}
        </div>
      )}

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

      {check.check_type === 'text' && (
        <div style={{ marginLeft: 38 }}>
          <textarea
            value={check.localText}
            onChange={e => onUpdate(idx, 'localText', e.target.value)}
            onBlur={() => onSave(idx)}
            placeholder="Escribe una observación..."
            rows={2}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: TOKENS.radius.sm,
              background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
              color: 'white', fontSize: 13, outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}
    </div>
  )
}
