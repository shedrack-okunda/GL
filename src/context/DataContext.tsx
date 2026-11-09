/**
 * Offline-first data layer for the Guard view.
 *
 * - Units, registered plates and the list of vehicles currently inside are cached in IndexedDB.
 * - Every entry/exit is applied to the local cache immediately, then appended to an "outbox".
 * - The outbox is flushed to Supabase in order whenever the device is online
 *   (on reconnect, on app focus, every 30 s, and after each action).
 * - Entry IDs are generated on the device, so replaying an op after a flaky connection is safe.
 * - Supabase Realtime nudges every device to re-sync when anyone else logs a vehicle.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { kv } from '../lib/db'
import { uuid } from '../lib/util'
import { normalizePlate } from '../lib/plate'
import type { LogRow, OutboxOp, Resident, Unit } from '../types'

const K = { units: 'units', residents: 'residents', open: 'openLogs', outbox: 'outbox', failed: 'failedOps' }
const LOG_COLS = 'id,plate,unit_id,unit_name,driver_name,resident_id,is_registered,entry_time,exit_time'
const RES_COLS = 'id,plate,full_name,kind,unit_id,phone,active'

export interface EntryInput {
  plate: string
  unit?: Unit | null
  driverName?: string
  resident?: Resident | null
}

interface DataState {
  units: Unit[]
  residents: Resident[]
  openLogs: LogRow[]
  pending: number
  failed: number
  online: boolean
  syncing: boolean
  lastSync: string | null
  syncError: string | null
  ready: boolean
  findOpen: (plate: string) => LogRow | undefined
  findResident: (plate: string) => Resident | undefined
  recordEntry: (input: EntryInput) => Promise<LogRow>
  recordExit: (logId: string) => Promise<void>
  sync: () => Promise<void>
}

const Ctx = createContext<DataState | null>(null)

type Pause = 'network' | 'auth' | null

const isNetworkError = (e: PostgrestError) => !e.code || /fetch|network|load failed/i.test(e.message)
const isAuthError = (e: PostgrestError) => e.code === 'PGRST301' || /jwt/i.test(e.message)
const isDuplicate = (e: PostgrestError) => e.code === '23505' // already stored (retry, or plate already inside)

async function send(op: OutboxOp): Promise<PostgrestError | null> {
  if (op.type === 'entry') {
    const { error } = await supabase.from('logs').insert(op.log)
    return error
  }
  const { error } = await supabase
    .from('logs')
    .update({ exit_time: op.exit_time })
    .eq('id', op.logId)
    .is('exit_time', null)
  return error
}

/** Server snapshot + our not-yet-synced changes, applied in order. */
function overlay(server: LogRow[], outbox: OutboxOp[]): LogRow[] {
  let rows = [...server]
  for (const op of outbox) {
    if (op.type === 'entry') {
      if (!rows.some((r) => r.id === op.log.id || r.plate === op.log.plate)) rows.push(op.log)
    } else {
      rows = rows.filter((r) => r.id !== op.logId)
    }
  }
  return rows.sort((a, b) => b.entry_time.localeCompare(a.entry_time))
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [units, setUnits] = useState<Unit[]>([])
  const [residents, setResidents] = useState<Resident[]>([])
  const [openLogs, setOpenLogsState] = useState<LogRow[]>([])
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncing, setSyncing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Refs hold the latest values for async code (avoids stale closures).
  const openRef = useRef<LogRow[]>([])
  const outboxRef = useRef<OutboxOp[]>([])
  const syncingRef = useRef(false)

  const setOpen = useCallback((rows: LogRow[]) => {
    openRef.current = rows
    setOpenLogsState(rows)
    void kv.set(K.open, rows)
  }, [])

  const saveOutbox = useCallback(async (ops: OutboxOp[]) => {
    outboxRef.current = ops
    setPending(ops.length)
    await kv.set(K.outbox, ops)
  }, [])

  /** Push queued ops to Supabase, oldest first. Returns why it stopped early, if it did. */
  const flush = useCallback(async (): Promise<Pause> => {
    while (outboxRef.current.length > 0) {
      const op = outboxRef.current[0]
      const error = await send(op)
      if (error) {
        if (isNetworkError(error)) return 'network'
        if (isAuthError(error)) return 'auth'
        if (!isDuplicate(error)) {
          // Permanent problem (e.g. permissions). Park it so it can't block the queue, and surface it.
          const parked = (await kv.get<OutboxOp[]>(K.failed)) ?? []
          await kv.set(K.failed, [...parked, op])
          setFailed(parked.length + 1)
        }
      }
      await saveOutbox(outboxRef.current.slice(1))
    }
    return null
  }, [saveOutbox])

  const refresh = useCallback(async () => {
    const [u, r, o] = await Promise.all([
      supabase.from('units').select('id,name').order('name'),
      supabase.from('residents').select(RES_COLS).eq('active', true),
      supabase.from('logs').select(LOG_COLS).is('exit_time', null).order('entry_time', { ascending: false }),
    ])
    const err = u.error ?? r.error ?? o.error
    if (err) throw new Error(err.message)
    setUnits(u.data as Unit[])
    setResidents(r.data as Resident[])
    void kv.set(K.units, u.data)
    void kv.set(K.residents, r.data)
    setOpen(overlay(o.data as LogRow[], outboxRef.current))
  }, [setOpen])

  const sync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)
    let again = false
    try {
      const pause = await flush()
      if (pause === 'network') {
        setSyncError('Waiting for connection')
      } else if (pause === 'auth') {
        setSyncError('Session expired – sign in again')
      } else {
        await refresh()
        setLastSync(new Date().toISOString())
        setSyncError(null)
        again = outboxRef.current.length > 0 // something was queued while we were refreshing
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
    if (again) void sync()
  }, [flush, refresh])

  // 1) Load cache → show it right away → sync.
  useEffect(() => {
    ;(async () => {
      const [u, r, o, ob, f] = await Promise.all([
        kv.get<Unit[]>(K.units),
        kv.get<Resident[]>(K.residents),
        kv.get<LogRow[]>(K.open),
        kv.get<OutboxOp[]>(K.outbox),
        kv.get<OutboxOp[]>(K.failed),
      ])
      setUnits(u ?? [])
      setResidents(r ?? [])
      openRef.current = o ?? []
      setOpenLogsState(o ?? [])
      outboxRef.current = ob ?? []
      setPending((ob ?? []).length)
      setFailed((f ?? []).length)
      setReady(true)
      void sync()
    })()
  }, [sync])

  // 2) Connectivity, focus and a heartbeat.
  useEffect(() => {
    const goOnline = () => { setOnline(true); void sync() }
    const goOffline = () => setOnline(false)
    const onVisible = () => { if (document.visibilityState === 'visible') void sync() }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    document.addEventListener('visibilitychange', onVisible)
    const t = setInterval(() => void sync(), 30_000)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(t)
    }
  }, [sync])

  // 3) Realtime: when any gate logs a vehicle, re-sync here.
  useEffect(() => {
    let timer: number | undefined
    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void sync(), 400)
    }
    const channel = supabase
      .channel('gate-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'logs' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'residents' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, bump)
      .subscribe()
    return () => {
      window.clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [sync])

  const recordEntry = useCallback(
    async (input: EntryInput) => {
      const plate = normalizePlate(input.plate)
      if (openRef.current.some((l) => l.plate === plate)) throw new Error('This vehicle is already inside.')
      const now = new Date().toISOString()
      const log: LogRow = {
        id: uuid(),
        plate,
        unit_id: input.unit?.id ?? null,
        unit_name: input.unit?.name ?? null,
        driver_name: input.driverName?.trim() || input.resident?.full_name || null,
        resident_id: input.resident?.id ?? null,
        is_registered: Boolean(input.resident),
        entry_time: now,
        exit_time: null,
      }
      setOpen([log, ...openRef.current])
      await saveOutbox([...outboxRef.current, { opId: uuid(), type: 'entry', log, queuedAt: now }])
      void sync()
      return log
    },
    [saveOutbox, setOpen, sync],
  )

  const recordExit = useCallback(
    async (logId: string) => {
      const target = openRef.current.find((l) => l.id === logId)
      if (!target) return
      const now = new Date().toISOString()
      // Never let a clock difference between devices produce an exit before the entry.
      const exit_time = now < target.entry_time ? target.entry_time : now
      setOpen(openRef.current.filter((l) => l.id !== logId))
      await saveOutbox([...outboxRef.current, { opId: uuid(), type: 'exit', logId, exit_time, queuedAt: now }])
      void sync()
    },
    [saveOutbox, setOpen, sync],
  )

  const value = useMemo<DataState>(() => {
    const byPlate = new Map(residents.map((r) => [r.plate, r]))
    const openByPlate = new Map(openLogs.map((l) => [l.plate, l]))
    return {
      units, residents, openLogs, pending, failed, online, syncing, lastSync, syncError, ready,
      findOpen: (p) => openByPlate.get(normalizePlate(p)),
      findResident: (p) => byPlate.get(normalizePlate(p)),
      recordEntry, recordExit, sync,
    }
  }, [units, residents, openLogs, pending, failed, online, syncing, lastSync, syncError, ready, recordEntry, recordExit, sync])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData must be used inside <DataProvider>')
  return v
}
