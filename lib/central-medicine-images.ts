/**
 * CentralMedicine.images is Json: either string[], legacy, or
 * { primary, secondary, img1, ... } (admin may add more keys later).
 * Only `primary` (or Primary) is the catalog cover; others are gallery.
 */

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim())
}

export function parseCentralMedicineImages(raw: unknown): {
  /** Cover / list card — only primary */
  primaryUrl: string | null
  /** Gallery: primary first, then secondary, img1, then any other URL values */
  allUrls: string[]
} {
  if (raw == null) {
    return { primaryUrl: null, allUrls: [] }
  }

  if (typeof raw === "string") {
    const t = raw.trim()
    if (isHttpUrl(t)) return { primaryUrl: t, allUrls: [t] }
    return { primaryUrl: null, allUrls: [] }
  }

  if (Array.isArray(raw)) {
    const urls = raw
      .filter((x): x is string => typeof x === "string" && isHttpUrl(x))
      .map((x) => x.trim())
    const dedup = [...new Set(urls)]
    return { primaryUrl: dedup[0] ?? null, allUrls: dedup }
  }

  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>
    const pick = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = o[k]
        if (typeof v === "string" && isHttpUrl(v)) return v.trim()
      }
      return null
    }

    /** List/card cover: only explicit primary — never secondary/img1 as substitute */
    const coverOnly = pick(["primary", "Primary", "PRIMARY"])
    const secondary = pick(["secondary", "Secondary", "secondry", "Secondry"])
    const img1 = pick(["img1", "Img1", "IMG1"])

    const reserved = new Set([
      "primary",
      "Primary",
      "PRIMARY",
      "secondary",
      "Secondary",
      "secondry",
      "Secondry",
      "img1",
      "Img1",
      "IMG1",
    ])

    const extras: string[] = []
    for (const [k, v] of Object.entries(o)) {
      if (reserved.has(k)) continue
      if (typeof v === "string" && isHttpUrl(v)) extras.push(v.trim())
      else if (Array.isArray(v)) {
        for (const x of v) {
          if (typeof x === "string" && isHttpUrl(x)) extras.push(x.trim())
        }
      }
    }
    extras.sort()

    const ordered = [coverOnly, secondary, img1, ...extras].filter((x): x is string => !!x)
    const allUrls = [...new Set(ordered)]
    return {
      primaryUrl: coverOnly,
      allUrls,
    }
  }

  return { primaryUrl: null, allUrls: [] }
}

/** For list endpoints: URL string or null (client uses placeholder). */
export function coverImageFromCentralMedicineJson(raw: unknown): string | null {
  return parseCentralMedicineImages(raw).primaryUrl
}

export function galleryFromCentralMedicineJson(raw: unknown): string[] {
  return parseCentralMedicineImages(raw).allUrls
}

/** API shape: `image` = cover (primary only); `images` = full gallery */
export function serializePharmacyProductImages(centralImages: unknown): {
  image: string | null
  images: string[]
} {
  const { primaryUrl, allUrls } = parseCentralMedicineImages(centralImages)
  return { image: primaryUrl, images: allUrls }
}
