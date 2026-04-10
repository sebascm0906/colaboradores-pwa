// ─── ScreenGastos — gastos del Auxiliar Administrativo ─────────────────────
// En desktop (≥1024px) usa el nuevo AdminShell + AdminGastosForm desacoplado.
// En mobile se mantiene el GastosScreenBase legacy como fallback.
// IMPORTANTE: el gerente sigue usando GastosScreenBase en /gerente/gastos —
// esta migración solo toca la ruta /admin/gastos.
import { useEffect, useState } from 'react'
import GastosScreenBase from '../shared/GastosScreenBase'
import { AdminProvider } from './AdminContext'
import AdminShell from './components/AdminShell'
import AdminGastosForm from './forms/AdminGastosForm'

export default function ScreenGastos() {
  const [sw, setSw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1280)

  useEffect(() => {
    const handler = () => setSw(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  if (sw < 1024) {
    return <GastosScreenBase title="Gastos" backRoute="/admin" listLabel="GASTOS DE HOY" />
  }

  return (
    <AdminProvider>
      <AdminShell activeBlock="gastos" title="Gastos">
        <AdminGastosForm />
      </AdminShell>
    </AdminProvider>
  )
}
