import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo, TURNO_LABELS } from '../../tokens'
import { getMyShift } from './api'
import {
  getOperatorCloseState,
  normalizeOperatorCloseRole,
  reopenOperatorTurnClosed,
} from '../shared/operatorTurnCloseStore'

function formatDeliveryTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function ScreenTurnoEntregado({ shift: shiftProp = null, role: roleProp = '', closeState: closeStateProp = null } = {}) {
  const { session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [sw, setSw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const initialShift = shiftProp || location.state?.shift || null
  const [shift, setShift] = useState(initialShift)
  const [currentShift, setCurrentShift] = useState(null)
  const [loading, setLoading] = useState(!initialShift)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const role = normalizeOperatorCloseRole(roleProp || location.state?.role || session?.role || '')

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    let active = true

    async function loadCurrentShift() {
      setLoading(true)
      setError('')
      try {
        const liveShift = await getMyShift()
        if (!active) return
        setCurrentShift(liveShift || null)
        if (!initialShift) {
          setShift(liveShift || null)
        }
      } catch (e) {
        if (!active) return
        setCurrentShift(null)
        if (!initialShift) {
          setShift(null)
        }
        setError(e?.message === 'no_session' ? 'Sesion expirada' : 'No se pudo validar el turno actual')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCurrentShift()
    return () => { active = false }
  }, [initialShift])

  const effectiveShift = shift || shiftProp || location.state?.shift || null
  const validationShift = currentShift || null
  const closeState = closeStateProp || (effectiveShift?.id ? getOperatorCloseState(effectiveShift.id, role, validationShift) : null)
  const deliveryTime = formatDeliveryTime(closeState?.closed_at)
  const title = effectiveShift?.name || (effectiveShift?.shift_code != null ? `Turno ${effectiveShift.shift_code}` : 'Turno entregado')
  const shiftLabel = effectiveShift?.shift_code ? (TURNO_LABELS[effectiveShift.shift_code] || `Turno ${effectiveShift.shift_code}`) : ''

  const shiftMatchesCurrent = Boolean(validationShift?.id && effectiveShift?.id && String(validationShift.id) === String(effectiveShift.id))
  const canReopen = Boolean(closeState?.can_reopen && shiftMatchesCurrent)
  const isStale = Boolean(closeState?.stale || (validationShift?.id && effectiveShift?.id && !shiftMatchesCurrent))
  const isClosedByCurrentShift = Boolean(closeState?.closed && !isStale && !canReopen)

  async function handleReopen() {
    if (!effectiveShift?.id || !canReopen || !validationShift?.id) return
    setBusy(true)
    setError('')
    try {
      const ok = reopenOperatorTurnClosed(effectiveShift.id, role, { currentShift: validationShift })
      if (!ok) {
        setError('No se pudo abrir este turno. El turno maestro ya no coincide o ya está cerrado.')
        return
      }
      navigate('/produccion', { replace: true, state: { selected_role: role } })
    } catch (e) {
      setError(e?.message || 'No se pudo reabrir el turno')
    } finally {
      setBusy(false)
    }
  }

  const message = canReopen
    ? 'Este cierre sigue vigente para el turno maestro actual. Puedes reabrirlo.'
    : isStale
      ? 'Este cierre pertenece a un turno maestro anterior. No se puede reabrir desde aquí.'
      : isClosedByCurrentShift
        ? 'El turno maestro actual ya no permite reabrir este cierre.'
        : 'No hay un cierre individual disponible para este turno.'

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

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion', { state: { selected_role: role } })} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Turno entregado</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              padding: 18, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
              boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>ENTREGA INDIVIDUAL</p>
              <p style={{ ...typo.h2, color: TOKENS.colors.text, margin: 0 }}>
                {title}
              </p>
              <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>
                {effectiveShift?.date || 'Sin fecha'}{shiftLabel ? ` · ${shiftLabel}` : ''}
              </p>
            </div>

            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>ESTADO</p>
              <p style={{ ...typo.body, color: TOKENS.colors.text, margin: 0, lineHeight: 1.5 }}>
                {message}
              </p>
              {closeState?.employee_name && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 10 }}>
                  Entregado por {closeState.employee_name}
                </p>
              )}
              {deliveryTime && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>
                  Hora de entrega: {deliveryTime}
                </p>
              )}
            </div>

            {error && (
              <div style={{
                padding: 14, borderRadius: TOKENS.radius.lg,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.caption,
              }}>
                {error}
              </div>
            )}

            {canReopen ? (
              <button
                onClick={handleReopen}
                disabled={busy}
                style={{
                  marginTop: 4, width: '100%', padding: '16px 20px',
                  borderRadius: TOKENS.radius.lg,
                  background: busy
                    ? 'linear-gradient(90deg, rgba(43,143,224,0.55), rgba(21,73,155,0.55))'
                    : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                  color: 'white',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.25)',
                  fontSize: 15,
                  fontWeight: 700,
                }}
              >
                {busy ? 'Abriendo...' : 'Abrir turno'}
              </button>
            ) : (
              <div style={{
                marginTop: 4, padding: 14, borderRadius: TOKENS.radius.lg,
                background: TOKENS.colors.warningSoft, border: '1px solid rgba(245,158,11,0.28)',
                color: TOKENS.colors.warning, ...typo.caption, lineHeight: 1.5,
              }}>
                {isStale
                  ? 'El cierre quedó asociado a un turno maestro anterior. No se reabre para evitar afectar el turno nuevo.'
                  : 'No hay una reapertura disponible para este cierre.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
