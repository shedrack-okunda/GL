import { useState } from 'react'
import { useData } from '../../context/DataContext'
import { formatPlate } from '../../lib/plate'

interface Props {
  plate: string
  onDone: (message: string) => void
}

export default function EntryPanel({ plate, onDone }: Props) {
  const { units, findResident, recordEntry } = useData()
  const resident = findResident(plate)
  const residentUnit = resident ? units.find((u) => u.id === resident.unit_id) ?? null : null

  const [unitId, setUnitId] = useState('')
  const [driver, setDriver] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const unit = resident ? residentUnit : units.find((u) => u.id === unitId) ?? null
      await recordEntry({ plate, unit, driverName: driver, resident })
      navigator.vibrate?.(60)
      onDone(`${formatPlate(plate)} logged in`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log this entry.')
      setBusy(false)
    }
  }

  return (
    <section className="panel overflow-hidden" aria-live="polite">
      <div className="bg-enter px-5 py-3 text-white">
        <h2 className="font-display text-4xl font-bold leading-none">Entering</h2>
        <p className="mt-1 text-base opacity-90">
          {resident ? 'Registered vehicle' : 'Not currently on site'}
        </p>
      </div>

      <div className="space-y-4 p-5">
        {resident ? (
          <div className="rounded-xl border-2 border-enter/40 bg-enter/10 p-4">
            <p className="text-xl font-bold">{resident.full_name}</p>
            <p className="text-base text-muted">
              {resident.kind === 'staff' ? 'Staff' : 'Resident'}
              {residentUnit ? ` · ${residentUnit.name}` : ''}
            </p>
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="unit" className="field-label">Destination / unit</label>
              <select id="unit" className="field" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Choose where they are going…</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {units.length === 0 && (
                <p className="mt-2 text-sm text-muted">No destinations yet. An admin can add them in the dashboard.</p>
              )}
            </div>
            <div>
              <label htmlFor="driver" className="field-label">Driver name <span className="font-normal text-muted">(optional)</span></label>
              <input id="driver" className="field" value={driver} autoComplete="off"
                onChange={(e) => setDriver(e.target.value)} />
            </div>
          </>
        )}

        {error && <p role="alert" className="font-medium text-danger">{error}</p>}
        <button className="btn btn-enter" disabled={busy || (!resident && !unitId)} onClick={confirm}>
          Confirm entry
        </button>
      </div>
    </section>
  )
}
