import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { useNow } from '../../lib/hooks'
import { formatPlate } from '../../lib/plate'
import { formatDateTime, formatDuration } from '../../lib/util'
import type { LogRow } from '../../types'

interface Props {
  log: LogRow
  onDone: (message: string) => void
}

export default function ExitPanel({ log, onDone }: Props) {
  const { recordExit } = useData()
  const now = useNow(15_000)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    await recordExit(log.id)
    navigator.vibrate?.(60)
    onDone(`${formatPlate(log.plate)} logged out`)
  }

  return (
    <section className="panel overflow-hidden" aria-live="polite">
      <div className="bg-exit px-5 py-3 text-white">
        <h2 className="font-display text-4xl font-bold leading-none">Exiting</h2>
        <p className="mt-1 text-base opacity-90">Already on site</p>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-sm font-semibold text-muted">Time on site</p>
          <p className="font-display text-5xl font-bold leading-tight">
            {formatDuration(now - new Date(log.entry_time).getTime())}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-base">
          <div><dt className="font-semibold text-muted">Came in</dt><dd className="font-semibold">{formatDateTime(log.entry_time)}</dd></div>
          <div><dt className="font-semibold text-muted">Destination</dt><dd className="font-semibold">{log.unit_name ?? 'Not recorded'}</dd></div>
          {log.driver_name && (
            <div className="col-span-2"><dt className="font-semibold text-muted">Driver</dt><dd className="font-semibold">{log.driver_name}</dd></div>
          )}
        </dl>
        <button className="btn btn-exit" disabled={busy} onClick={confirm}>Confirm exit</button>
      </div>
    </section>
  )
}
