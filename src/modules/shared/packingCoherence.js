// packingCoherence.js — Fase 3
// Analiza la coherencia entre ciclos producidos y empaques registrados.
// NO hace validaciones duras, solo detecta desbalances para mostrar avisos
// UX-friendly ("Falta empacar" / "Ya empacaste de mas").
//
// Logica pura, sin dependencias de pantallas. Reusable en
// ScreenEmpaqueRolito, ScreenHandoverTurno, ScreenCierreRolito.

// Tolerancias por defecto (ajustables por la pantalla que lo use)
const DEFAULT_TOLERANCE_PCT = 5   // margen operativo sobre lo producido
const DEFAULT_MIN_DIFF_KG = 5     // diferencias menores se ignoran (ruido)

/**
 * Extrae el cycle_id de una entrada de empaque.
 * Backend puede devolver cycle_id como number o como [id, name] (Odoo).
 */
function extractCycleId(entry) {
  const raw = entry?.cycle_id
  if (raw == null) return null
  return Array.isArray(raw) ? raw[0] : raw
}

/**
 * Calcula coherencia empaque-produccion ciclo por ciclo.
 *
 * @param {object[]} cycles — ciclos del turno
 * @param {object[]} packingEntries — entries de empaque del turno
 * @param {object} [opts] — { tolerancePct, minDiffKg }
 * @returns {{
 *   perCycle: Array<{
 *     cycleId, cycleNumber, produced, packed, diff, pct,
 *     status: 'ok'|'unpacked'|'partial'|'over',
 *     message: string|null
 *   }>,
 *   summary: {
 *     anyUnpacked: boolean,
 *     anyPartial: boolean,
 *     anyOver: boolean,
 *     totalProduced: number,
 *     totalPacked: number,
 *     diffKg: number,
 *   }
 * }}
 */
export function computePackingCoherence(cycles, packingEntries, opts = {}) {
  const tolerancePct = opts.tolerancePct ?? DEFAULT_TOLERANCE_PCT
  const minDiffKg = opts.minDiffKg ?? DEFAULT_MIN_DIFF_KG

  // Acumular kg empacados por cycle_id
  const byCycle = new Map()
  for (const e of packingEntries || []) {
    const id = extractCycleId(e)
    if (id == null) continue
    byCycle.set(id, (byCycle.get(id) || 0) + (Number(e.total_kg) || 0))
  }

  const perCycle = (cycles || [])
    .filter(c => c.state === 'dumped' && (Number(c.kg_dumped) || 0) > 0)
    .map(c => {
      const produced = Number(c.kg_dumped) || 0
      const packed = byCycle.get(c.id) || 0
      const diff = produced - packed
      const pct = produced > 0 ? (diff / produced) * 100 : 0

      let status = 'ok'
      let message = null

      if (packed <= 0) {
        status = 'unpacked'
        message = `Ciclo #${c.cycle_number || c.id} todavia no se ha empacado`
      } else if (diff > minDiffKg && pct > tolerancePct) {
        status = 'partial'
        message = `Falta empacar producto del ciclo #${c.cycle_number || c.id}`
      } else if (packed - produced > minDiffKg && packed > produced * (1 + tolerancePct / 100)) {
        status = 'over'
        message = `Ya empacaste mas de lo producido en el ciclo #${c.cycle_number || c.id}`
      }

      return {
        cycleId: c.id,
        cycleNumber: c.cycle_number,
        produced,
        packed,
        diff,
        pct,
        status,
        message,
      }
    })

  const totalProduced = perCycle.reduce((s, x) => s + x.produced, 0)
  const totalPacked = perCycle.reduce((s, x) => s + x.packed, 0)

  return {
    perCycle,
    summary: {
      anyUnpacked: perCycle.some(x => x.status === 'unpacked'),
      anyPartial: perCycle.some(x => x.status === 'partial'),
      anyOver: perCycle.some(x => x.status === 'over'),
      totalProduced,
      totalPacked,
      diffKg: totalProduced - totalPacked,
    },
  }
}

/**
 * Retorna el primer mensaje de alerta (el mas prioritario)
 * para mostrar en la UI. `null` si todo esta OK.
 */
export function getCoherenceHeadline(coherence) {
  if (!coherence) return null
  const { summary } = coherence
  if (summary.anyOver) return 'Ya empacaste mas de lo producido en algun ciclo'
  if (summary.anyPartial) return 'Falta empacar producto de este turno'
  if (summary.anyUnpacked) return 'Hay ciclos sin empacar todavia'
  return null
}
