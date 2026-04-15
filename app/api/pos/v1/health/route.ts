import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ ok: true, service: "pos-v1", ts: new Date().toISOString() })
}
