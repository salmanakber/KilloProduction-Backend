"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Loader2, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default function AjoGroupDetailAdminPage() {
  const params = useParams()
  const id = (params?.id as string) || ""
  const [group, setGroup] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/money-app-admin/ajo/groups/${id}`)
        const json = await res.json()
        if (json.success) setGroup(json.group)
      } finally {
        setLoading(false)
      }
    }
    if (id) void load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
      </div>
    )
  }

  if (!group) {
    return <div className="p-6 text-gray-500">Group not found</div>
  }

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/admin/money-app-admin/ajo"
        className="inline-flex items-center gap-2 text-sm text-teal-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Ajo groups
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{group.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Invite code: {group.inviteCode}</p>
        </div>
        <Badge>{group.status.replace(/_/g, " ")}</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Contribution</CardTitle>
          </CardHeader>
          <CardContent className="font-bold">
            {group.currency} {group.contributionAmount.toLocaleString()} / {group.frequency}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Cycle</CardTitle>
          </CardHeader>
          <CardContent className="font-bold">
            {group.currentCycleNumber} / {group.totalCycles}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500">Treasury</CardTitle>
          </CardHeader>
          <CardContent className="font-bold">
            {group.currency} {group.treasuryBalance.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Slot</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.members.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell>{m.user?.name || m.user?.phone || m.userId}</TableCell>
                  <TableCell>{m.role}</TableCell>
                  <TableCell>{(m.slotPosition ?? 0) + 1}</TableCell>
                  <TableCell>{m.status}</TableCell>
                  <TableCell>{m.currentContribution?.status || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
