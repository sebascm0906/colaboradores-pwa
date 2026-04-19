import { useCallback, useEffect, useState } from 'react'
import { getTransformationHistory } from '../services/transformationsApi'

export function useTransformationHistory(roleScope, warehouseId, employeeId, date) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!warehouseId || !employeeId) {
      setHistory([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await getTransformationHistory(roleScope, warehouseId, employeeId, date)
      setHistory(Array.isArray(result) ? result : [])
    } catch (err) {
      setError(err.message || 'No se pudo cargar el historial')
    } finally {
      setLoading(false)
    }
  }, [date, employeeId, roleScope, warehouseId])

  useEffect(() => { reload() }, [reload])

  return { history, loading, error, reload, setHistory }
}
