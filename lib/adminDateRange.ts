/** Shared admin UI range presets → absolute window [start, end]. */
export function parseAdminRange(range: string | null | undefined): { start: Date; end: Date } {
  const end = new Date()
  const start = new Date()
  switch (range || "7d") {
    case "24h":
      start.setTime(end.getTime() - 24 * 60 * 60 * 1000)
      break
    case "7d":
      start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case "30d":
      start.setTime(end.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case "90d":
      start.setTime(end.getTime() - 90 * 24 * 60 * 60 * 1000)
      break
    default:
      start.setTime(end.getTime() - 7 * 24 * 60 * 60 * 1000)
  }
  return { start, end }
}

export function previousWindow(start: Date, end: Date): { start: Date; end: Date } {
  const ms = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime())
  const prevStart = new Date(start.getTime() - ms)
  return { start: prevStart, end: prevEnd }
}
