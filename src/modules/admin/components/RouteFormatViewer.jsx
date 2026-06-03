import { useMemo, useState } from 'react'
import { TOKENS } from '../../../tokens'
import {
  buildRouteDownloadName,
  buildRouteFormatHtml,
  buildRouteFormatsViewModel,
  formatRouteMoney,
} from '../routeLiquidationFormats'

const NUMBER_FORMAT = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

function fmtNum(value) {
  return NUMBER_FORMAT.format(Number(value || 0))
}

export default function RouteFormatViewer({ detail }) {
  const [selectedFormat, setSelectedFormat] = useState('summary')
  const [downloadError, setDownloadError] = useState('')
  const viewModel = useMemo(() => buildRouteFormatsViewModel(detail || {}), [detail])
  const selected = viewModel.formats[selectedFormat]
  const title = viewModel.formatDefinitions.find((format) => format.id === selectedFormat)?.label || 'Formato'

  function handlePrint() {
    if (!viewModel.enabled) return
    window.print()
  }

  function handleDownload() {
    if (!viewModel.enabled) return
    setDownloadError('')
    try {
      const html = buildRouteFormatHtml(viewModel, selectedFormat)
      const printWindow = window.open('', '_blank', 'noopener,noreferrer')
      if (!printWindow) throw new Error('El navegador bloqueo la ventana de descarga')
      printWindow.document.open()
      printWindow.document.write(html)
      printWindow.document.close()
      printWindow.document.title = buildRouteDownloadName(viewModel, selectedFormat)
      printWindow.focus()
      window.setTimeout(() => {
        printWindow.print()
      }, 350)
    } catch (e) {
      setDownloadError(e?.message || 'No se pudo descargar el formato')
    }
  }

  return (
    <div style={{
      marginTop: 18,
      padding: 16,
      borderRadius: TOKENS.radius.xl,
      background: TOKENS.colors.surfaceSoft,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .route-format-printable, .route-format-printable * { visibility: visible !important; }
          .route-format-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 24px !important;
            background: white !important;
            color: #111827 !important;
          }
          .route-format-printable table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          .route-format-printable th,
          .route-format-printable td {
            border: 1px solid #d1d5db !important;
            padding: 7px 8px !important;
            color: #111827 !important;
          }
          .route-format-actions,
          .route-format-tabs { display: none !important; }
        }
      `}</style>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 12,
        marginBottom: 12,
      }}>
        <div>
          <p style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: TOKENS.colors.textLow,
            margin: 0,
          }}>
            FORMATOS DE RUTA
          </p>
          <p style={{
            fontSize: 15,
            fontWeight: 700,
            color: TOKENS.colors.text,
            margin: '4px 0 0',
          }}>
            {viewModel.plan.driverName}
          </p>
        </div>
        <div className="route-format-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <ActionButton label="Imprimir" onClick={handlePrint} disabled={!viewModel.enabled} />
          <ActionButton label="Descargar" onClick={handleDownload} disabled={!viewModel.enabled} />
        </div>
      </div>

      {!viewModel.enabled && (
        <div style={{
          padding: '10px 12px',
          borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.warningSoft,
          border: `1px solid ${TOKENS.colors.warning}40`,
          color: TOKENS.colors.warning,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 12,
        }}>
          {viewModel.blockedReason}
        </div>
      )}

      {downloadError && (
        <div style={{
          padding: '10px 12px',
          borderRadius: TOKENS.radius.md,
          background: TOKENS.colors.errorSoft,
          border: `1px solid ${TOKENS.colors.error}40`,
          color: TOKENS.colors.error,
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 12,
        }}>
          {downloadError}
        </div>
      )}

      <div className="route-format-tabs" style={{
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginBottom: 12,
      }}>
        {viewModel.formatDefinitions.map((format) => {
          const active = selectedFormat === format.id
          return (
            <button
              key={format.id}
              type="button"
              onClick={() => setSelectedFormat(format.id)}
              style={{
                padding: '7px 10px',
                borderRadius: TOKENS.radius.sm,
                background: active ? `${TOKENS.colors.blue2}22` : TOKENS.colors.surface,
                border: `1px solid ${active ? TOKENS.colors.blue2 : TOKENS.colors.border}`,
                color: active ? TOKENS.colors.text : TOKENS.colors.textMuted,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: 'pointer',
              }}
            >
              {format.label}
            </button>
          )
        })}
      </div>

      <div className="route-format-printable" style={{
        padding: 14,
        borderRadius: TOKENS.radius.md,
        background: TOKENS.colors.surface,
        border: `1px solid ${TOKENS.colors.border}`,
      }}>
        <ReportHeader viewModel={viewModel} title={title} />
        <ReportBody formatId={selectedFormat} format={selected} />
      </div>
    </div>
  )
}

function ActionButton({ label, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 12px',
        borderRadius: TOKENS.radius.sm,
        background: disabled ? TOKENS.colors.surface : `linear-gradient(135deg, ${TOKENS.colors.blue}, ${TOKENS.colors.blue2})`,
        border: `1px solid ${disabled ? TOKENS.colors.border : TOKENS.colors.blue2}`,
        color: disabled ? TOKENS.colors.textMuted : 'white',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "'DM Sans', sans-serif",
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function ReportHeader({ viewModel, title }) {
  return (
    <div style={{
      paddingBottom: 10,
      marginBottom: 12,
      borderBottom: `1px solid ${TOKENS.colors.border}`,
    }}>
      <h3 style={{
        fontSize: 18,
        color: TOKENS.colors.text,
        margin: 0,
        letterSpacing: '-0.02em',
      }}>
        {title}
      </h3>
      <p style={{ fontSize: 11, color: TOKENS.colors.textMuted, margin: '5px 0 0' }}>
        {[viewModel.plan.name, viewModel.plan.routeName, viewModel.plan.driverName, viewModel.plan.vehicleName, viewModel.plan.date]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

function ReportBody({ formatId, format }) {
  if (formatId === 'summary') return <SummaryReport format={format} />
  if (formatId === 'sales') return <SalesReport format={format} />
  if (formatId === 'inventory') return <InventoryReport format={format} />
  if (formatId === 'scrap') return <ScrapReport format={format} />
  if (formatId === 'corte') return <CorteReport format={format} />
  if (formatId === 'liquidation') return <LiquidationReport format={format} />
  return <EmptyReport text="Formato no disponible" />
}

function SummaryReport({ format }) {
  if (!format) return <EmptyReport text="Resumen no disponible" />
  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        gap: 8,
        marginBottom: 12,
      }}>
        <SummaryMetric label="Visitas planificadas" value={fmtNum(format.visits.planned)} />
        <SummaryMetric label="Visitas realizadas" value={fmtNum(format.visits.done)} />
        <SummaryMetric label="No realizadas" value={fmtNum(format.visits.notDone)} />
        <SummaryMetric label="Cumplimiento" value={`${fmtNum(format.visits.compliancePct)}%`} />
        <SummaryMetric label="Total ventas" value={format.sales.unavailable ? 'N/D' : formatRouteMoney(format.sales.total)} />
        <SummaryMetric label="Ventas" value={format.sales.unavailable ? 'N/D' : fmtNum(format.sales.count)} />
        <SummaryMetric label="Kilos vendidos" value={format.sales.unavailable ? 'N/D' : `${fmtNum(format.sales.kilos)} kg`} />
        <SummaryMetric label="Crédito" value={formatRouteMoney(format.liquidation.totals.credit)} />
        <SummaryMetric label="Cash / efectivo" value={formatRouteMoney(format.liquidation.totals.cashExpected)} />
        <SummaryMetric label="Diferencia" value={formatRouteMoney(format.liquidation.totals.difference)} />
      </div>

      <ReportSectionTitle title="Lista de visitas" />
      {format.visitList.empty ? (
        <EmptyReport text="Sin lista de visitas disponible." />
      ) : (
        <Table headers={['#', 'Cliente planeado', 'Hora plan', 'Hora visita', 'Estado', 'Venta']} rows={format.visitList.rows.map((row) => [
          row.sequence || '-',
          row.customer,
          row.plannedTime || '-',
          row.visitTime || '-',
          row.status,
          row.saleStatus,
        ])} />
      )}

      <ReportSectionTitle title="Inventario y corte" />
      {format.inventory.empty ? (
        <EmptyReport text="Sin inventario disponible." />
      ) : (
        <Table headers={['Producto', 'Cargado', 'Vendido', 'Devuelto', 'Merma', 'Dif.']} rows={format.inventory.rows.map((row) => [
          row.product,
          fmtNum(row.loaded),
          fmtNum(row.delivered),
          fmtNum(row.returned),
          fmtNum(row.scrap),
          fmtNum(row.difference),
        ])} />
      )}

      <ReportSectionTitle title="Cargas" />
      {format.reloads.empty ? (
        <EmptyReport text="Sin cargas registradas." />
      ) : (
        <Table headers={['Folio', 'Producto', 'Cant.', 'Hora']} rows={format.reloads.rows.map((row) => [
          row.folio,
          row.product,
          fmtNum(row.quantity),
          row.time || '-',
        ])} />
      )}

      <ReportSectionTitle title="Liquidacion" />
      <Table headers={['Crédito', 'Cash esperado', 'Cash recibido', 'Diferencia']} rows={[[
        formatRouteMoney(format.liquidation.totals.credit),
        formatRouteMoney(format.liquidation.totals.cashExpected),
        formatRouteMoney(format.liquidation.totals.cashReceived),
        formatRouteMoney(format.liquidation.totals.difference),
      ]]} />
    </>
  )
}

function SummaryMetric({ label, value }) {
  return (
    <div style={{
      minHeight: 58,
      padding: 8,
      borderRadius: TOKENS.radius.sm,
      background: TOKENS.colors.surfaceSoft,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <div style={{
        color: TOKENS.colors.textLow,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div style={{
        color: TOKENS.colors.text,
        fontSize: 13,
        fontWeight: 800,
        marginTop: 4,
      }}>
        {value}
      </div>
    </div>
  )
}

function ReportSectionTitle({ title }) {
  return (
    <div style={{
      margin: '12px 0 6px',
      color: TOKENS.colors.textLow,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
    }}>
      {title}
    </div>
  )
}

function SalesReport({ format }) {
  if (format?.unavailable) {
    return <EmptyReport text="Lista de ventas no disponible en este endpoint." />
  }
  return (
    <>
      <Table headers={['Folio', 'Cliente', 'Metodo', 'Total']} rows={format.rows.map((row) => [
        row.folio,
        row.customer,
        row.method || '-',
        formatRouteMoney(row.amount),
      ])} />
      <TotalLine label="Total ventas" value={formatRouteMoney(format.totals.amount)} />
    </>
  )
}

function InventoryReport({ format }) {
  if (format?.empty) return <EmptyReport text="Sin inventario cargado disponible." />
  return (
    <>
      <Table headers={['Producto', 'Cargado']} rows={format.rows.map((row) => [
        row.product,
        fmtNum(row.loaded),
      ])} />
      <TotalLine label="Total cargado" value={fmtNum(format.totals.loaded)} />
    </>
  )
}

function ScrapReport({ format }) {
  if (format?.empty) return <EmptyReport text="Sin mermas registradas." />
  return (
    <>
      <Table headers={['Producto', 'Merma']} rows={format.rows.map((row) => [
        row.product,
        fmtNum(row.scrap),
      ])} />
      <TotalLine label="Total merma" value={fmtNum(format.totals.scrap)} />
    </>
  )
}

function CorteReport({ format }) {
  if (format?.empty) return <EmptyReport text="Sin corte disponible." />
  return (
    <>
      <Table headers={['Producto', 'Cargado', 'Entregado', 'Devuelto', 'Merma', 'Diferencia']} rows={format.rows.map((row) => [
        row.product,
        fmtNum(row.loaded),
        fmtNum(row.delivered),
        fmtNum(row.returned),
        fmtNum(row.scrap),
        fmtNum(row.difference),
      ])} />
      <TotalLine
        label="Totales"
        value={`Cargado ${fmtNum(format.totals.loaded)} · Entregado ${fmtNum(format.totals.delivered)} · Devuelto ${fmtNum(format.totals.returned)} · Merma ${fmtNum(format.totals.scrap)} · Diferencia ${fmtNum(format.totals.difference)}`}
      />
    </>
  )
}

function LiquidationReport({ format }) {
  if (format?.empty) return <EmptyReport text="Sin liquidacion disponible." />
  return (
    <>
      <Table headers={['Metodo', 'Importe']} rows={format.rows.map((row) => [
        row.label,
        formatRouteMoney(row.amount),
      ])} />
      <TotalLine
        label="Resumen"
        value={`Crédito ${formatRouteMoney(format.totals.credit)} · Cash esperado ${formatRouteMoney(format.totals.cashExpected)} · Cash recibido ${formatRouteMoney(format.totals.cashReceived)} · Diferencia ${formatRouteMoney(format.totals.difference)}`}
      />
    </>
  )
}

function Table({ headers, rows }) {
  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: TOKENS.radius.sm,
      border: `1px solid ${TOKENS.colors.border}`,
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        minWidth: 520,
      }}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{
                padding: '8px 10px',
                background: TOKENS.colors.surfaceSoft,
                color: TOKENS.colors.textLow,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textAlign: 'left',
                borderBottom: `1px solid ${TOKENS.colors.border}`,
              }}>
                {header.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row[0]}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} style={{
                  padding: '8px 10px',
                  color: TOKENS.colors.textSoft,
                  fontSize: 11,
                  borderBottom: rowIndex === rows.length - 1 ? 'none' : `1px solid ${TOKENS.colors.border}55`,
                  textAlign: cellIndex === 0 ? 'left' : 'right',
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TotalLine({ label, value }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 10,
      paddingTop: 10,
      borderTop: `1px solid ${TOKENS.colors.border}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.textSoft }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, color: TOKENS.colors.blue3, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

function EmptyReport({ text }) {
  return (
    <div style={{
      padding: '18px 12px',
      borderRadius: TOKENS.radius.sm,
      background: TOKENS.glass.panelSoft,
      border: `1px dashed ${TOKENS.colors.border}`,
      color: TOKENS.colors.textMuted,
      fontSize: 12,
      textAlign: 'center',
    }}>
      {text}
    </div>
  )
}
