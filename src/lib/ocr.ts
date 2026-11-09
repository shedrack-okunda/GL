import type { Worker } from 'tesseract.js'
import { extractPlateCandidates } from './plate'

let workerPromise: Promise<Worker> | null = null

/** Loaded lazily so the ~MBs of OCR code never slow down app start. */
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js')
      const base = import.meta.env.VITE_OCR_ASSET_BASE?.replace(/\/$/, '')
      const worker = await createWorker(
        'eng',
        1,
        base
          ? { workerPath: `${base}/worker.min.js`, corePath: `${base}/core`, langPath: `${base}/lang` }
          : {},
      )
      await worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: '1',
      })
      return worker
    })().catch((e) => {
      workerPromise = null // allow a retry once the connection is back
      throw e
    })
  }
  return workerPromise
}

/** Downscale, greyscale and stretch contrast – cheap and makes plates far easier to read. */
async function preprocess(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g | 0]++
  }
  const total = canvas.width * canvas.height
  let lo = 0, hi = 255, acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break } }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Returns up to 4 candidate plates, best first. Empty array = nothing readable. */
export async function readPlate(file: Blob): Promise<string[]> {
  const canvas = await preprocess(file)
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas)
  return extractPlateCandidates(data.text)
}
