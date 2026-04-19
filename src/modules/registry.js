// ─── Registro de Módulos PWA ─────────────────────────────────────────────────
// Define qué módulos existen, qué roles los ven y su estado.
//
// roles: ['*']          → visible para todos
// roles: ['jefe_ruta']  → solo ese rol
// status: 'live'        → funcional
// status: 'pending'     → en construcción (muestra placeholder)

export const MODULES = [

  // ── Universales — todos los colaboradores ───────────────────────────────
  {
    id:     'kpis',
    label:  'Mis KPIs',
    route:  '/kpis',
    tone:   'blue',
    roles:  ['*'],
    status: 'live',
    icon:   'kpis',
  },
  {
    id:     'encuestas',
    label:  'Encuestas',
    route:  '/surveys',
    tone:   'blueSoft',
    roles:  ['*'],
    status: 'live',
    icon:   'encuestas',
    badge:  null, // se carga dinámico desde API
  },
  {
    id:     'logros',
    label:  'Premios',
    route:  '/badges',
    tone:   'steel',
    roles:  ['*'],
    status: 'live',
    icon:   'logros',
  },

  // ── Producción — Fabricación de Congelados (company 35) ─────────────────
  {
    id:     'registro_produccion',
    label:  'Registro de Turno',
    route:  '/produccion',
    tone:   'blueDeep',
    roles:  ['operador_barra', 'operador_rolito', 'auxiliar_produccion'],
    roleContextRoles: ['operador_barra', 'operador_rolito', 'auxiliar_produccion'],
    status: 'live',
    icon:   'produccion',
  },
  {
    id:     'supervision_produccion',
    label:  'Supervisión',
    route:  '/supervision',
    tone:   'blue',
    roles:  ['supervisor_produccion'],
    status: 'live',
    icon:   'supervision',
  },
  {
    id:     'almacen_pt',
    label:  'Almacén PT',
    route:  '/almacen-pt',
    tone:   'steel',
    roles:  ['almacenista_pt'],
    status: 'live',
    icon:   'almacen',
  },

  // ── Logística / Ventas — GLACIEM (34) y Vía Ágil (36) ──────────────────
  {
    id:     'cierre_ruta',
    label:  'Mi Ruta',
    route:  '/ruta',
    tone:   'blue',
    roles:  ['jefe_ruta', 'auxiliar_ruta'],
    status: 'live',
    icon:   'ruta',
  },
  {
    id:     'almacen_entregas',
    label:  'Entregas',
    route:  '/entregas',
    tone:   'blueSoft',
    roles:  ['almacenista_entregas'],
    status: 'live',
    icon:   'entregas',
  },
  {
    id:     'supervisor_ventas',
    label:  'Equipo',
    route:  '/equipo',
    tone:   'blueSoft',
    roles:  ['supervisor_ventas'],
    status: 'live',
    icon:   'equipo',
  },

  // ── Administración ───────────────────────────────────────────────────────
  {
    id:     'admin_sucursal',
    label:  'Admin Sucursal',
    route:  '/admin',
    tone:   'blueDeep',
    roles:  ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'],
    roleContextRoles: ['auxiliar_admin', 'gerente_sucursal', 'direccion_general'],
    status: 'live',
    icon:   'admin',
  },

  // ── Torres de Control — CSC GF ───────────────────────────────────────────
  {
    id:     'torre_control',
    label:  'Torres',
    route:  '/torres',
    tone:   'steel',
    roles:  ['operador_torres'],
    status: 'pending',
    icon:   'torres',
    pendingLabel: 'Torres de Control',
    pendingDesc:  'Monitoreo de operaciones en tiempo real. Disponible pronto.',
  },

  // ── Gerente de Sucursal ────────────────────────────────────────────────
  {
    id:     'gerente',
    label:  'Gerente',
    route:  '/gerente',
    tone:   'blueDeep',
    roles:  ['gerente_sucursal'],
    status: 'live',
    icon:   'admin',
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Módulos visibles para un rol dado */
export function getModulesForRole(role) {
  return MODULES.filter(m => m.roles.includes('*') || m.roles.includes(role))
}

export function getModulesForRoles(roles = []) {
  const seen = new Set()
  return MODULES.filter((module) => {
    const visible = module.roles.includes('*') || roles.some((role) => module.roles.includes(role))
    if (!visible || seen.has(module.id)) return false
    seen.add(module.id)
    return true
  })
}

/** Lookup rápido por id */
export function getModuleById(id) {
  return MODULES.find(m => m.id === id)
}
