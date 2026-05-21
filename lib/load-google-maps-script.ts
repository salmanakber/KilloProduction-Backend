/** Load Maps JavaScript API once per page (recommended loading=async + callback). */

const CALLBACK_NAME = "__kilooMapsInitCallback"

let loadPromise: Promise<void> | null = null

declare global {
  interface Window {
    [key: string]: unknown
    google?: { maps?: unknown }
  }
}

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"))
  }

  if (window.google?.maps) return Promise.resolve()

  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.maps) resolve()
      else reject(new Error("Google Maps API loaded but google.maps is missing"))
    }

    const existing = document.getElementById("google-maps-js-api") as HTMLScriptElement | null
    if (existing) {
      if (window.google?.maps) {
        finish()
        return
      }
      existing.addEventListener("load", () => finish(), { once: true })
      existing.addEventListener(
        "error",
        () => {
          loadPromise = null
          reject(new Error("Failed to load Google Maps script"))
        },
        { once: true }
      )
      return
    }

    window[CALLBACK_NAME] = () => {
      finish()
    }

    const script = document.createElement("script")
    script.id = "google-maps-js-api"
    script.async = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${CALLBACK_NAME}&v=weekly`
    script.onerror = () => {
      loadPromise = null
      delete window[CALLBACK_NAME]
      reject(new Error("Failed to load Google Maps script"))
    }
    document.head.appendChild(script)
  })

  return loadPromise
}
