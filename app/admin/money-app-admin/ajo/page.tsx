"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Users, Wallet, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

type AjoGroupRow = {
  id: string
  name: string
  status: string
  contributionAmount: number
  currency: string
  frequency: string
  maxMembers: number
  memberCount: number
  currentCycle: number
  totalCycles: number
  treasuryBalance: number
  creator: { name?: string | null; email?: string | null }
  createdAt: string
}

type Stats = {
  totalGroups: number
  activeGroups: number
  completedGroups: number
  disputedGroups: number
  totalContributions: number
  failedContributions: number
  totalTreasury: number
}

export default function AjoAdminPage() {
  const [groups, setGroups] = useState<AjoGroupRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [groupsRes, statsRes] = await Promise.all([
          fetch("/api/admin/money-app-admin/ajo/groups"),
          fetch("/api/admin/money-app-admin/ajo/stats"),
        ])
        const groupsJson = await groupsRes.json()
        const statsJson = await statsRes.json()
        if (groupsJson.success) setGroups(groupsJson.groups)
        if (statsJson.success) setStats(statsJson.stats)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajo / Esusu</h1>
        <p className="text-sm text-gray-500 mt-1">Women&apos;s finance groups — oversight & audit</p>
      </div>

      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Total Groups</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">{stats.totalGroups}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Active</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-teal-600">{stats.activeGroups}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Failed Contributions</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold text-amber-600">{stats.failedContributions}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">Treasury (pools)</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {(stats.totalTreasury ?? 0).toLocaleString()} <span className="text-sm font-medium text-gray-400">pool</span>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            All Groups
          </CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Wallet className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No Ajo groups yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contribution</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Creator</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link
                        href={`/admin/money-app-admin/ajo/groups/${g.id}`}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {g.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={g.status === "DISPUTED" ? "destructive" : "secondary"}>
                        {g.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {g.currency} {g.contributionAmount.toLocaleString()} / {g.frequency.toLowerCase()}
                    </TableCell>
                    <TableCell>
                      {g.memberCount}/{g.maxMembers}
                    </TableCell>
                    <TableCell>
                      {g.currentCycle}/{g.totalCycles}
                    </TableCell>
                    <TableCell>
                      {g.currency} {g.treasuryBalance.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {g.creator.name || g.creator.email || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {stats && stats.disputedGroups > 0 ? (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertCircle className="h-5 w-5" />
          <span>{stats.disputedGroups} group(s) in dispute require review</span>
        </div>
      ) : null}
    </div>
  )
}
