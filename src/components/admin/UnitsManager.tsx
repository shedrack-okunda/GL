import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Unit } from '../../types'

export default function UnitsManager() {
  const [units, setUnits] = useState<Unit[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('units').select('id,name').order('name')
    if (error) setError(error.message)
    else setUnits(data as Unit[])
  }, [])
  useEffect(() => { void load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('units').insert({ name: name.trim() })
    if (error) setError(error.code === '23505' ? 'That destination already exists.' : error.message)
    else { setName(''); void load() }
  }

  async function remove(u: Unit) {
    if (!window.confirm(`Delete "${u.name}"? Past logs keep the name. Registered vehicles lose this unit.`)) return
    const { error } = await supabase.from('units').delete().eq('id', u.id)
    if (error) setError(error.message)
    else void load()
  }

  return (
    <section className="max-w-xl space-y-4">
      <p className="text-base text-muted">These appear in the guard's destination dropdown.</p>
      <form onSubmit={add} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="u-name" className="field-label">New destination</label>
          <input id="u-name" required className="field field-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Block D" />
        </div>
        <button className="btn btn-ink btn-sm">Add destination</button>
      </form>
      {error && <p role="alert" className="font-medium text-danger">{error}</p>}
      <ul className="panel divide-y divide-line">
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between px-4 py-2">
            <span className="text-lg font-semibold">{u.name}</span>
            <button className="min-h-10 px-3 font-semibold text-danger underline underline-offset-4" onClick={() => void remove(u)}>Delete</button>
          </li>
        ))}
        {units.length === 0 && <li className="px-4 py-6 text-lg text-muted">No destinations yet.</li>}
      </ul>
    </section>
  )
}
