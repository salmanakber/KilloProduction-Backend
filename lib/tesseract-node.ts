import path from "path"

/** Absolute paths so Next.js bundling does not rewrite tesseract worker locations. */
export function getTesseractWorkerOptions() {
  const pkgRoot = path.join(process.cwd(), "node_modules", "tesseract.js")
  return {
    workerPath: path.join(pkgRoot, "src", "worker-script", "node", "index.js"),
    workerBlobURL: false,
  } as const
}

export async function runTesseractOcr(imageBuffer: Buffer): Promise<{
  text: string
  confidence: number
}> {
  const Tesseract = (await import("tesseract.js")).default
  const worker = await Tesseract.createWorker("eng", 1, getTesseractWorkerOptions())
  try {
    const {
      data: { text, confidence },
    } = await worker.recognize(imageBuffer)
    return {
      text: (text || "").trim(),
      confidence: typeof confidence === "number" ? confidence : 65,
    }
  } finally {
    await worker.terminate()
  }
}
