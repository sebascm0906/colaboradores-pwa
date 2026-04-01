// ─── Design Tokens — Grupo Frío PWA ─────────────────────────────────────────
// Fuente única de verdad para colores, tipografía, radios, sombras y motion.
// Importar en cualquier screen: import { TOKENS, getTypo } from '../tokens'

export const TOKENS = {
  colors: {
    // Fondos
    bg0: '#030811',
    bg1: '#04101f',
    bg2: '#07162b',
    // Superficies glass
    surface:       'rgba(255,255,255,0.05)',
    surfaceSoft:   'rgba(255,255,255,0.03)',
    surfaceStrong: 'rgba(255,255,255,0.07)',
    // Bordes
    border:     'rgba(255,255,255,0.08)',
    borderBlue: 'rgba(97,178,255,0.18)',
    // Azules corporativos
    blue:     '#15499B',
    blue2:    '#2B8FE0',
    blue3:    '#61b2ff',
    blueGlow: 'rgba(43,143,224,0.16)',
    // Texto
    text:      '#FFFFFF',
    textSoft:  'rgba(255,255,255,0.82)',
    textMuted: 'rgba(255,255,255,0.60)',
    textLow:   'rgba(255,255,255,0.55)',
    // Semáforo
    success:     '#22c55e',
    successSoft: 'rgba(34,197,94,0.12)',
    warning:     '#f59e0b',
    warningSoft: 'rgba(245,158,11,0.12)',
    error:       '#ef4444',
    errorSoft:   'rgba(239,68,68,0.12)',
  },

  radius: {
    sm:   14,
    md:   18,
    lg:   22,
    xl:   24,
    pill: 999,
  },

  shadow: {
    soft:  '0 8px 20px rgba(0,0,0,0.18)',
    md:    '0 14px 30px rgba(0,0,0,0.22)',
    lg:    '0 20px 44px rgba(0,0,0,0.28)',
    blue:  '0 0 22px rgba(43,143,224,0.16)',
    inset: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  },

  glass: {
    panel:     'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
    panelSoft: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.025))',
    hero:      'linear-gradient(180deg, rgba(21,73,155,0.20), rgba(255,255,255,0.03))',
  },

  motion: {
    fast:   '180ms ease',
    normal: '280ms ease',
    spring: '380ms cubic-bezier(0.34,1.56,0.64,1)',
  },
}

// Tones para tarjetas de módulos
export const MODULE_TONES = {
  blue:     { bg: 'linear-gradient(180deg, rgba(21,73,155,0.24), rgba(21,73,155,0.10))',    border: 'rgba(97,178,255,0.18)', glow: 'rgba(43,143,224,0.16)' },
  blueSoft: { bg: 'linear-gradient(180deg, rgba(43,143,224,0.18), rgba(43,143,224,0.07))',  border: 'rgba(97,178,255,0.16)', glow: 'rgba(43,143,224,0.12)' },
  blueDeep: { bg: 'linear-gradient(180deg, rgba(10,38,84,0.34), rgba(10,38,84,0.14))',      border: 'rgba(97,178,255,0.14)', glow: 'rgba(21,73,155,0.12)'  },
  steel:    { bg: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025))', border: 'rgba(255,255,255,0.11)', glow: 'rgba(255,255,255,0.06)' },
  green:    { bg: 'linear-gradient(180deg, rgba(34,197,94,0.18), rgba(34,197,94,0.07))',    border: 'rgba(34,197,94,0.22)',  glow: 'rgba(34,197,94,0.12)'  },
  amber:    { bg: 'linear-gradient(180deg, rgba(245,158,11,0.18), rgba(245,158,11,0.07))',  border: 'rgba(245,158,11,0.22)', glow: 'rgba(245,158,11,0.12)' },
}

// Tipografía responsiva según ancho de pantalla
export function getTypo(sw) {
  const sm = sw < 340
  return {
    display:  { fontSize: sm ? 22 : 28, fontWeight: 700, letterSpacing: '-0.04em' },
    h1:       { fontSize: sm ? 20 : 24, fontWeight: 700, letterSpacing: '-0.03em' },
    h2:       { fontSize: sm ? 17 : 20, fontWeight: 700, letterSpacing: '-0.02em' },
    title:    { fontSize: sm ? 14 : 16, fontWeight: 700, letterSpacing: '-0.01em' },
    body:     { fontSize: sm ? 12 : 14, fontWeight: 500 },
    caption:  { fontSize: sm ? 11 : 12, fontWeight: 500 },
    overline: { fontSize: 10,           fontWeight: 700, letterSpacing: '0.18em'  },
  }
}

// Nombre corto de la empresa por company_id
export const COMPANY_LABELS = {
  1:  'CSC GF',
  34: 'GLACIEM',
  35: 'Fabricación',
  36: 'Vía Ágil',
}

// Etiqueta de turno
export const TURNO_LABELS = {
  '1':    'Turno 1 — Día',
  '2':    'Turno 2 — Noche',
  'todos': 'Todos los turnos',
  'na':   '',
}
