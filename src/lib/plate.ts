/** Canonical form stored in the database: uppercase letters + digits only. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Display form: "KDA123A" → "KDA 123A". Anything unusual is shown as-is. */
export function formatPlate(plate: string): string {
  const m = /^([A-Z]{2,3})(\d{1,4})([A-Z]?)$/.exec(plate)
  return m ? `${m[1]} ${m[2]}${m[3]}` : plate
}

/**
 * Turns raw OCR text into a short ranked list of plausible plates.
 * Mixed letters+digits and 5–8 characters rank highest.
 */
export function extractPlateCandidates(text: string): string[] {
  const scored = new Map<string, number>()
  const add = (raw: string) => {
    const p = normalizePlate(raw)
    if (p.length < 4 || p.length > 10) return
    const hasLetter = /[A-Z]/.test(p)
    const hasDigit = /\d/.test(p)
    let score = 0
    if (hasLetter && hasDigit) score += 3
    if (p.length >= 5 && p.length <= 8) score += 2
    if (/^[A-Z]{2,3}\d{1,4}[A-Z]?$/.test(p)) score += 2 // e.g. KDA123A
    scored.set(p, Math.max(scored.get(p) ?? 0, score))
  }
  for (const line of text.split(/\r?\n/)) {
    add(line) // whole line ("KDA 123A")
    for (const tok of line.split(/\s+/)) add(tok) // single tokens
  }
  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
  // If anything looks like a real plate, ignore plain words ("KENYA") picked up from the bumper.
  const hasMixed = ranked.some(([, s]) => s >= 3)
  return ranked
    .filter(([, s]) => !hasMixed || s >= 3)
    .slice(0, 4)
    .map(([p]) => p)
}
