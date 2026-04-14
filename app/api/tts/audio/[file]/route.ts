import { NextRequest, NextResponse } from "next/server";
import { systemSettings } from "@/lib/systemSettings";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function GET(request: NextRequest, ctx: { params: Promise<{ file: string }> }) {
  try {
    const { file } = await ctx.params;
    if (!file || typeof file !== "string" || !/^[-_a-zA-Z0-9.]+$/.test(file)) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400, headers: corsHeaders });
    }

    const settings = await systemSettings();
    const baseUrl: string = settings?.tts?.baseUrl || "http://209.97.132.83:8080";

    // The upstream returns audio URLs like: http://<host>/audio/<file>.mp3
    // Derive the audio base from baseUrl host (strip port/path), then fetch /audio/<file>.
    let hostOrigin = "http://209.97.132.83";
    try {
      const u = new URL(baseUrl);
      hostOrigin = `${u.protocol}//${u.hostname}`; // port removed -> default 80/443
    } catch {
      // keep default
    }

    const upstreamUrl = `${hostOrigin.replace(/\/+$/, "")}/audio/${encodeURIComponent(file)}`;
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok) {
      const details = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "Upstream audio fetch failed", status: upstream.status, details },
        { status: 502, headers: corsHeaders }
      );
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await upstream.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("TTS audio proxy failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch audio", details: error?.message || String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

