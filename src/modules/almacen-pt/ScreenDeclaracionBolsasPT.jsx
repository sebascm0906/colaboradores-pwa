import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TOKENS, getTypo } from '../../tokens'
import { useSession } from '../../App'
import { logScreenError } from '../shared/logScreenError'
import { getPendingBagCustody, declareBagCustody } from './bagCustodyService'

export default function ScreenDeclaracionBolsasPT() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const warehouseId = session?.warehouse_id || null
  const employeeId = session?.employee_id || null

  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bagsDeclared, setBagsDeclared] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!warehouseId || !employeeId) {
      setError('Sin warehouse o empleado en sesión')
      setLoading(false)
      return
    }
    let alive = true
    async function load() {
      try {
        const res = await getPendingBagCustody({ warehouseId, employeeId, role: 'almacenista_pt' })
        if (!alive) return
        setRecord(res.items[0] || null)
      } catch (e) {
        logScreenError('ScreenDeclaracionBolsasPT', 'getPendingBagCustody', e)
        if (alive) setError('Error cargando custodia de bolsas')
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [warehouseId, employeeId])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!record?.id || !(Number(bagsDeclared) >= 0)) return
    setSubmitting(true)
    setError('')
    try {
      await declareBagCustody({ custodyId: record.id, bagsDeclaredByWorker: Number(bagsDeclared), employeeId, notes })
      setSuccess(true)
    } catch (e) {
      logScreenError('ScreenDeclaracionBolsasPT', 'declareBagCustody', e)
      setError(e?.message || 'Error al declarar bolsas')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: `linear-gradient(160deg, ${TOKENS.colors.bg0} 0%, ${TOKENS.colors.bg1} 50%, ${TOKENS.colors.bg2} 100%)`,
      paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { font-family: 'DM Sans', sans-serif; box-sizing: border-box; }
        button { border: none; background: none; cursor: pointer; }
      `}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate(-1)} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Declaración de Bolsas PT</span>
        </div>

        {loading && <Spinner />}

        {!loading && error && <ErrorBanner message={error} typo={typo} />}

        {!loading && !error && !record && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <p style={{ ...typo.title, color: TOKENS.colors.textSoft, margin: '0 0 8px' }}>Sin bolsas pendientes</p>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: 0 }}>
              La gerente aún no ha registrado entrega de bolsas para este turno
            </p>
          </div>
        )}

        {!loading && !error && record && !success && (
          <form onSubmit={handleSubmit}>
            <div style={{
              padding: '16px', borderRadius: TOKENS.radius.lg,
              background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`,
              marginBottom: 20,
            }}>
              <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: '0 0 12px' }}>BOLSAS ENTREGADAS POR GERENTE</p>
              <p style={{ fontSize: 36, fontWeight: 700, color: TOKENS.colors.text, margin: '0 0 4px', letterSpacing: '-0.03em' }}>
                {record.bags_issued}
              </p>
              {record.issued_at && (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0 }}>
                  Entregadas: {new Date(record.issued_at).toLocaleString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>

            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 10 }}>¿CUÁNTAS DEVUELVES?</p>

            <input
              type="number"
              required
              min="0"
              max={record.bags_issued * 2}
              placeholder={`Bolsas que devuelves (entregadas: ${record.bags_issued})`}
              value={bagsDeclared}
              onChange={e => setBagsDeclared(e.target.value)}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text, fontSize: 18, fontWeight: 600, marginBottom: 12,
              }}
            />

            <textarea
              placeholder="Notas (si sobran o falta algo)"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                color: TOKENS.colors.text, fontSize: 14, resize: 'none', marginBottom: 20,
              }}
            />

            {error && <p style={{ ...typo.caption, color: TOKENS.colors.error, marginBottom: 12 }}>{error}</p>}

            <button
              type="submit"
              disabled={submitting || bagsDeclared === ''}
              style={{
                width: '100%', padding: '16px', borderRadius: TOKENS.radius.lg,
                background: submitting ? TOKENS.colors.surface : 'linear-gradient(90deg, #15499B, #2B8FE0)',
                border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                ...typo.title, color: 'white',
                opacity: (submitting || bagsDeclared === '') ? 0.5 : 1,
              }}
            >
              {submitting ? 'Enviando...' : 'Declarar devolución'}
            </button>
          </form>
        )}

        {!loading && success && (
          <div style={{ textAlign: 'center', paddingTop: 48 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: `${TOKENS.colors.success}20`, border: `1px solid ${TOKENS.colors.success}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TOKENS.colors.success} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <p style={{ ...typo.title, color: TOKENS.colors.text, margin: '0 0 6px' }}>Devolución declarada</p>
            <p style={{ ...typo.body, color: TOKENS.colors.textMuted, margin: '0 0 24px' }}>La gerente validará el conteo final</p>
            <button
              onClick={() => navigate(-1)}
              style={{
                width: '100%', padding: '14px', borderRadius: TOKENS.radius.lg,
                background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                ...typo.title, color: TOKENS.colors.text, cursor: 'pointer',
              }}
            >
              Volver
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div style={{ width: 28, height: 28, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function ErrorBanner({ message, typo }) {
  return (
    <div style={{
      padding: '16px', borderRadius: TOKENS.radius.lg,
      background: `${TOKENS.colors.error}14`, border: `1px solid ${TOKENS.colors.error}30`,
    }}>
      <p style={{ ...typo.body, color: TOKENS.colors.error, margin: 0 }}>{message}</p>
    </div>
  )
}
