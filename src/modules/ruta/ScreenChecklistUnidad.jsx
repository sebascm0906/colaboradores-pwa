// ScreenChecklistUnidad.jsx — Inspección de unidad previa a salida de ruta.
//
// Backend Sebastián 2026-04-25 (commit ba9de46), QA backend 32/32 PASS.
// Endpoints: 6 reales en gf_logistics_ops.
//   GET  /pwa-ruta/vehicle-checklist
//   POST /pwa-ruta/vehicle-checklist-create
//   POST /pwa-ruta/vehicle-checklist-init
//   GET  /pwa-ruta/vehicle-checks
//   POST /pwa-ruta/vehicle-check
//   POST /pwa-ruta/vehicle-checklist-complete
//
// Reglas críticas (alineadas con PR #17 / #19):
//   - HTTP 200 con result.ok=false NO es éxito. Cada handler valida res.ok.
//   - localStorage NO es fuente de verdad: el `state` lo decide el backend.
//   - Si un check falla, no limpiamos su valor — el usuario puede reintentar.
//   - La foto se comprime cliente-side y va base64 inline (sin multipart).
//
// Soft launch: backend tiene templates con is_required_for_departure=false.
// La PWA NO inventa gating local; sólo reacciona a vehicle_checklist_required
// cuando el backend lo devuelve en accept-load.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import {
  getMyRoutePlan,
  getVehicleChecklist,
  createVehicleChecklist,
  initVehicleChecklist,
  getVehicleChecks,
  submitVehicleCheck,
  completeVehicleChecklist,
} from './api'
import { logScreenError } from '../shared/logScreenError'
import { compressFromInputEvent } from './vehiclePhotoCompressor'

const CHECK_ICONS = {
  yes_no:  '\u2713',
  numeric: '#',
  text:    '\u270D',
  photo:   '\ud83d\udcf7',
}

export default function ScreenChecklistUnidad() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  // Estado de carga
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Header del checklist
  const [plan, setPlan] = useState(null)
  const [checklist, setChecklist] = useState(null)  // {id, state, vehicle_name, ...}

  // Lista de checks (server-side state)
  const [checks, setChecks] = useState([])

  // Borrador local de respuestas pendientes de envío.
  // Sólo se usa para que el input/botón refleje lo que el usuario escribió ANTES
  // de que el backend confirme. Tras un submit OK, sustituimos con el shape del
  // backend (passed/answered).
  const [drafts, setDrafts] = useState({})  // { [check_id]: {result_bool|result_numeric|result_text|...} }

  // Submitting individual por check para evitar doble click
  const [submittingCheckId, setSubmittingCheckId] = useState(null)

  // Submit del complete
  const [completing, setCompleting] = useState(false)

  // Modal de razón cuando el usuario marca yes_no como false en check blocking
  const [reasonModal, setReasonModal] = useState(null)
  // Banner de errores funcionales del complete (checks_pending / checks_failed_blocking)
  const [completeError, setCompleteError] = useState(null)

  // Foto: input file oculto + check al que pertenece
  const fileInputRef = useRef(null)
  const [photoCheckId, setPhotoCheckId] = useState(null)
  const [uploadingPhotoCheckId, setUploadingPhotoCheckId] = useState(null)

  useEffect(() => { loadAll() }, [])

  /**
   * Flujo de carga inicial:
   *   1. getMyRoutePlan
   *   2. getVehicleChecklist(plan.id)
   *      - data:null → createVehicleChecklist + initVehicleChecklist
   *      - data.state='draft' → initVehicleChecklist
   *      - data.state='in_progress' o 'completed' → seguir directo
   *   3. getVehicleChecks(checklist.id)
   *
   * Cualquier ok:false intermedio se trata como error de carga, no como éxito
   * silencioso. Si el plan no es accesible, mostramos error claro.
   */
  async function loadAll() {
    setLoading(true)
    setError('')
    setCompleteError(null)
    try {
      const empId = session?.employee_id
      const planData = await getMyRoutePlan(empId)
      if (!planData?.id) {
        setError('Sin ruta asignada hoy.')
        setLoading(false)
        return
      }
      setPlan(planData)

      // Paso 1: leer checklist actual del plan
      const headRes = await getVehicleChecklist(planData.id)
      if (headRes?.ok === false) {
        const msg = headRes.message || 'No se pudo cargar la inspección.'
        logScreenError('ScreenChecklistUnidad', 'getVehicleChecklist', new Error(msg))
        setError(msg)
        setLoading(false)
        return
      }
      let head = headRes?.data ?? null

      // Paso 2: si no hay checklist, crear + inicializar.
      if (!head) {
        const createRes = await createVehicleChecklist(planData.id)
        if (createRes?.ok !== true || !createRes?.data?.checklist_id) {
          const msg = createRes?.message || 'No se pudo crear la inspección.'
          logScreenError('ScreenChecklistUnidad', 'createVehicleChecklist', new Error(msg), {
            plan_id: planData.id,
          })
          setError(msg)
          setLoading(false)
          return
        }
        const initRes = await initVehicleChecklist(createRes.data.checklist_id)
        if (initRes?.ok !== true) {
          const msg = initRes?.message || 'No se pudo inicializar la inspección.'
          logScreenError('ScreenChecklistUnidad', 'initVehicleChecklist', new Error(msg), {
            checklist_id: createRes.data.checklist_id,
          })
          setError(msg)
          setLoading(false)
          return
        }
        // Releer header tras init (trae state, checks_total, vehicle_name, etc.)
        const reread = await getVehicleChecklist(planData.id)
        head = reread?.data ?? null
      } else if (head.state === 'draft') {
        // Existe pero no tiene checks instanciados — inicializamos.
        const initRes = await initVehicleChecklist(head.id)
        if (initRes?.ok !== true) {
          const msg = initRes?.message || 'No se pudo inicializar la inspección.'
          logScreenError('ScreenChecklistUnidad', 'initVehicleChecklist (draft)', new Error(msg), {
            checklist_id: head.id,
          })
          setError(msg)
          setLoading(false)
          return
        }
        const reread = await getVehicleChecklist(planData.id)
        head = reread?.data ?? head
      }

      setChecklist(head)

      // Paso 3: lista de checks
      if (head?.id) {
        const checksRes = await getVehicleChecks(head.id)
        if (checksRes?.ok !== true) {
          const msg = checksRes?.message || 'No se pudo cargar los puntos del checklist.'
          logScreenError('ScreenChecklistUnidad', 'getVehicleChecks', new Error(msg), {
            checklist_id: head.id,
          })
          setError(msg)
          setLoading(false)
          return
        }
        const list = checksRes?.data?.checks || []
        setChecks(list)
      }
    } catch (e) {
      e.context = { employee_id: session?.employee_id }
      logScreenError('ScreenChecklistUnidad', 'loadAll', e)
      setError('No se pudo cargar la inspección. Reintenta o reporta a soporte.')
    } finally {
      setLoading(false)
    }
  }

  /** Drafts: actualiza valor local de un check sin enviar al backend. */
  function setDraft(checkId, fieldName, value) {
    setDrafts(prev => ({
      ...prev,
      [checkId]: { ...(prev[checkId] || {}), [fieldName]: value },
    }))
  }

  /**
   * Envía una respuesta al backend. Si el backend devuelve ok:false, NO
   * actualizamos el check con éxito falso; mostramos el message real.
   *
   * Caso especial: si el usuario marcó yes_no=false en un check
   * blocking_on_fail, abrimos el modal de razón antes de enviar.
   */
  async function submitOne(check, payloadOverride = null) {
    if (!check?.id) return
    if (submittingCheckId === check.id) return

    // Construir payload según tipo
    const draft = drafts[check.id] || {}
    let payload
    if (payloadOverride) {
      payload = payloadOverride
    } else if (check.check_type === 'yes_no') {
      const value = draft.result_bool
      if (value === undefined) {
        setError('Selecciona Sí o No.')
        return
      }
      // Si es false en check blocking, pedir razón con modal antes
      if (value === false && check.blocking_on_fail) {
        setReasonModal({ check, value })
        return
      }
      payload = { result_bool: Boolean(value) }
      if (draft.not_passed_reason) payload.not_passed_reason = draft.not_passed_reason
    } else if (check.check_type === 'numeric') {
      const raw = draft.result_numeric
      if (raw === undefined || raw === '' || raw === null) {
        setError('Ingresa un valor numérico.')
        return
      }
      const num = Number(raw)
      if (!Number.isFinite(num)) {
        setError('El valor debe ser numérico.')
        return
      }
      payload = { result_numeric: num }
      if (draft.not_passed_reason) payload.not_passed_reason = draft.not_passed_reason
    } else if (check.check_type === 'text') {
      const text = (draft.result_text || '').trim()
      if (text.length === 0) {
        // Para text optional permitimos vacío (no se envía)
        if (!check.required) return
        setError('Escribe al menos un comentario.')
        return
      }
      payload = { result_text: text }
    } else if (check.check_type === 'photo') {
      // Photo se maneja por handlePhotoCapture; no debería caer aquí salvo bug.
      return
    } else {
      setError(`Tipo de check no soportado: ${check.check_type}`)
      return
    }

    setSubmittingCheckId(check.id)
    setError('')
    try {
      const res = await submitVehicleCheck(check.id, payload)
      if (res?.ok !== true) {
        const code = res?.code || res?.data?.code || null
        const msg = res?.message || 'No se pudo guardar la respuesta.'
        logScreenError('ScreenChecklistUnidad', 'submitVehicleCheck.invalidResponse',
          new Error(msg), { check_id: check.id, code, body: JSON.stringify(res ?? null).slice(0, 500) })
        // Caso conocido: passed_false_requires_reason → abrir modal
        if (code === 'passed_false_requires_reason') {
          setReasonModal({ check, value: payload.result_bool ?? null, payload })
          return
        }
        setError(msg)
        return
      }

      // Éxito: actualizar el check con el shape del backend (recargamos lista
      // para reflejar passed, answered, answered_at, etc.). Limpiamos draft.
      setDrafts(prev => {
        const next = { ...prev }
        delete next[check.id]
        return next
      })
      await reloadChecks()
    } catch (e) {
      e.context = { check_id: check.id, plan_id: plan?.id, employee_id: session?.employee_id }
      logScreenError('ScreenChecklistUnidad', 'submitVehicleCheck', e)
      setError('No se pudo guardar la respuesta. Reintenta o reporta a soporte.')
    } finally {
      setSubmittingCheckId(null)
    }
  }

  /** Recarga checks tras un submit/complete. */
  async function reloadChecks() {
    if (!checklist?.id) return
    try {
      const res = await getVehicleChecks(checklist.id)
      if (res?.ok === true) {
        setChecks(res?.data?.checks || [])
      }
      // Re-leer header también para refrescar progreso/state
      if (plan?.id) {
        const headRes = await getVehicleChecklist(plan.id)
        if (headRes?.ok === true && headRes?.data) {
          setChecklist(headRes.data)
        }
      }
    } catch (e) {
      logScreenError('ScreenChecklistUnidad', 'reloadChecks', e)
    }
  }

  /** Submit con razón desde el modal. */
  async function submitWithReason(reason) {
    const ctx = reasonModal
    if (!ctx?.check) { setReasonModal(null); return }
    const reasonTrim = (reason || '').trim()
    if (reasonTrim.length < 3) {
      setError('Indica un motivo de al menos 3 caracteres.')
      return
    }
    const payload = ctx.payload || (ctx.check.check_type === 'yes_no'
      ? { result_bool: ctx.value }
      : null)
    if (!payload) { setReasonModal(null); return }
    payload.not_passed_reason = reasonTrim
    setReasonModal(null)
    await submitOne(ctx.check, payload)
  }

  /** Click en botón de tomar foto: abre input file. */
  function handlePhotoClick(checkId) {
    setPhotoCheckId(checkId)
    setError('')
    fileInputRef.current?.click()
  }

  /** Captura de foto: comprime + sube como base64 inline. */
  async function handlePhotoCapture(e) {
    const checkId = photoCheckId
    if (!checkId) { e.target.value = ''; return }
    setPhotoCheckId(null)
    setUploadingPhotoCheckId(checkId)
    setError('')
    try {
      const compressed = await compressFromInputEvent(e)
      e.target.value = ''
      if (!compressed) return
      const res = await submitVehicleCheck(checkId, {
        result_photo: compressed.base64,
        result_photo_filename: compressed.filename,
      })
      if (res?.ok !== true) {
        const code = res?.code || res?.data?.code || null
        const msg = res?.message || 'No se pudo guardar la foto.'
        logScreenError('ScreenChecklistUnidad', 'submitPhoto.invalidResponse',
          new Error(msg), { check_id: checkId, code, size_bytes: compressed.sizeBytes })
        setError(msg)
        return
      }
      await reloadChecks()
    } catch (err) {
      err.context = { check_id: checkId, plan_id: plan?.id }
      logScreenError('ScreenChecklistUnidad', 'handlePhotoCapture', err)
      setError(err?.message || 'No se pudo procesar la foto.')
    } finally {
      setUploadingPhotoCheckId(null)
    }
  }

  /**
   * Completar checklist. Si backend devuelve checks_pending / checks_failed_blocking,
   * los mostramos como banner específico — NO marcamos completed en falso.
   */
  async function handleComplete() {
    if (!checklist?.id || completing) return
    setCompleting(true)
    setCompleteError(null)
    try {
      const res = await completeVehicleChecklist(checklist.id)
      if (res?.ok !== true) {
        const code = res?.code || res?.data?.code || null
        const msg = res?.message || 'No se pudo completar la inspección.'
        logScreenError('ScreenChecklistUnidad', 'completeVehicleChecklist.invalidResponse',
          new Error(msg), { checklist_id: checklist.id, code, body: JSON.stringify(res ?? null).slice(0, 500) })

        // already_completed → tratarlo como terminal amigable
        if (code === 'already_completed') {
          setChecklist(prev => prev ? { ...prev, state: 'completed' } : prev)
          await reloadChecks()
          return
        }
        setCompleteError({ code, message: msg, data: res?.data || null })
        return
      }
      // Éxito: el backend marcó completed
      const data = res?.data || {}
      setChecklist(prev => prev ? {
        ...prev,
        state: data.state || 'completed',
        completed_at: data.completed_at || prev.completed_at,
      } : prev)
      await reloadChecks()
    } catch (e) {
      e.context = { checklist_id: checklist.id, plan_id: plan?.id }
      logScreenError('ScreenChecklistUnidad', 'completeVehicleChecklist', e)
      setCompleteError({ code: null, message: e?.message || 'No se pudo completar la inspección.' })
    } finally {
      setCompleting(false)
    }
  }

  // ── Cálculos UI ────────────────────────────────────────────────────────────

  const totalChecks = checks.length || 0
  const answeredChecks = checks.filter(c => c.answered).length
  const passedChecks = checks.filter(c => c.passed && c.answered).length
  const requiredPending = checks.filter(c => c.required && !c.answered).length
  const isCompleted = checklist?.state === 'completed'
  const isInProgress = checklist?.state === 'in_progress'
  const allRequiredAnswered = requiredPending === 0
  const anyBlockingFailed = checks.some(c => c.blocking_on_fail && c.answered && !c.passed)
  const canComplete = !isCompleted && allRequiredAnswered && !anyBlockingFailed

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

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handlePhotoCapture} style={{ display: 'none' }} />

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
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Inspección de Unidad</span>
            {checklist?.vehicle_name && (
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '2px 0 0' }}>
                {checklist.vehicle_name}
              </p>
            )}
          </div>
          {totalChecks > 0 && !isCompleted && (
            <span style={{ ...typo.caption, color: TOKENS.colors.textMuted }}>
              {answeredChecks}/{totalChecks}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {totalChecks > 0 && !isCompleted && (
          <div style={{
            height: 4, borderRadius: 2,
            background: TOKENS.colors.surface,
            marginBottom: 20, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: allRequiredAnswered ? TOKENS.colors.success : TOKENS.colors.blue2,
              width: `${totalChecks > 0 ? (answeredChecks / totalChecks) * 100 : 0}%`,
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

        {/* Estado completado */}
        {!loading && isCompleted && (
          <div style={{
            marginTop: 20, padding: 24, borderRadius: TOKENS.radius.xl,
            background: 'rgba(34,197,94,0.08)', border: `1px solid rgba(34,197,94,0.25)`,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x2705;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.success, margin: 0 }}>
              Inspección completada
            </p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '8px 0 0' }}>
              {passedChecks} de {totalChecks} puntos OK · registrado en el plan {plan?.name || ''}
            </p>
            <button
              onClick={() => navigate('/ruta')}
              style={{
                marginTop: 16, padding: '10px 24px', borderRadius: TOKENS.radius.md,
                background: 'linear-gradient(135deg, #15499B, #2B8FE0)',
                color: 'white', fontSize: 13, fontWeight: 700,
              }}
            >
              Continuar a aceptar carga
            </button>
          </div>
        )}

        {/* Lista de checks */}
        {!loading && !isCompleted && checks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {checks.map((check, idx) => (
              <CheckItem
                key={check.id || idx}
                check={check}
                draft={drafts[check.id] || {}}
                onDraft={(field, value) => setDraft(check.id, field, value)}
                onSubmit={() => submitOne(check)}
                onPhotoClick={() => handlePhotoClick(check.id)}
                submitting={submittingCheckId === check.id}
                uploadingPhoto={uploadingPhotoCheckId === check.id}
                typo={typo}
              />
            ))}
          </div>
        )}

        {/* Banner del complete con error funcional */}
        {!loading && completeError && !isCompleted && (
          <div style={{
            marginTop: 16, padding: 14, borderRadius: TOKENS.radius.md,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          }}>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0, fontWeight: 700, marginBottom: 6 }}>
              {completeError.code === 'checks_pending'
                ? 'Faltan puntos por responder'
                : completeError.code === 'checks_failed_blocking'
                ? 'Hay puntos críticos en falla'
                : 'No se pudo completar la inspección'}
            </p>
            <p style={{ ...typo.caption, color: '#ef4444', margin: 0 }}>{completeError.message}</p>
            {Array.isArray(completeError.data?.missing_names) && completeError.data.missing_names.length > 0 && (
              <ul style={{ margin: '6px 0 0 14px', padding: 0 }}>
                {completeError.data.missing_names.map((name, i) => (
                  <li key={i} style={{ ...typo.caption, color: '#ef4444' }}>{name}</li>
                ))}
              </ul>
            )}
            {Array.isArray(completeError.data?.failed_names) && completeError.data.failed_names.length > 0 && (
              <ul style={{ margin: '6px 0 0 14px', padding: 0 }}>
                {completeError.data.failed_names.map((name, i) => (
                  <li key={i} style={{ ...typo.caption, color: '#ef4444' }}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Botón completar */}
        {!loading && isInProgress && checks.length > 0 && (
          <div style={{ padding: '24px 0 32px' }}>
            <button
              onClick={handleComplete}
              disabled={!canComplete || completing}
              style={{
                width: '100%', padding: '14px',
                borderRadius: TOKENS.radius.lg,
                background: canComplete ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canComplete ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600,
                opacity: completing ? 0.6 : 1,
                boxShadow: canComplete ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                transition: `opacity ${TOKENS.motion.fast}`,
              }}
            >
              {completing
                ? 'Completando...'
                : !allRequiredAnswered
                  ? `Faltan ${requiredPending} puntos obligatorios`
                  : anyBlockingFailed
                    ? 'Hay puntos críticos en falla'
                    : 'Completar Inspección'}
            </button>
          </div>
        )}
      </div>

      {/* Modal de razón para fail con not_passed_reason */}
      {reasonModal && (
        <ReasonModal
          check={reasonModal.check}
          onCancel={() => setReasonModal(null)}
          onSubmit={submitWithReason}
          typo={typo}
        />
      )}
    </div>
  )
}

// ── CheckItem ─────────────────────────────────────────────────────────────────

function CheckItem({ check, draft, onDraft, onSubmit, onPhotoClick, submitting, uploadingPhoto, typo }) {
  const icon = CHECK_ICONS[check.check_type] || '?'
  const answered = !!check.answered
  const passed = !!check.passed && answered
  const failed = answered && !passed
  const blocking = check.blocking_on_fail
  const required = check.required

  // Color del header según estado
  const headerColor = passed ? TOKENS.colors.success
    : failed ? (blocking ? TOKENS.colors.error : TOKENS.colors.warning)
    : TOKENS.colors.textMuted

  const cardBg = passed ? 'rgba(34,197,94,0.06)'
    : failed && blocking ? 'rgba(239,68,68,0.06)'
    : failed ? 'rgba(245,158,11,0.06)'
    : TOKENS.glass.panel
  const cardBorder = passed ? 'rgba(34,197,94,0.20)'
    : failed && blocking ? 'rgba(239,68,68,0.30)'
    : failed ? 'rgba(245,158,11,0.30)'
    : TOKENS.colors.border

  return (
    <div style={{
      padding: '14px 16px', borderRadius: TOKENS.radius.lg,
      background: cardBg, border: `1px solid ${cardBorder}`,
      transition: `border-color ${TOKENS.motion.fast}, background ${TOKENS.motion.fast}`,
    }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: passed ? 'rgba(34,197,94,0.15)' : TOKENS.colors.surface,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, flexShrink: 0,
          color: headerColor,
        }}>
          {passed ? '\u2713' : failed && blocking ? '\u2717' : icon}
        </span>
        <div style={{ flex: 1 }}>
          <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: 0, lineHeight: 1.4 }}>
            {check.name}
            {required && <span style={{ color: TOKENS.colors.textMuted, fontSize: 11 }}> · obligatorio</span>}
            {blocking && <span style={{ color: TOKENS.colors.error, fontSize: 11 }}> · crítico</span>}
          </p>
          {failed && check.not_passed_reason && (
            <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: '4px 0 0', fontStyle: 'italic' }}>
              Motivo: {check.not_passed_reason}
            </p>
          )}
        </div>
      </div>

      {/* Render por tipo */}
      {check.check_type === 'yes_no' && (
        <YesNoInput
          check={check}
          draft={draft}
          onDraft={onDraft}
          onSubmit={onSubmit}
          submitting={submitting}
          answered={answered}
          passed={passed}
          typo={typo}
        />
      )}
      {check.check_type === 'numeric' && (
        <NumericInput
          check={check}
          draft={draft}
          onDraft={onDraft}
          onSubmit={onSubmit}
          submitting={submitting}
          answered={answered}
          passed={passed}
          typo={typo}
        />
      )}
      {check.check_type === 'text' && (
        <TextInput
          check={check}
          draft={draft}
          onDraft={onDraft}
          onSubmit={onSubmit}
          submitting={submitting}
          answered={answered}
          typo={typo}
        />
      )}
      {check.check_type === 'photo' && (
        <PhotoInput
          check={check}
          uploadingPhoto={uploadingPhoto}
          onPhotoClick={onPhotoClick}
          answered={answered}
          typo={typo}
        />
      )}
    </div>
  )
}

// ── Inputs por tipo ───────────────────────────────────────────────────────────

function YesNoInput({ check, draft, onDraft, onSubmit, submitting, answered, passed, typo }) {
  // Si ya está respondido, mostrar valor read-only
  if (answered) {
    return (
      <div style={{ marginLeft: 38, ...typo.body, color: passed ? TOKENS.colors.success : TOKENS.colors.warning, fontWeight: 600 }}>
        {check.result_bool ? 'Sí' : 'No'}
      </div>
    )
  }
  const localValue = draft.result_bool
  return (
    <div style={{ display: 'flex', gap: 8, marginLeft: 38 }}>
      {[true, false].map(val => (
        <button
          key={String(val)}
          onClick={() => {
            onDraft('result_bool', val)
            // Trigger submit en el siguiente tick para que el draft se actualice primero
            setTimeout(onSubmit, 50)
          }}
          disabled={submitting}
          style={{
            flex: 1, padding: '10px', borderRadius: TOKENS.radius.sm,
            background: localValue === val
              ? (val ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)')
              : TOKENS.colors.surface,
            border: `1px solid ${localValue === val
              ? (val ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)')
              : TOKENS.colors.border}`,
            color: localValue === val
              ? (val ? TOKENS.colors.success : TOKENS.colors.error)
              : TOKENS.colors.textMuted,
            fontSize: 13, fontWeight: 600,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {val ? 'Sí' : 'No'}
        </button>
      ))}
    </div>
  )
}

function NumericInput({ check, draft, onDraft, onSubmit, submitting, answered, passed, typo }) {
  if (answered) {
    return (
      <div style={{ marginLeft: 38, ...typo.body, color: passed ? TOKENS.colors.success : TOKENS.colors.warning, fontWeight: 600 }}>
        {check.result_numeric}
        {(check.min_value != null || check.max_value != null) && (
          <span style={{ ...typo.caption, color: TOKENS.colors.textLow, marginLeft: 8, fontWeight: 400 }}>
            (rango {check.min_value ?? '—'} a {check.max_value ?? '—'})
          </span>
        )}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 38 }}>
      <input
        type="number"
        inputMode="decimal"
        value={draft.result_numeric ?? ''}
        onChange={e => onDraft('result_numeric', e.target.value)}
        onBlur={() => {
          // Submit on blur si hay valor
          if (draft.result_numeric !== undefined && draft.result_numeric !== '') onSubmit()
        }}
        disabled={submitting}
        placeholder={check.min_value != null || check.max_value != null
          ? `${check.min_value ?? ''} a ${check.max_value ?? ''}`
          : 'Valor'}
        style={{
          flex: 1, padding: '8px 12px', borderRadius: TOKENS.radius.sm,
          background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
          color: 'white', fontSize: 14, outline: 'none',
          opacity: submitting ? 0.6 : 1,
        }}
      />
      {(check.min_value != null || check.max_value != null) && (
        <span style={{ ...typo.caption, color: TOKENS.colors.textLow, whiteSpace: 'nowrap' }}>
          {check.min_value ?? '—'} a {check.max_value ?? '—'}
        </span>
      )}
    </div>
  )
}

function TextInput({ check, draft, onDraft, onSubmit, submitting, answered, typo }) {
  if (answered) {
    return (
      <div style={{ marginLeft: 38, ...typo.body, color: TOKENS.colors.textSoft, whiteSpace: 'pre-wrap' }}>
        {check.result_text || '(sin contenido)'}
      </div>
    )
  }
  return (
    <div style={{ marginLeft: 38 }}>
      <textarea
        value={draft.result_text ?? ''}
        onChange={e => onDraft('result_text', e.target.value)}
        onBlur={() => {
          if ((draft.result_text || '').trim().length > 0) onSubmit()
        }}
        disabled={submitting}
        rows={2}
        placeholder={check.required ? 'Escribe el comentario…' : 'Opcional'}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: TOKENS.radius.sm,
          background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
          color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
          opacity: submitting ? 0.6 : 1, fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function PhotoInput({ check, uploadingPhoto, onPhotoClick, answered, typo }) {
  return (
    <div style={{ marginLeft: 38 }}>
      <button
        onClick={onPhotoClick}
        disabled={uploadingPhoto}
        style={{
          padding: '8px 16px', borderRadius: TOKENS.radius.sm,
          background: answered ? 'rgba(34,197,94,0.15)' : TOKENS.colors.surface,
          border: `1px solid ${answered ? 'rgba(34,197,94,0.3)' : TOKENS.colors.border}`,
          color: answered ? TOKENS.colors.success : TOKENS.colors.blue2,
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          opacity: uploadingPhoto ? 0.6 : 1,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        {uploadingPhoto ? 'Subiendo…' : answered ? 'Cambiar foto' : 'Tomar foto'}
      </button>
      {answered && check.result_photo_url && (
        <div style={{ marginTop: 8 }}>
          <img
            src={`/odoo-api${check.result_photo_url}`}
            alt={check.name}
            style={{ maxWidth: '100%', maxHeight: 160, borderRadius: TOKENS.radius.sm, border: `1px solid ${TOKENS.colors.border}` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Modal de razón ────────────────────────────────────────────────────────────

function ReasonModal({ check, onCancel, onSubmit, typo }) {
  const [text, setText] = useState('')
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, padding: 20, borderRadius: TOKENS.radius.xl,
        background: TOKENS.colors.bg1, border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>
          {check.name}
        </p>
        <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: '6px 0 14px' }}>
          {check.blocking_on_fail
            ? 'Este punto es crítico. Indica el motivo del fallo para registrarlo y reportarlo a soporte.'
            : 'Indica el motivo del fallo para que quede registrado.'}
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Ej: Llanta delantera derecha gastada"
          style={{
            width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
            color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px', borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            color: TOKENS.colors.textMuted, fontSize: 13, fontWeight: 600,
          }}>Cancelar</button>
          <button
            onClick={() => onSubmit(text)}
            disabled={text.trim().length < 3}
            style={{
              flex: 2, padding: '10px', borderRadius: TOKENS.radius.md,
              background: text.trim().length >= 3 ? 'linear-gradient(135deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
              border: 'none',
              color: 'white', fontSize: 13, fontWeight: 600,
              opacity: text.trim().length < 3 ? 0.5 : 1,
            }}
          >
            Guardar con motivo
          </button>
        </div>
      </div>
    </div>
  )
}
