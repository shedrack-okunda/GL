import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { useNow } from '../../lib/hooks'
import { formatPlate, normalizePlate } from '../../lib/plate'
import { formatClock, formatDuration } from '../../lib/util'

interface Props {
  onPick: (plate: string) => void
}

export default function ActiveFeed({ onPick }: Props) {
  const { openLogs, ready } = useData()
  const now = useNow(30_000)
  const [q, setQ] = useState('')

  const needle = normalizePlate(q)
  const rows = needle ? openLogs.filter((l) => l.plate.includes(needle)) : openLogs

  return (
    <section aria-label="Vehicles inside">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-3xl font-bold">Inside now</h2>
        <p className="text-lg font-semibold">{openLogs.length} {openLogs.length === 1 ? 'vehicle' : 'vehicles'}</p>
      </div>

      <label htmlFor="feed-search" className="sr-only">Filter by plate</label>
      <input id="feed-search" className="field field-sm mb-3" placeholder="Filter by plate" value={q}
        autoCapitalize="characters" autoComplete="off" onChange={(e) => setQ(e.target.value)} />

      {rows.length === 0 ? (
        <p className="panel p-5 text-lg text-muted">
          {!ready ? 'Loading…' : needle ? 'No vehicle inside matches that plate.' : 'The compound is empty. New entries appear here instantly.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((l) => (
            <li key={l.id}>
              <button onClick={() => onPick(l.plate)}
                className="panel flex w-full items-center gap-4 p-3.5 text-left active:bg-paper">
                <span className="rounded-lg border-[3px] border-ink bg-plate px-2.5 py-0.5 font-display text-3xl font-bold tracking-wider">
                  {formatPlate(l.plate)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{l.unit_name ?? 'No destination'}</span>
                  <span className="block truncate text-sm text-muted">
                    In at {formatClock(l.entry_time)} · {formatDuration(now - new Date(l.entry_time).getTime())}
                    {l.driver_name ? ` · ${l.driver_name}` : ''}
                  </span>
                </span>
                <span className="text-sm font-bold text-exit">Exit</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
