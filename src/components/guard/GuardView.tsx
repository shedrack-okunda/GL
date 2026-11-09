import { useEffect, useState } from 'react'
import { useData } from '../../context/DataContext'
import PlateCapture from './PlateCapture'
import EntryPanel from './EntryPanel'
import ExitPanel from './ExitPanel'
import ActiveFeed from './ActiveFeed'

type Tab = 'gate' | 'inside'

export default function GuardView() {
  const { openLogs, findOpen } = useData()
  const [tab, setTab] = useState<Tab>('gate')
  const [plate, setPlate] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(''), 3500)
    return () => clearTimeout(t)
  }, [notice])

  const open = plate.length >= 3 ? findOpen(plate) : undefined

  function done(message: string) {
    setNotice(message)
    setPlate('')
  }

  return (
    <>
      <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 pb-32 pt-4">
        {notice && (
          <p role="status" className="rounded-xl bg-ink px-4 py-3 text-lg font-bold text-white">✓ {notice}</p>
        )}

        {tab === 'gate' ? (
          <>
            <PlateCapture plate={plate} onChange={setPlate} />
            {plate.length < 3 ? (
              <p className="panel p-5 text-lg text-muted">
                Scan or type a plate. GuardLog works out whether the vehicle is coming in or going out.
              </p>
            ) : open ? (
              <ExitPanel key={open.id} log={open} onDone={done} />
            ) : (
              <EntryPanel key={plate} plate={plate} onDone={done} />
            )}
          </>
        ) : (
          <ActiveFeed onPick={(p) => { setPlate(p); setTab('gate') }} />
        )}
      </main>

      <nav
        aria-label="Guard sections"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-line bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-xl grid-cols-2 gap-2 p-2">
          {([['gate', 'Gate'], ['inside', `Inside (${openLogs.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`min-h-14 rounded-xl text-lg font-bold ${tab === id ? 'bg-ink text-white' : 'text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
