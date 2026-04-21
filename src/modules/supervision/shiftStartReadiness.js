import { getBrineReadingStatus } from './brineReadings.js'

export function hasStartEnergyReading(readings = []) {
  return readings.some((reading) =>
    reading?.reading_type === 'start' && Number(reading?.kwh_value || 0) > 0
  )
}

export function getShiftStartReadiness({ shift, energyReadings = [], tanks = [], today } = {}) {
  const blockers = []
  const energyReady = hasStartEnergyReading(energyReadings)
  if (!energyReady) blockers.push('Falta lectura inicial de energia')

  if (!tanks.length) {
    blockers.push('No hay tanques activos disponibles para validar salmuera')
  }

  const tankReadiness = tanks.map((tank) => {
    const status = getBrineReadingStatus(tank, today)
    return {
      tankId: tank.id,
      tankName: tank.display_name || tank.name || `Tanque ${tank.id}`,
      status: status.kind,
      ready: status.kind === 'ok',
    }
  })

  if (tankReadiness.some((tank) => !tank.ready)) blockers.push('Faltan lecturas de sal en tanques activos')

  const canStart = shift?.state === 'draft' && blockers.length === 0
  return { canStart, energyReady, tankReadiness, blockers }
}
