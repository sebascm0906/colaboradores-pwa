import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import TransformationScreen from '../transformaciones/TransformationScreen'
import { getDaySummary, DEFAULT_WAREHOUSE_ID } from './ptService'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenTransformacionPT() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const warehouseId = session?.warehouse_id || DEFAULT_WAREHOUSE_ID

  const [loading, setLoading] = useState(true)
  const [blockedByHandover, setBlockedByHandover] = useState(false)

  useEffect(() => {
    let mounted = true
    getDaySummary(warehouseId)
      .then((summary) => {
        if (!mounted) return
        setBlockedByHandover(Boolean(summary?.pt_blocked_by_handover))
      })
      .catch((error) => {
        logScreenError('ScreenTransformacionPT', 'getDaySummary', error)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [warehouseId])

  if (loading) return <TransformationScreen roleScope="pt" />

  if (blockedByHandover) {
    return (
      <div style={{
        minHeight: '100dvh',
        background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
        padding: '24px 16px',
      }}>
        <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 'env(safe-area-inset-top)' }}>
          <button onClick={() => navigate('/almacen-pt')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{
            padding: 18,
            borderRadius: TOKENS.radius.xl,
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.30)',
          }}>
            <p style={{ ...typo.title, color: TOKENS.colors.error, margin: 0 }}>PT cerrado por relevo pendiente</p>
            <p style={{ ...typo.body, color: TOKENS.colors.textSoft, margin: '8px 0 0' }}>
              La transformación PT queda bloqueada hasta aceptar el relevo del almacén.
            </p>
            <button onClick={() => navigate('/almacen-pt/handover')} style={{
              marginTop: 14,
              width: '100%',
              padding: 14,
              borderRadius: TOKENS.radius.lg,
              background: 'rgba(239,68,68,0.16)',
              border: '1px solid rgba(239,68,68,0.32)',
              color: TOKENS.colors.error,
              fontSize: 14,
              fontWeight: 700,
            }}>
              Ir a relevo PT
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <TransformationScreen roleScope="pt" />
}
