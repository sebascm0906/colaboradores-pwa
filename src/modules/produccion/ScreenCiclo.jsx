import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { getMyShift, createCycle, updateCycle, getCycles } from './api'

export default function ScreenCiclo() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])
  const isBarras = session?.role === 'operador_barra'
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Formulario
  const [freezeStart, setFreezeStart] = useState('')
  const [freezeEnd, setFreezeEnd] = useState('')
  const [defrostStart, setDefrostStart] = useState('')
  const [defrostEnd, setDefrostEnd] = useState('')
  const [kgDumped, setKgDumped] = useState('')

  useEffect(() => {
    loadShift()
  }, [])

  async function loadShift() {
    try {
      const s = await getMyShift()
      setShift(s)
    } catch {
      setError('Sin turno activo')
    } finally {
      setLoading(false)
    }
  }

  function nowTime() {
    return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function timeToDatetime(timeStr) {
    if (!timeStr) return null
    const [h, m] = timeStr.split(':')
    const d = new Date()
    d.setHours(parseInt(h), parseInt(m), 0, 0)
    // Odoo espera "YYYY-MM-DD HH:MM:SS", no ISO con T/Z
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
  }

  async function handleSubmit() {
    if (!freezeStart) { setError('Hora de inicio de congelación es obligatoria'); return }
    if (!shift?.id) return
    setError('')
    setSaving(true)

    try {
      // Crear ciclo con freeze_start
      const cycle = await createCycle({
        shift_id: shift.id,
        machine_id: isBarras ? 1 : 2, // 1=Tanque Salmuera (Barras), 2=Evaporador (Rolito)
        freeze_start: timeToDatetime(freezeStart),
      })

      const cycleId = cycle?.id || cycle?.cycle_id
      if (!cycleId) throw new Error('No se pudo crear el ciclo')

      // Actualizar con los demás campos si existen
      const updates = {}
      if (freezeEnd) updates.freeze_end = timeToDatetime(freezeEnd)
      if (defrostStart) updates.defrost_start = timeToDatetime(defrostStart)
      if (defrostEnd) updates.defrost_end = timeToDatetime(defrostEnd)
      if (kgDumped) updates.kg_dumped = parseFloat(kgDumped)

      if (Object.keys(updates).length > 0) {
        await updateCycle(cycleId, updates)
      }

      setSuccess('Ciclo registrado correctamente')
      // Limpiar formulario
      setFreezeStart('')
      setFreezeEnd('')
      setDefrostStart('')
      setDefrostEnd('')
      setKgDumped('')

      setTimeout(() => navigate('/produccion'), 1500)
    } catch (e) {
      setError(e.message || 'Error al guardar el ciclo')
    } finally {
      setSaving(false)
    }
  }

  const canSubmit = freezeStart && !saving

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
        input { font-family: 'DM Sans', sans-serif; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 20, paddingBottom: 16 }}>
          <button onClick={() => navigate('/produccion')} style={{
            width: 38, height: 38, borderRadius: TOKENS.radius.md,
            background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>{isBarras ? 'Ciclo Salmuera' : 'Nuevo Ciclo'}</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Congelación */}
            <SectionLabel text="CONGELACIÓN" typo={typo} />
            <div style={{ display: 'flex', gap: 10 }}>
              <TimeField label="Hora inicio" value={freezeStart} onChange={setFreezeStart} onNow={() => setFreezeStart(nowTime())} typo={typo} required />
              <TimeField label="Hora fin" value={freezeEnd} onChange={setFreezeEnd} onNow={() => setFreezeEnd(nowTime())} typo={typo} />
            </div>

            {/* Deshielo */}
            <SectionLabel text="DESHIELO" typo={typo} />
            <div style={{ display: 'flex', gap: 10 }}>
              <TimeField label="Hora inicio" value={defrostStart} onChange={setDefrostStart} onNow={() => setDefrostStart(nowTime())} typo={typo} />
              <TimeField label="Hora fin" value={defrostEnd} onChange={setDefrostEnd} onNow={() => setDefrostEnd(nowTime())} typo={typo} />
            </div>

            {/* Kg descargados */}
            <SectionLabel text="DESCARGA" typo={typo} />
            <div>
              <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>Kg descargados</label>
              <input
                type="number"
                inputMode="decimal"
                value={kgDumped}
                onChange={e => setKgDumped(e.target.value)}
                placeholder="0"
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                  color: 'white', fontSize: 18, fontWeight: 700, outline: 'none',
                  letterSpacing: '-0.02em',
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
              }}>
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                color: TOKENS.colors.success, ...typo.caption, textAlign: 'center',
              }}>
                {success}
              </div>
            )}

            {/* Botón guardar */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '14px',
                borderRadius: TOKENS.radius.lg,
                background: canSubmit ? 'linear-gradient(90deg, #15499B, #2B8FE0)' : TOKENS.colors.surface,
                color: canSubmit ? 'white' : TOKENS.colors.textLow,
                fontSize: 15, fontWeight: 600,
                opacity: saving ? 0.6 : 1,
                boxShadow: canSubmit ? '0 10px 24px rgba(21,73,155,0.30)' : 'none',
                marginTop: 8,
              }}
            >
              {saving ? 'Guardando...' : 'Registrar Ciclo'}
            </button>

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ text, typo }) {
  return (
    <p style={{ ...typo.overline, color: TOKENS.colors.textLow, margin: 0, marginTop: 8 }}>{text}</p>
  )
}

function TimeField({ label, value, onChange, onNow, typo, required }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ ...typo.caption, color: TOKENS.colors.textMuted, display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: TOKENS.colors.error }}> *</span>}
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="time"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: TOKENS.radius.sm,
            background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
            color: 'white', fontSize: 15, fontWeight: 600, outline: 'none',
          }}
        />
        <button
          onClick={onNow}
          style={{
            padding: '0 10px', borderRadius: TOKENS.radius.sm,
            background: 'rgba(43,143,224,0.12)', border: `1px solid rgba(43,143,224,0.25)`,
            color: TOKENS.colors.blue2, fontSize: 11, fontWeight: 700,
          }}
        >
          AHORA
        </button>
      </div>
    </div>
  )
}
