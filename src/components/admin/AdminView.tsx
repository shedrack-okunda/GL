import { useState } from 'react'
import { useData } from '../../context/DataContext'
import LogsTable from './LogsTable'
import ResidentsManager from './ResidentsManager'
import UnitsManager from './UnitsManager'

const TABS = [
  ['logs', 'Logs'],
  ['residents', 'Registered plates'],
  ['units', 'Destinations'],
] as const

export default function AdminView() {
  const { online } = useData()
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('logs')

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-5">
      {!online && (
        <p role="status" className="rounded-xl border-2 border-exit/50 bg-exit/10 p-3 font-semibold text-exit">
          You are offline. The dashboard needs a connection; the Gate view still works.
        </p>
      )}
      <div role="tablist" className="flex gap-1 border-b-2 border-line">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`-mb-0.5 min-h-11 border-b-4 px-4 text-base font-bold ${tab === id ? 'border-ink' : 'border-transparent text-muted'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'logs' && <LogsTable />}
      {tab === 'residents' && <ResidentsManager />}
      {tab === 'units' && <UnitsManager />}
    </main>
  )
}
