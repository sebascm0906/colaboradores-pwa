import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getActiveShift, getEnergyReadings, createEnergyReading } from './api'
import { resolveSupervisionWarehouseId } from './shiftContext'
import { validateEnergyReadings } from '../produccion/productionRules'
import { logScreenError } from '../shared/logScreenError'

export default function ScreenEnergia() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const supervisionWarehouseId = resolveSupervisionWarehouseId(session)
  const [shift, setShift] = useState(null)
  const [readings, setReadings] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState(null)
  const [formStart, setFormStart] = useState({ kwh: '', photo: null })
  const [formEnd, setFormEnd] = useState({ kwh: '', photo: null })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    try {
      const s = await getActiveShift(supervisionWarehouseId)
      setShift(s)
      if (s?.id) {
        const r = await getEnergyReadings(s.id).catch((e) => {
          logScreenError('ScreenEnergia', 'getEnergyReadings', e)
          return []
        })
        setReadings(r || [])
      }
    } catch (e) { logScreenError('ScreenEnergia', 'loadData', e) }
    finally { setLoading(false) }
  }

  const startReading = readings.find(r => r.reading_type === 'start')
  const endReading = readings.find(r => r.reading_type === 'end')
  const consumption = startReading && endReading ? (endReading.kwh_value - startReading.kwh_value) : null

  async function handleSubmit(type) {
    const form = type === 'start' ? formStart : formEnd
    if (!form.kwh) return

    const kwhValue = Number(form.kwh)
    if (!Number.isFinite(kwhValue) || kwhValue < 0) {
      setMsg({ type: 'error', text: 'Ingresa un numero positivo' })
      return
    }
    // Si es end: validar contra start
    if (type === 'end' && startReading) {
      if (kwhValue < Number(startReading.kwh_value)) {
        setMsg({ type: 'error', text: `Fin (${kwhValue}) menor que inicio (${startReading.kwh_value}). Revisar medidor.` })
        return
      }
    }
    // Foto obligatoria
    if (!form.photo) {
      setMsg({ type: 'error', text: 'Foto del medidor obligatoria' })
      return
    }

    setSubmitting(true)
    try {
      const payload = { shift_id: shift.id, reading_type: type, kwh_value: kwhValue }
      if (form.photo) {
        const reader = new FileReader()
        const b64 = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(form.photo) })
        payload.photo_base64 = b64
      }
      await createEnergyReading(payload)
      setMsg({ type: 'success', text: `Lectura de ${type === 'start' ? 'inicio' : 'fin'} registrada` })
      if (type === 'start') setFormStart({ kwh: '', photo: null })
      else setFormEnd({ kwh: '', photo: null })
      await loadData()
    } catch (err) { setMsg({ type: 'error', text: err.message || 'Error al registrar lectura' }) }
    finally { setSubmitting(false) }
  }

  // Validacion global (para mostrar badge en el header)
  const energyValidation = useMemo(
    () => validateEnergyReadings(startReading, endReading),
    [startReading, endReading]
  )

  useEffect(() => {
    if (msg) {
      const duration = msg.type === 'error' ? 6000 : 3500
      const t = setTimeout(() => setMsg(null), duration)
      return () => clearTimeout(t)
    }
  }, [msg])

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
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/supervision')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }}>
            <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Energia</span>
          </div>
        </div>

        {/* Msg */}
        {msg && (
          <div style={{
            marginBottom: 12, padding: '10px 14px', borderRadius: TOKENS.radius.md,
            background: msg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${msg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            <span style={{ ...typo.caption, color: msg.type === 'success' ? TOKENS.colors.success : TOKENS.colors.error }}>{msg.text}</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : !shift ? (
          <div style={{ marginTop: 40, padding: 24, borderRadius: TOKENS.radius.xl, background: TOKENS.glass.panel, border: `1px solid ${TOKENS.colors.border}`, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>&#x26A0;&#xFE0F;</div>
            <p style={{ ...typo.title, color: TOKENS.colors.warning }}>Sin turno activo</p>
            <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 6 }}>Abre un turno para poder registrar lecturas.</p>
            <button onClick={() => navigate('/supervision/turno')} style={{
              marginTop: 14, padding: '10px 20px', borderRadius: TOKENS.radius.sm,
              background: 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
              color: 'white', fontSize: 13, fontWeight: 600,
            }}>Ir a Control de Turno</button>
          </div>
        ) : (
          <>
            {/* Consumo total */}
            {consumption !== null && (
              <div style={{
                marginBottom: 16, padding: 20, borderRadius: TOKENS.radius.xl,
                background: TOKENS.glass.hero, border: `1px solid ${TOKENS.colors.borderBlue}`,
                boxShadow: `${TOKENS.shadow.md}, ${TOKENS.shadow.inset}`,
                textAlign: 'center',
              }}>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>CONSUMO DEL TURNO</p>
                <p style={{ fontSize: 36, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0, letterSpacing: '-0.02em' }}>{consumption.toFixed(1)}</p>
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>kWh</p>
              </div>
            )}

            {/* Card Lectura Inicio */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 12,
              background: startReading ? 'rgba(34,197,94,0.04)' : TOKENS.glass.panel,
              border: `1px solid ${startReading ? 'rgba(34,197,94,0.15)' : TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.soft,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Lectura Inicio</p>
                {startReading && (
                  <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>REGISTRADA</span>
                  </div>
                )}
              </div>

              {startReading ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 28, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{startReading.kwh_value} <span style={{ fontSize: 14, fontWeight: 400, color: TOKENS.colors.textMuted }}>kWh</span></p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{startReading.created_at || ''}</p>
                  </div>
                  {startReading.photo_url && (
                    <img src={startReading.photo_url} alt="lectura" style={{ width: 56, height: 56, borderRadius: TOKENS.radius.sm, objectFit: 'cover', border: `1px solid ${TOKENS.colors.border}` }} />
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>kWh</label>
                  <input type="number" step="0.1" min="0" value={formStart.kwh} onChange={e => setFormStart(p => ({ ...p, kwh: e.target.value }))}
                    placeholder="0.0"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />

                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Foto del medidor</label>
                  <input type="file" accept="image/*" capture="environment" onChange={e => setFormStart(p => ({ ...p, photo: e.target.files?.[0] || null }))}
                    style={{ width: '100%', padding: '8px 0', color: TOKENS.colors.textMuted, fontSize: 13, marginBottom: 12 }} />

                  <button onClick={() => handleSubmit('start')} disabled={submitting || !formStart.kwh}
                    style={{
                      width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: !formStart.kwh ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${!formStart.kwh ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Registrando...' : 'Registrar Inicio'}
                  </button>
                </div>
              )}
            </div>

            {/* Card Lectura Fin */}
            <div style={{
              padding: 16, borderRadius: TOKENS.radius.xl, marginBottom: 12,
              background: endReading ? 'rgba(34,197,94,0.04)' : !startReading ? 'rgba(148,163,184,0.04)' : TOKENS.glass.panel,
              border: `1px solid ${endReading ? 'rgba(34,197,94,0.15)' : TOKENS.colors.border}`,
              boxShadow: TOKENS.shadow.soft,
              opacity: !startReading && !endReading ? 0.5 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ ...typo.title, color: TOKENS.colors.text, margin: 0 }}>Lectura Fin</p>
                {endReading && (
                  <div style={{ padding: '4px 10px', borderRadius: TOKENS.radius.pill, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: TOKENS.colors.success }}>REGISTRADA</span>
                  </div>
                )}
              </div>

              {!startReading && !endReading ? (
                <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, margin: 0, textAlign: 'center', padding: '8px 0' }}>
                  Registra la lectura de inicio primero
                </p>
              ) : endReading ? (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 28, fontWeight: 700, color: TOKENS.colors.blue2, margin: 0 }}>{endReading.kwh_value} <span style={{ fontSize: 14, fontWeight: 400, color: TOKENS.colors.textMuted }}>kWh</span></p>
                    <p style={{ ...typo.caption, color: TOKENS.colors.textMuted, marginTop: 4 }}>{endReading.created_at || ''}</p>
                  </div>
                  {endReading.photo_url && (
                    <img src={endReading.photo_url} alt="lectura" style={{ width: 56, height: 56, borderRadius: TOKENS.radius.sm, objectFit: 'cover', border: `1px solid ${TOKENS.colors.border}` }} />
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>kWh</label>
                  <input type="number" step="0.1" min="0" value={formEnd.kwh} onChange={e => setFormEnd(p => ({ ...p, kwh: e.target.value }))}
                    placeholder="0.0"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: TOKENS.radius.sm, background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`, color: 'white', fontSize: 13, fontFamily: 'inherit', marginBottom: 10 }} />

                  <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 4 }}>Foto del medidor</label>
                  <input type="file" accept="image/*" capture="environment" onChange={e => setFormEnd(p => ({ ...p, photo: e.target.files?.[0] || null }))}
                    style={{ width: '100%', padding: '8px 0', color: TOKENS.colors.textMuted, fontSize: 13, marginBottom: 12 }} />

                  <button onClick={() => handleSubmit('end')} disabled={submitting || !formEnd.kwh}
                    style={{
                      width: '100%', padding: '10px', borderRadius: TOKENS.radius.sm, fontSize: 13, fontWeight: 600, color: 'white',
                      background: !formEnd.kwh ? TOKENS.colors.surface : 'linear-gradient(135deg, #15499B 0%, #2B8FE0 100%)',
                      border: `1px solid ${!formEnd.kwh ? TOKENS.colors.border : 'transparent'}`,
                      opacity: submitting ? 0.6 : 1,
                    }}>
                    {submitting ? 'Registrando...' : 'Registrar Fin'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        <div style={{ height: 32 }} />
      </div>
    </div>
  )
}
