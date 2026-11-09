import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { formatPlate, normalizePlate } from '../../lib/plate'
import type { Resident, Unit } from '../../types'

type Draft = { id?: string; plate: string; full_name: string; kind: 'resident' | 'staff'; unit_id: string; phone: string; active: boolean }
const EMPTY: Draft = { plate: '', full_name: '', kind: 'resident', unit_id: '', phone: '', active: true }

export default function ResidentsManager() {
  const [rows, setRows] = useState<Resident[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [r, u] = await Promise.all([
      supabase.from('residents').select('*').order('full_name'),
      supabase.from('units').select('id,name').order('name'),
    ])
    if (r.error || u.error) setError((r.error ?? u.error)!.message)
    else { setRows(r.data as Resident[]); setUnits(u.data as Unit[]) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    const plate = normalizePlate(draft.plate)
    if (plate.length < 2) { setError('Enter a valid plate number.'); return }
    setSaving(true)
    setError('')
    const payload = {
      plate, full_name: draft.full_name.trim(), kind: draft.kind,
      unit_id: draft.unit_id || null, phone: draft.phone.trim() || null, active: draft.active,
    }
    const { error } = draft.id
      ? await supabase.from('residents').update(payload).eq('id', draft.id)
      : await supabase.from('residents').insert(payload)
    setSaving(false)
    if (error) { setError(error.code === '23505' ? 'That plate is already registered.' : error.message); return }
    setDraft(null)
    void load()
  }

  async function remove(r: Resident) {
    if (!window.confirm(`Remove ${formatPlate(r.plate)} (${r.full_name})? Past logs are kept.`)) return
    const { error } = await supabase.from('residents').delete().eq('id', r.id)
    if (error) setError(error.message)
    else void load()
  }

  const unitName = (id: string | null) => units.find((u) => u.id === id)?.name ?? '–'
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter((r) => r.plate.includes(normalizePlate(needle)) || r.full_name.toLowerCase().includes(needle))
    : rows

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-60 flex-1">
          <label htmlFor="r-search" className="field-label">Search</label>
          <input id="r-search" className="field field-sm" placeholder="Plate or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className="btn btn-ink btn-sm" onClick={() => { setError(''); setDraft({ ...EMPTY }) }}>Add vehicle</button>
      </div>
      <p className="text-base text-muted">Registered vehicles skip the destination step: the guard just confirms entry.</p>
      {error && <p role="alert" className="font-medium text-danger">{error}</p>}

      {draft && (
        <form onSubmit={save} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <h2 className="font-display text-2xl font-bold sm:col-span-2 lg:col-span-3">{draft.id ? 'Edit vehicle' : 'Add vehicle'}</h2>
          <div>
            <label className="field-label" htmlFor="d-plate">Plate</label>
            <input id="d-plate" required className="field field-sm uppercase" value={draft.plate} autoComplete="off"
              onChange={(e) => setDraft({ ...draft, plate: normalizePlate(e.target.value) })} />
          </div>
          <div>
            <label className="field-label" htmlFor="d-name">Name</label>
            <input id="d-name" required className="field field-sm" value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
          </div>
          <div>
            <label className="field-label" htmlFor="d-kind">Type</label>
            <select id="d-kind" className="field field-sm" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft['kind'] })}>
              <option value="resident">Resident / tenant</option>
              <option value="staff">Staff</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="d-unit">Unit</label>
            <select id="d-unit" className="field field-sm" value={draft.unit_id} onChange={(e) => setDraft({ ...draft, unit_id: e.target.value })}>
              <option value="">No unit</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="d-phone">Phone <span className="font-normal text-muted">(optional)</span></label>
            <input id="d-phone" type="tel" className="field field-sm" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
          </div>
          <label className="flex min-h-11 items-center gap-3 self-end text-base font-semibold">
            <input type="checkbox" className="size-5 accent-ink" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Active
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button className="btn btn-ink btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save vehicle'}</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-base">
          <thead className="border-b-2 border-line bg-paper text-sm text-muted">
            <tr>{['Plate', 'Name', 'Type', 'Unit', 'Status', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3"><span className="rounded-md border-2 border-ink bg-plate px-2 py-0.5 font-display text-xl font-bold tracking-wider">{formatPlate(r.plate)}</span></td>
                <td className="px-4 py-3 font-semibold">{r.full_name}{r.phone && <span className="block text-sm font-normal text-muted">{r.phone}</span>}</td>
                <td className="px-4 py-3">{r.kind === 'staff' ? 'Staff' : 'Resident'}</td>
                <td className="px-4 py-3">{unitName(r.unit_id)}</td>
                <td className={`px-4 py-3 font-semibold ${r.active ? 'text-enter' : 'text-muted'}`}>{r.active ? 'Active' : 'Inactive'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button className="min-h-10 px-3 font-semibold underline underline-offset-4"
                    onClick={() => { setError(''); setDraft({ id: r.id, plate: r.plate, full_name: r.full_name, kind: r.kind, unit_id: r.unit_id ?? '', phone: r.phone ?? '', active: r.active }) }}>Edit</button>
                  <button className="min-h-10 px-3 font-semibold text-danger underline underline-offset-4" onClick={() => void remove(r)}>Remove</button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-lg text-muted">{rows.length ? 'No vehicles match that search.' : 'No registered vehicles yet. Add the first one.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
