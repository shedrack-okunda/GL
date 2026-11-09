import { useRef, useState, type ChangeEvent } from 'react'
import { normalizePlate, formatPlate } from '../../lib/plate'
import { readPlate } from '../../lib/ocr'

interface Props {
  plate: string
  onChange: (plate: string) => void
}

const CameraIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
  </svg>
)

export default function PlateCapture({ plate, onChange }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [candidates, setCandidates] = useState<string[]>([])
  const [message, setMessage] = useState('')

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same photo
    if (!file) return
    setBusy(true)
    setMessage('')
    setCandidates([])
    try {
      const found = await readPlate(file)
      if (found.length === 0) {
        setMessage('No plate found in that photo. Retake it closer and level, or type the plate.')
      } else {
        onChange(found[0])
        setCandidates(found)
        setMessage('Check the letters against the vehicle before you confirm.')
      }
    } catch {
      setMessage('Scanning is not available right now (needs a connection the first time). Type the plate instead.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Licence plate" className="space-y-3">
      {/* The plate itself is the input: guards correct OCR mistakes right here. */}
      <div className="rounded-2xl border-[5px] border-ink bg-plate px-3 py-2 shadow-[0_3px_0_0_var(--color-ink)]">
        <label htmlFor="plate" className="sr-only">Licence plate number</label>
        <input
          id="plate"
          value={plate}
          onChange={(e) => { onChange(normalizePlate(e.target.value)); setCandidates([]); setMessage('') }}
          placeholder="KDA123A"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="w-full bg-transparent text-center font-display text-6xl font-bold uppercase tracking-[0.12em] text-ink placeholder:text-ink/30 focus:outline-none sm:text-7xl"
        />
        {plate.length >= 3 && (
          <p className="pb-0.5 text-center text-sm font-semibold text-ink/70">{formatPlate(plate)}</p>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <button type="button" className="btn btn-ink" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <CameraIcon /> {busy ? 'Reading plate…' : 'Scan plate'}
        </button>
        <button type="button" className="btn btn-quiet px-4 text-base" disabled={busy} onClick={() => uploadRef.current?.click()}>
          Upload photo
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={onFile} />
        <input ref={uploadRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onFile} />
      </div>

      {candidates.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Other possible readings">
          <span className="text-sm font-semibold text-muted">Also read as:</span>
          {candidates.slice(1).map((c) => (
            <button key={c} type="button" onClick={() => onChange(c)}
              className="min-h-10 rounded-lg border-2 border-ink/25 bg-card px-3 font-display text-xl font-bold tracking-wider">
              {c}
            </button>
          ))}
        </div>
      )}
      {message && <p role="status" className="text-base font-medium text-muted">{message}</p>}
    </section>
  )
}
