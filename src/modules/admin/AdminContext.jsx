// ─── AdminContext — estado global del Auxiliar Administrativo ───────────────
// Provee los filtros globales (razón social, sucursal, almacén) que todas las
// pantallas del rol consumen. Persiste company_id en session para que api.js
// lo lea en headers en cada request al backend.
import { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react'
import { useSession } from '../../App'
import { COMPANY_LABELS, getCompaniesForSucursal } from '../../tokens'
import { bootCapabilities } from './adminService'

const AdminContext = createContext(null)

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin debe usarse dentro de <AdminProvider>')
  return ctx
}

export function AdminProvider({ children }) {
  const { session, updateSession } = useSession()

  const sucursal = session?.sucursal || ''
  const warehouseId = session?.warehouse_id || 89
  const employeeId = session?.employee_id || null
  const employeeName = session?.name || ''

  const availableCompanies = useMemo(
    () => getCompaniesForSucursal(sucursal),
    [sucursal],
  )

  // company_id inicial: el de sesión si es válido, sino el primero disponible
  const initialCompanyId = useMemo(() => {
    const fromSession = session?.company_id
    if (fromSession && availableCompanies.some(c => c.id === fromSession)) {
      return fromSession
    }
    return availableCompanies[0]?.id || 34
  }, [session?.company_id, availableCompanies])

  const [companyId, setCompanyIdInternal] = useState(initialCompanyId)
  const [capsReady, setCapsReady] = useState(false)

  // Boot-time: leer capabilities del backend para ajustar BACKEND_CAPS.
  // Si el endpoint falla (ambiente sin gf_pwa_admin), conservamos los
  // defaults locales y seguimos adelante.
  useEffect(() => {
    let alive = true
    bootCapabilities().finally(() => { if (alive) setCapsReady(true) })
    return () => { alive = false }
  }, [])

  // Si cambia la sesión externa (logout/login), re-sincroniza
  useEffect(() => {
    if (session?.company_id && session.company_id !== companyId) {
      if (availableCompanies.some(c => c.id === session.company_id)) {
        setCompanyIdInternal(session.company_id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.company_id])

  const setCompanyId = useCallback((id) => {
    const num = Number(id)
    if (!availableCompanies.some(c => c.id === num)) return
    setCompanyIdInternal(num)
    // Persistir en session → localStorage → api.js headers
    if (updateSession) updateSession({ company_id: num })
  }, [availableCompanies, updateSession])

  const companyLabel = COMPANY_LABELS[companyId] || `ID ${companyId}`

  const value = useMemo(() => ({
    // Contexto organizacional
    companyId,
    companyLabel,
    availableCompanies,
    setCompanyId,
    sucursal,
    warehouseId,
    employeeId,
    employeeName,
    capsReady,
  }), [companyId, companyLabel, availableCompanies, setCompanyId, sucursal, warehouseId, employeeId, employeeName, capsReady])

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}
