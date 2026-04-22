/* ============================================================================
   voiceMatchers — Helpers puros para mapear output del LLM (W120) a objetos
   reales de catálogos Odoo (product.product, gf.production.scrap.reason, etc).

   Las 3 funciones comparten estas garantías:
   - No efectos secundarios. No mutan argumentos.
   - Devuelven el OBJETO del catálogo (no sólo el id), o `null` si no matchean.
   - Tolerantes a inputs inválidos: null/undefined/arrays vacíos/tipos sucios.

   Origen: se extrajo de `ScreenMerma.jsx::matchReasonFromLLM` para que los
   screens del operador rolito (empaque, incidencia) reutilicen el mismo patrón
   sin duplicar lógica.
============================================================================ */

/**
 * Match por keyword sobre el nombre del catálogo.
 *
 * Mapa `keywordMap` traduce el valor enum del LLM al substring que buscar
 * en `item.name` (case-insensitive). Ejemplo típico:
 *   motivoLLM = "derretimiento" -> keywordMap.derretimiento = "derret"
 *   -> busca el primer item cuyo name.toLowerCase() incluya "derret"
 *   -> devuelve {id:1, name:"Derretido"}
 *
 * @param {string|null|undefined} llmValue  valor enum del LLM
 * @param {Array<{[key:string]: any}>|null|undefined} list  catálogo
 * @param {Object<string,string>} keywordMap  enum -> substring a buscar
 * @param {string} [field='name']  campo de `item` a inspeccionar
 * @returns {Object|null}  primer item que matchea o null
 */
export function matchByKeyword(llmValue, list, keywordMap, field = 'name') {
  if (!llmValue || !Array.isArray(list) || !keywordMap) return null
  const keyword = keywordMap[llmValue]
  if (!keyword) return null
  const needle = String(keyword).toLowerCase()
  return list.find((item) => String(item?.[field] || '').toLowerCase().includes(needle)) || null
}

/**
 * Match por substring del propio llmValue (sin mapa intermedio).
 *
 * Útil cuando el LLM devuelve texto libre cercano al nombre del SKU y queremos
 * encontrarlo por tokens. Ejemplo: llmValue="bolsa 5.5 rolito" contra catálogo
 * ["LAURITA BOLSA DE HIELO ROLITO (5.5KG)"] matchea por "bolsa" + "5.5" + "rolito".
 *
 * Estrategia: split en tokens, descarta tokens <2 chars, exige que TODOS los
 * tokens aparezcan en `item[field]` (case-insensitive). Primer match gana.
 *
 * @param {string|null|undefined} llmValue
 * @param {Array<{[key:string]: any}>|null|undefined} list
 * @param {string} [field='name']
 * @returns {Object|null}
 */
export function matchByFuzzyName(llmValue, list, field = 'name') {
  if (!llmValue || !Array.isArray(list) || list.length === 0) return null
  const tokens = String(llmValue).toLowerCase().split(/[\s\-\/()]+/).filter((t) => t.length >= 2)
  if (!tokens.length) return null
  return list.find((item) => {
    const hay = String(item?.[field] || '').toLowerCase()
    return tokens.every((tok) => hay.includes(tok))
  }) || null
}

/**
 * Match por id numérico.
 *
 * El LLM a veces devuelve el id directo (p.ej. "ciclo 15" -> 15) o, por
 * seguridad, un número alterno (cycle_number). Probamos `field` primero
 * (default 'id') y luego `altField` si se especifica.
 *
 * Coerción tolerante: acepta number o string numérica. Devuelve null ante
 * NaN o ids inválidos.
 *
 * @param {number|string|null|undefined} num
 * @param {Array<{[key:string]: any}>|null|undefined} list
 * @param {string} [field='id']
 * @param {string|null} [altField=null]  campo alterno a probar si falla el primario
 * @returns {Object|null}
 */
export function matchByNumericId(num, list, field = 'id', altField = null) {
  if (num === null || num === undefined || !Array.isArray(list)) return null
  const target = Number(num)
  if (!Number.isFinite(target)) return null
  const byPrimary = list.find((item) => Number(item?.[field]) === target)
  if (byPrimary) return byPrimary
  if (altField) return list.find((item) => Number(item?.[altField]) === target) || null
  return null
}
