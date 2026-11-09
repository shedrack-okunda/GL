import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPlate, normalizePlate } from '../../lib/plate'
import { downloadCsv, toCsv } from '../../lib/csv'
import { formatDateTime, formatDuration } from '../../lib/util'
import type { LogRow } from '../../types'

type Status = 'all' | 'inside' | 'exited'
const PAGE = 25

interface Filters { plate: string; from: string; to: string; status: Status }

// Built fresh for each request (Supabase query builders are single-use).
function query(f: Filters, count = false) {
  let q = supabase.from('logs').select('*', count ? { count: 'exact' } : undefined).order('entry_time', { ascending: false })
  const p = normalizePlate(f.plate)
  if (p) q = q.ilike('plate', `%${p}%`)
  if (f.status === 'inside') q = q.is('exit_time', null)
  if (f.status === 'exited') q = q.not('exit_time', 'is', null)
  if (f.from) q = q.gte('entry_time', new Date(`${f.from}T00:00:00`).toISOString())
  if (f.to) q = q.lte('entry_time', new Date(`${f.to}T23:59:59.999`).toISOString())
  return q
}

export default function LogsTable() {
  const [filters, setFilters] = useState<Filters>({ plate: '', from: '', to: '', status: 'all' })
  const [applied, setApplied] = useState(filters)
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<LogRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, count, error } = await query(applied, true).range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) setError(error.message)
    else { setRows(data as LogRow[]); setTotal(count ?? 0) }
    setLoading(false)
  }, [applied, page])

  useEffect(() => { void load() }, [load])

  // Debounce typing in the plate box; other filters apply immediately.
  useEffect(() => {
    const t = setTimeout(() => { setApplied(filters); setPage(0) }, 350)
    return () => clearTimeout(t)
  }, [filters])

  async function exportCsv() {
    setExporting(true)
    setError('')
    const all: LogRow[] = []
    for (let from = 0; from < 50_000; from += 1000) {
      const { data, error } = await query(applied).range(from, from + 999)
      if (error) { setError(error.message); setExporting(false); return }
      all.push(...(data as LogRow[]))
      if (!data || data.length < 1000) break
    }
    const csv = toCsv(
      ['Plate', 'Status', 'Destination', 'Driver', 'Registered', 'Entry time', 'Exit time', 'Minutes on site'],
      all.map((l) => [
        l.plate,
        l.exit_time ? 'Exited' : 'Inside',
        l.unit_name ?? '',
        l.driver_name ?? '',
        l.is_registered ? 'Yes' : 'No',
        l.entry_time,
        l.exit_time ?? '',
        l.exit_time ? Math.round((+new Date(l.exit_time) - +new Date(l.entry_time)) / 60000) : '',
      ]),
    )
    downloadCsv(`guardlog-${new Date().toISOString().slice(0, 10)}.csv`, csv)
    setExporting(false)
  }

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <section className="space-y-4">
      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <div>
          <label className="field-label" htmlFor="f-plate">Plate</label>
          <input id="f-plate" className="field field-sm" placeholder="Search plate" autoComplete="off"
            value={filters.plate} onChange={(e) => set('plate', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="f-from">Entered from</label>
          <input id="f-from" type="date" className="field field-sm" value={filters.from} onChange={(e) => set('from', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="f-to">Entered to</label>
          <input id="f-to" type="date" className="field field-sm" value={filters.to} onChange={(e) => set('to', e.target.value)} />
        </div>
        <div>
          <label className="field-label" htmlFor="f-status">Status</label>
          <select id="f-status" className="field field-sm" value={filters.status} onChange={(e) => set('status', e.target.value as Status)}>
            <option value="all">All</option>
            <option value="inside">Inside</option>
            <option value="exited">Exited</option>
          </select>
        </div>
        <button className="btn btn-ink btn-sm" onClick={exportCsv} disabled={exporting || total === 0}>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {error && <p role="alert" className="font-medium text-danger">{error}</p>}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-base">
          <thead className="border-b-2 border-line bg-paper text-sm text-muted">
            <tr>
              {['Plate', 'Status', 'Destination', 'Driver', 'Entered', 'Exited', 'Time on site'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="rounded-md border-2 border-ink bg-plate px-2 py-0.5 font-display text-xl font-bold tracking-wider">{formatPlate(l.plate)}</span>
                  {l.is_registered && <span className="ml-2 text-xs font-semibold text-enter">Registered</span>}
                </td>
                <td className={`px-4 py-3 font-bold ${l.exit_time ? 'text-muted' : 'text-enter'}`}>{l.exit_time ? 'Exited' : 'Inside'}</td>
                <td className="px-4 py-3">{l.unit_name ?? '–'}</td>
                <td className="px-4 py-3">{l.driver_name ?? '–'}</td>
                <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(l.entry_time)}</td>
                <td className="px-4 py-3 whitespace-nowrap">{l.exit_time ? formatDateTime(l.exit_time) : '–'}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {formatDuration((l.exit_time ? +new Date(l.exit_time) : Date.now()) - +new Date(l.entry_time))}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-lg text-muted">No logs match these filters.</td></tr>
            )}
            {loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-lg text-muted">Loading…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-base text-muted">{total} {total === 1 ? 'log' : 'logs'} · page {page + 1} of {pages}</p>
        <div className="flex gap-2">
          <button className="btn btn-quiet btn-sm" onClick={() => void load()}>Refresh</button>
          <button className="btn btn-quiet btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <button className="btn btn-quiet btn-sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </section>
  )
}
