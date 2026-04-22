// ScreenIncidenciaRolito.jsx — V2 Registro de Incidencias
// Paros: crea gf.production.downtime con category_id de gf.production.downtime.category
// Merma: crea gf.production.scrap con reason_id de gf.production.scrap.reason
// Backend confirmado en produccion — todos los modelos y campos existen.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../../App'
import { TOKENS, getTypo } from '../../tokens'
import { api } from '../../lib/api'
import { getMyShift } from './api'
import {
  registerDowntime,
  registerScrap,
  getDowntimeCategories,
  getScrapReasons,
} from './rolitoService'
import VoiceInputButton from '../shared/voice/VoiceInputButton'
import { sendVoiceFeedback } from '../shared/voice/voiceFeedback'
import { matchByFuzzyName, matchByNumericId } from '../shared/voice/voiceMatchers'

// Fallbacks if Odoo fetch fails
const FALLBACK_DOWNTIME_CATS = [
  { id: 1, name: 'Falta de agua' },
  { id: 2, name: 'Corte de energia' },
  { id: 3, name: 'Falla de maquina' },
  { id: 4, name: 'Paro por calidad' },
]
const FALLBACK_SCRAP_REASONS = [
  { id: 1, name: 'Derretido' },
  { id: 2, name: 'Roto' },
  { id: 3, name: 'Sellado deficiente' },
]

const PARO_ICONS = { 'Falta de agua': '\uD83D\uDCA7', 'Corte de energia': '\u26A1', 'Falla de maquina': '\u2699' }
const SCRAP_ICONS = { 'Derretido': '\uD83D\uDCC9', 'Roto': '\u274C', 'Sellado deficiente': '\u26A0' }

export default function ScreenIncidenciaRolito() {
  const navigate = useNavigate()
  const { session } = useSession()
  const [sw] = useState(window.innerWidth)
  const typo = useMemo(() => getTypo(sw), [sw])

  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Real categories from Odoo
  const [downtimeCategories, setDowntimeCategories] = useState([])
  const [scrapReasons, setScrapReasons] = useState([])

  // Lines for line_id (required by backend for scrap/downtime)
  const [lines, setLines] = useState([])
  const [lineId, setLineId] = useState('')

  // Form — mode: 'paro' or 'merma'
  const [mode, setMode] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null) // downtime category or scrap reason
  const [kgLost, setKgLost] = useState('')
  const [notes, setNotes] = useState('')

  // Voice state (PoC Fase 1): captura el ultimo envelope de W120 para feedback al submit.
  const [voiceContext, setVoiceContext] = useState(null) // {trace_id, ai_output} | null
  const [voiceNote, setVoiceNote] = useState('')         // banner informativo

  useEffect(() => {
    Promise.all([
      getMyShift().catch(() => null),
      getDowntimeCategories().catch(() => FALLBACK_DOWNTIME_CATS),
      getScrapReasons().catch(() => FALLBACK_SCRAP_REASONS),
      api('GET', '/api/production/lines?plant_id=76').catch(() => []),
    ]).then(([s, cats, reasons, linesRes]) => {
      setShift(s)
      setDowntimeCategories(cats?.length ? cats : FALLBACK_DOWNTIME_CATS)
      setScrapReasons(reasons?.length ? reasons : FALLBACK_SCRAP_REASONS)
      // Extraer array de lineas de la respuesta (varias formas posibles)
      const items = Array.isArray(linesRes) ? linesRes
        : Array.isArray(linesRes?.lines) ? linesRes.lines
        : Array.isArray(linesRes?.data?.lines) ? linesRes.data.lines
        : Array.isArray(linesRes?.items) ? linesRes.items
        : []
      setLines(items)
      // Auto-select si solo hay 1 linea de produccion (Barras/Rolito)
      // Excluir lineas de test (Codex) que tienen type='rolito' pero no son reales
      const prodLines = items.filter(l => {
        const n = String(l.type || l.name || '').toLowerCase()
        const nm = String(l.name || '').toLowerCase()
        return (n.includes('barra') || n.includes('rolito'))
          && !nm.includes('codex') && !nm.includes('test')
      })
      if (prodLines.length === 1) setLineId(String(prodLines[0].id))
    }).finally(() => setLoading(false))
  }, [])

  const isMerma = mode === 'merma'

  // Metadata para W120 — shape minimo {id,name} de ambos catalogos.
  const voiceMetadata = useMemo(() => ({
    user_id: session?.employee_id || null,
    canal: 'pwa_colaboradores',
    downtime_categories: (downtimeCategories || []).map(c => ({ id: Number(c.id), name: c.name })),
    scrap_reasons: (scrapReasons || []).map(r => ({ id: Number(r.id), name: r.name })),
  }), [session?.employee_id, downtimeCategories, scrapReasons])

  // ── Voice-to-form handlers ────────────────────────────────────────────────
  function handleVoiceResult(envelope) {
    const d = envelope?.data || {}
    setError('')

    // mode: schema lo valida como enum['paro','merma']. Auto-seleccionar.
    let resolvedMode = null
    if (d.mode === 'paro' || d.mode === 'merma') {
      resolvedMode = d.mode
      setMode(resolvedMode)
    }

    // Categoria: matchea por id en el catalogo del mode; fallback fuzzy por
    // category_name. Si no matchea, deja null (usuario elige manualmente).
    const catalog = resolvedMode === 'paro' ? downtimeCategories
      : resolvedMode === 'merma' ? scrapReasons
      : null
    let matchedCategory = null
    if (catalog) {
      if (d.category_id !== null && d.category_id !== undefined) {
        matchedCategory = matchByNumericId(d.category_id, catalog, 'id')
      }
      if (!matchedCategory && d.category_name) {
        matchedCategory = matchByFuzzyName(d.category_name, catalog, 'name')
      }
    }
    setSelectedCategory(matchedCategory)

    // Campos por mode
    if (resolvedMode === 'merma' && typeof d.kg_lost === 'number' && d.kg_lost > 0) {
      setKgLost(String(d.kg_lost))
    }
    if (typeof d.notas === 'string' && d.notas.trim()) {
      setNotes(d.notas.trim())
    }

    setVoiceContext({ trace_id: envelope.trace_id, ai_output: d })

    const bits = []
    const transcript = envelope?.meta?.transcript
    const confidence = envelope?.meta?.stt_confidence
    if (transcript) bits.push(`"${transcript}"`)
    if (typeof confidence === 'number') bits.push(`confianza ${(confidence * 100).toFixed(0)}%`)
    if (!resolvedMode) bits.push('tipo sin match — elige paro o merma')
    if (resolvedMode && !matchedCategory) bits.push('categoria sin match — selecciona manual')
    setVoiceNote(bits.length ? `IA: ${bits.join(' · ')}` : 'IA proceso la voz — revisa y confirma')
  }

  function handleVoiceError(error_code, msg) {
    setError(`${error_code}: ${msg}`)
    setVoiceNote('')
    setTimeout(() => setError(''), 3500)
  }

  async function handleSubmit() {
    if (!selectedCategory || !shift?.id) return
    if (!lineId) { setError('Selecciona una línea'); return }
    setSaving(true)
    setError('')

    try {
      const lid = Number(lineId) || 0
      if (isMerma) {
        const kg = parseFloat(kgLost)
        if (!kg || kg <= 0) { setError('Ingresa los kg perdidos'); setSaving(false); return }
        await registerScrap(shift.id, selectedCategory.id, kg, notes || '', lid)
      } else {
        await registerDowntime(shift.id, selectedCategory.id, notes || selectedCategory.name, 0, lid)
      }

      // Voice feedback best-effort: dispara fire-and-forget a W122 si hubo voz.
      if (voiceContext?.trace_id) {
        sendVoiceFeedback({
          trace_id: voiceContext.trace_id,
          ai_output: voiceContext.ai_output || {},
          final_output: {
            mode,
            category_id: selectedCategory.id,
            category_name: selectedCategory.name,
            kg_lost: isMerma ? parseFloat(kgLost) || 0 : null,
            notas: notes || '',
            line_id: lid,
          },
          metadata: {
            context_id: 'form_incidencia_rolito',
            shift_id: shift?.id || null,
            user_id: session?.employee_id || null,
          },
        })
      }

      setSuccess('Incidencia registrada')
      setMode(null)
      setSelectedCategory(null)
      setKgLost('')
      setNotes('')
      setVoiceContext(null)
      setVoiceNote('')
      setTimeout(() => navigate('/produccion'), 1500)
    } catch (e) {
      setError(e.message || 'Error al registrar incidencia')
    } finally {
      setSaving(false)
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
        button { border: none; background: none; cursor: pointer; }
        input, textarea { font-family: 'DM Sans', sans-serif; }
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
          <span style={{ ...typo.title, color: TOKENS.colors.textSoft }}>Reportar Incidencia</span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 32, height: 32, border: '2px solid rgba(255,255,255,0.12)', borderTop: '2px solid #2B8FE0', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* ── Voice input (PoC Fase 1) ──────────────────────────────── */}
            <div>
              <VoiceInputButton
                context_id="form_incidencia_rolito"
                label="Manten presionado para dictar incidencia"
                metadata={voiceMetadata}
                disabled={loading || saving || (downtimeCategories.length === 0 && scrapReasons.length === 0)}
                onResult={handleVoiceResult}
                onError={handleVoiceError}
              />
              {voiceNote && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: TOKENS.radius.md,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
                }}>
                  <p style={{ ...typo.caption, color: TOKENS.colors.warning, margin: 0 }}>
                    {voiceNote}
                  </p>
                </div>
              )}
            </div>

            {/* Mode selection — Paro vs Merma */}
            <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 2 }}>TIPO DE INCIDENCIA</p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
              {[{ key: 'paro', label: 'Paro', icon: '\u23F8' }, { key: 'merma', label: 'Merma', icon: '\uD83D\uDCC9' }].map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); setSelectedCategory(null) }}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: TOKENS.radius.md,
                    background: mode === m.key ? 'rgba(245,158,11,0.12)' : TOKENS.colors.surface,
                    border: `2px solid ${mode === m.key ? 'rgba(245,158,11,0.4)' : TOKENS.colors.border}`,
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: 24, display: 'block', marginBottom: 4 }}>{m.icon}</span>
                  <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600 }}>{m.label}</span>
                </button>
              ))}
            </div>

            {/* Line selector — required by backend */}
            {mode && lines.length > 0 && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 6 }}>LÍNEA</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {lines.filter(l => {
                    const n = String(l.type || l.name || '').toLowerCase()
                    const nm = String(l.name || '').toLowerCase()
                    return (n.includes('barra') || n.includes('rolito'))
                      && !nm.includes('codex') && !nm.includes('test')
                  }).map(l => {
                    const isSelected = String(l.id) === String(lineId)
                    return (
                      <button
                        key={l.id}
                        onClick={() => setLineId(String(l.id))}
                        style={{
                          flex: 1, padding: '12px 10px', borderRadius: TOKENS.radius.md,
                          background: isSelected ? 'rgba(43,143,224,0.15)' : TOKENS.colors.surface,
                          border: `2px solid ${isSelected ? 'rgba(43,143,224,0.4)' : TOKENS.colors.border}`,
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600, fontSize: 14 }}>
                          {l.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Category/Reason selection */}
            {mode === 'paro' && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 2 }}>CATEGORIA DEL PARO</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {downtimeCategories.map(cat => {
                    const isSelected = selectedCategory?.id === cat.id
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 16px', borderRadius: TOKENS.radius.md,
                          background: isSelected ? 'rgba(245,158,11,0.12)' : TOKENS.colors.surface,
                          border: `2px solid ${isSelected ? 'rgba(245,158,11,0.4)' : TOKENS.colors.border}`,
                          width: '100%', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 22 }}>{PARO_ICONS[cat.name] || '\u23F8'}</span>
                        <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600, fontSize: 15 }}>
                          {cat.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {mode === 'merma' && (
              <>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 2 }}>RAZON DE MERMA</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scrapReasons.map(r => {
                    const isSelected = selectedCategory?.id === r.id
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedCategory(r)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '14px 16px', borderRadius: TOKENS.radius.md,
                          background: isSelected ? 'rgba(245,158,11,0.12)' : TOKENS.colors.surface,
                          border: `2px solid ${isSelected ? 'rgba(245,158,11,0.4)' : TOKENS.colors.border}`,
                          width: '100%', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 22 }}>{SCRAP_ICONS[r.name] || '\uD83D\uDCC9'}</span>
                        <span style={{ ...typo.body, color: TOKENS.colors.textSoft, fontWeight: 600, fontSize: 15 }}>
                          {r.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Kg lost (for merma) */}
            {isMerma && selectedCategory && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>KG PERDIDOS</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setKgLost(v => String(Math.max(0, (parseInt(v) || 0) - 5)))}
                    style={{
                      width: 48, height: 48, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 24, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>-</button>
                  <input
                    type="number" inputMode="numeric"
                    value={kgLost} onChange={e => setKgLost(e.target.value)}
                    placeholder="0"
                    style={{
                      flex: 1, padding: '12px', borderRadius: TOKENS.radius.md,
                      background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                      color: 'white', fontSize: 24, fontWeight: 700, outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                  <button onClick={() => setKgLost(v => String((parseInt(v) || 0) + 5))}
                    style={{
                      width: 48, height: 48, borderRadius: TOKENS.radius.md,
                      background: TOKENS.colors.surface, border: `1px solid ${TOKENS.colors.border}`,
                      color: TOKENS.colors.text, fontSize: 24, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>+</button>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedCategory && (
              <div>
                <p style={{ ...typo.overline, color: TOKENS.colors.textLow, marginBottom: 8 }}>DETALLE (OPCIONAL)</p>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Describe brevemente..."
                  rows={3}
                  style={{
                    width: '100%', padding: '12px', borderRadius: TOKENS.radius.md,
                    background: 'rgba(255,255,255,0.05)', border: `1px solid ${TOKENS.colors.border}`,
                    color: 'white', fontSize: 14, outline: 'none', resize: 'vertical',
                  }}
                />
              </div>
            )}

            {/* Messages */}
            {error && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: TOKENS.colors.errorSoft, border: '1px solid rgba(239,68,68,0.3)',
                color: TOKENS.colors.error, ...typo.caption, textAlign: 'center',
              }}>{error}</div>
            )}
            {success && (
              <div style={{
                padding: 12, borderRadius: TOKENS.radius.md,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
                color: TOKENS.colors.success, ...typo.caption, textAlign: 'center',
              }}>{success}</div>
            )}

            {/* Submit */}
            {selectedCategory && (
              <button
                onClick={handleSubmit}
                disabled={saving || (isMerma && (!kgLost || parseFloat(kgLost) <= 0))}
                style={{
                  width: '100%', padding: '16px',
                  borderRadius: TOKENS.radius.lg,
                  background: 'linear-gradient(90deg, #f59e0b, #eab308)',
                  color: 'white', fontSize: 16, fontWeight: 700,
                  boxShadow: '0 10px 24px rgba(245,158,11,0.25)',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'REPORTAR'}
              </button>
            )}

            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </div>
  )
}
