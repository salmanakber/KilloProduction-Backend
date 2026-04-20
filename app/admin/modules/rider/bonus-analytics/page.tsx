"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RefreshCw, Trophy, Clock, Users, Zap } from "lucide-react"

type AnalyticsPayload = {
  generatedAt: string
  worker: string
  activeChallengeId: string | null
  focus: {
    challenge: {
      id: string
      windowStart: string
      windowEnd: string
      peakScore: number
      peakThreshold: number
      targetRides: number
      bonusCapAmount: number
      commissionDiscountPct: number
      activeRidersSnapshot: number
      openRequestsSnapshot: number
      profitPerRideSnapshot: number
      baselineRidesExpected: number
      incrementalRidesCap: number
      status: string
    }
    counts: {
      invited: number
      accepted: number
      completed: number
      totalRidesProgress: number
    }
    leaderboard: Array<{
      participationId: string
      riderUserId: string
      riderName: string
      riderEmail: string | null
      riderPhone: string | null
      status: string
      ridesCompleted: number
      bonusPaid: number
      acceptedAt: string | null
      minutesFromAcceptToFirstPaid: number | null
      targetRides: number
    }>
  } | null
  recentChallenges: Array<{
    id: string
    createdAt: string
    windowStart: string
    windowEnd: string
    peakScore: number
    peakThreshold: number
    targetRides: number
    bonusCapAmount: number
    status: string
    activeRidersSnapshot: number
    openRequestsSnapshot: number
    participationsTotal: number
    acceptedCount: number
    completedCount: number
    ridesCompletedSum: number
    bonusPaidSum: number
  }>
}

export default function RiderBonusAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | "active">("active")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q =
        challengeId === "active" || !challengeId
          ? ""
          : `?challengeId=${encodeURIComponent(challengeId)}`
      const res = await fetch(`/api/admin/rider-bonus-analytics${q}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || "Failed to load")
      }
      const json = (await res.json()) as AnalyticsPayload
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [challengeId])

  useEffect(() => {
    void load()
  }, [load])

  const challengeOptions = data?.recentChallenges ?? []

  return (
    <div className="container mx-auto max-w-7xl space-y-8 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            Rider peak bonus analytics
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Live challenge metrics, leaderboards, and participation stats. Windows are opened when
            demand vs online riders crosses the peak threshold (worker{" "}
            <code className="rounded bg-muted px-1 text-xs">processRiderBonusTick</code>
            ).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={challengeId}
            onValueChange={(v) => setChallengeId(v as string | "active")}
          >
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Challenge" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Current / selected active window</SelectItem>
              {challengeOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {new Date(c.windowStart).toLocaleString()} — peak {c.peakScore.toFixed(2)} (
                  {c.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data?.worker && (
        <p className="text-xs text-muted-foreground border-l-2 border-muted pl-3">{data.worker}</p>
      )}

      {loading && !data && (
        <div className="text-sm text-muted-foreground">Loading analytics…</div>
      )}

      {data?.focus?.challenge && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5" /> Peak ratio
              </CardDescription>
              <CardTitle className="text-2xl">
                {data.focus.challenge.peakScore.toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Threshold ≥ {data.focus.challenge.peakThreshold}. Open jobs / online riders at creation.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> Snapshots @ creation
              </CardDescription>
              <CardTitle className="text-xl">
                {data.focus.challenge.openRequestsSnapshot} jobs ·{" "}
                {data.focus.challenge.activeRidersSnapshot} riders
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Target rides {data.focus.challenge.targetRides} · bonus cap{" "}
              {data.focus.challenge.bonusCapAmount.toFixed(0)} · commission −
              {data.focus.challenge.commissionDiscountPct}%
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Window</CardDescription>
              <CardTitle className="text-base font-medium leading-snug">
                {new Date(data.focus.challenge.windowStart).toLocaleString()} →{" "}
                {new Date(data.focus.challenge.windowEnd).toLocaleString()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={data.focus.challenge.status === "ACTIVE" ? "default" : "secondary"}>
                {data.focus.challenge.status}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Participation</CardDescription>
              <CardTitle className="text-xl">
                {data.focus.counts.invited} inv · {data.focus.counts.accepted} acc ·{" "}
                {data.focus.counts.completed} done
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Reported ride progress (sum): {data.focus.counts.totalRidesProgress}
            </CardContent>
          </Card>
        </div>
      )}

      {data?.focus?.challenge && (
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>
              Sorted by completed rides counted toward the challenge. “Minutes to first paid” uses
              the first paid delivery fee after acceptance in the challenge window (proxy for how
              fast the rider got a completed job).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Rider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Rides</TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> Min to 1st paid
                    </span>
                  </TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Bonus paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.focus.leaderboard.slice(0, 100).map((row, i) => (
                  <TableRow key={row.participationId}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.riderName}</div>
                      <div className="text-xs text-muted-foreground">{row.riderEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.ridesCompleted} / {row.targetRides}
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell">
                      {row.minutesFromAcceptToFirstPaid != null
                        ? `${row.minutesFromAcceptToFirstPaid} min`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      {row.bonusPaid > 0 ? row.bonusPaid.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.focus.leaderboard.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No participation rows for this challenge.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!loading && data && !data.focus?.challenge && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No challenge found for this selection (there may be no active peak window, or the ID is
            invalid).
          </CardContent>
        </Card>
      )}

      {data && data.recentChallenges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent challenge windows</CardTitle>
            <CardDescription>Historical peaks and aggregate rider engagement.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Window start</TableHead>
                  <TableHead>Peak</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Part.</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Finished</TableHead>
                  <TableHead className="text-right">Σ rides</TableHead>
                  <TableHead className="text-right">Σ bonus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentChallenges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(c.windowStart).toLocaleString()}
                    </TableCell>
                    <TableCell>{c.peakScore.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{c.participationsTotal}</TableCell>
                    <TableCell className="text-right">{c.acceptedCount}</TableCell>
                    <TableCell className="text-right">{c.completedCount}</TableCell>
                    <TableCell className="text-right">{c.ridesCompletedSum}</TableCell>
                    <TableCell className="text-right">{c.bonusPaidSum.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {data?.generatedAt && (
        <p className="text-xs text-muted-foreground text-center">
          Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}
