import { useEffect, useState } from 'react'
import { getTransformationCatalog } from '../services/transformationsApi'

export function useTransformationCatalog(roleScope, warehouseId, employeeId) {
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!warehouseId || !employeeId) {
        setRecipes([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const result = await getTransformationCatalog(roleScope, warehouseId, employeeId)
        if (!cancelled) setRecipes(Array.isArray(result) ? result : [])
      } catch (err) {
        if (!cancelled) setError(err.message || 'No se pudo cargar el catalogo')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [employeeId, roleScope, warehouseId])

  return { recipes, loading, error, setRecipes }
}
