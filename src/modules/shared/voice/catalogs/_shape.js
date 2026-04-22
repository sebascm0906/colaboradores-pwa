/* ============================================================================
   Voice catalog shape (JSDoc types only — no runtime code)

   Los catálogos shared son la fuente de verdad de los FALLBACKS que usan las
   screens cuando la API de Odoo falla. NO reemplazan el fetch real; solo
   garantizan un shape consistente cuando se degradan.

   Los aliases son hints declarativos para matching futuro (p. ej. enviar el
   catálogo al prompt W120 con aliases explícitos en vez del substring map
   implícito). Hoy se documentan para uso posterior; no se consumen todavía.

   Ver ADR 0002 (pendiente) para política de versionado de catálogos.
============================================================================ */

/**
 * @typedef {Object} CatalogEntry
 * @property {number | string} id        - ID estable. Number para Odoo (gf.* ids); string para enums sin backend (ej tank incidents).
 * @property {string} label              - Texto display-ready en UI. Debe coincidir con el `name` que retorna Odoo.
 * @property {string[]} [aliases]        - Modismos / variantes / abreviaciones reconocidos en voz. Opcional pero recomendado.
 * @property {Object} [metadata]         - Campos domain-specific (uom, severity, llm_enum, icon...). Forma libre.
 */

/**
 * @typedef {Object} Catalog
 * @property {string} id                 - Identificador estable del catálogo (ej 'scrap_reasons_production').
 * @property {string} version            - SemVer. Bump al remover/cambiar ids.
 * @property {CatalogEntry[]} entries    - Lista de opciones.
 */

export const CATALOG_SHAPE_VERSION = '1.0.0'
