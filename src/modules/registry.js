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
    status: 'pending',
    icon:   'produccion',
    pendingLabel: 'Registro de Turno',
    pendingDesc:  'Captura tu producción por turno. Disponible pronto.',
  },
  {
    id:     'supervision_produccion',
    label:  'Supervisión',
    route:  '/supervision',
    tone:   'blue',
    roles:  ['supervisor_produccion'],
    status: 'pending',
    icon:   'supervision',
    pendingLabel: 'Panel de Supervisión',
    pendingDesc:  'Control de líneas, mantenimiento y métricas. Disponible pronto.',
  },
  {
    id:     'almacen_pt',
    label:  'Almacén PT',
    route:  '/almacen-pt',
    tone:   'steel',
    roles:  ['almacenista_pt'],
    status: 'pending',
    icon:   'almacen',
    pendingLabel: 'Almacén Producto Terminado',
    pendingDesc:  'Días de cobertura y traspasos. Disponible pronto.',
  },

  // ── Logística / Ventas — GLACIEM (34) y Vía Ágil (36) ──────────────────
  {
    id:     'cierre_ruta',
    label:  'Mi Ruta',
    route:  '/ruta',
    tone:   'blue',
    roles:  ['jefe_ruta', 'auxiliar_ruta'],
    status: 'pending',
    icon:   'ruta',
    pendingLabel: 'Cierre de Ruta',
    pendingDesc:  'Carga, paradas, gastos y cierre de jornada. Disponible pronto.',
  },
  {
    id:     'almacen_entregas',
    label:  'Entregas',
    route:  '/entregas',
    tone:   'blueSoft',
    roles:  ['almacenista_entregas'],
    status: 'pending',
    icon:   'entregas',
    pendingLabel: 'Panel de Entregas',
    pendingDesc:  'Órdenes de entrega y recepción de almacén. Disponible pronto.',
  },
  {
    id:     'supervisor_ventas',
    label:  'Equipo',
    route:  '/equipo',
    tone:   'blueSoft',
    roles:  ['supervisor_ventas'],
    status: 'pending',
    icon:   'equipo',
    pendingLabel: 'Panel de Supervisión Ventas',
    pendingDesc:  'KPIs de equipo, rutas y cumplimiento. Disponible pronto.',
  },

  // ── Administración ───────────────────────────────────────────────────────
  {
    id:     'admin_sucursal',
    label:  'Admin Sucursal',
    route:  '/admin',
    tone:   'blueDeep',
    roles:  ['auxiliar_admin', 'gerente_sucursal'],
    status: 'pending',
    icon:   'admin',
    pendingLabel: 'Administración de Sucursal',
    pendingDesc:  'Conciliación, gastos y cierre de caja. Disponible pronto.',
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
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Módulos visibles para un rol dado */
export function getModulesForRole(role) {
  return MODULES.filter(m => m.roles.includes('*') || m.roles.includes(role))
}

/** Lookup rápido por id */
export function getModuleById(id) {
  return MODULES.find(m => m.id === id)
}
