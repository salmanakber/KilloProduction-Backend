import { NextRequest, NextResponse } from "next/server";
import { systemSettings } from "@/lib/systemSettings";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text : "";
    const voiceOverride = typeof body?.voice === "string" ? body.voice : undefined;
    const proxyAudio = body?.proxyAudio !== false; // default true

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Missing 'text'" }, { status: 400, headers: corsHeaders });
    }

    if (text.length > 5000) {
      return NextResponse.json({ error: "Text too long (max 5000 chars)" }, { status: 400, headers: corsHeaders });
    }

    const settings = await systemSettings();
    const baseUrl: string = settings?.tts?.baseUrl || "http://209.97.132.83:8080";
    const voice: string = voiceOverride || settings?.tts?.voice || "en-GB-RyanNeural";

    const url = `${baseUrl.replace(/\/+$/, "")}/generate`;

    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });

    const upstreamText = await upstream.text();
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "TTS upstream error", status: upstream.status, details: upstreamText },
        { status: 502, headers: corsHeaders }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(upstreamText);
    } catch {
      return NextResponse.json(
        { error: "Invalid upstream response", details: upstreamText },
        { status: 502, headers: corsHeaders }
      );
    }

    if (!parsed?.url) {
      return NextResponse.json(
        { error: "Upstream did not return url", details: parsed },
        { status: 502, headers: corsHeaders }
      );
    }

    // Prefer returning an API-hosted URL to avoid client-side http/ATS issues and simplify playback.
    let finalUrl = parsed.url as string;
    console.log("proxyAudio", finalUrl);
    if (proxyAudio) {
      try {
        const upstreamUrl = new URL(parsed.url);
        const file = upstreamUrl.pathname.split("/").pop();
        if (file) {
          const origin = request.nextUrl.origin;
          finalUrl = `${origin}/api/tts/audio/${encodeURIComponent(file)}`;
        }
      } catch {
        // keep original url
      }
    }

    // Keep both urls for debugging/compat. Some clients may read `upstream_url`.
    // We set `upstream_url` to the playable URL (same as `url`) to avoid accidental direct-http playback failures.
    return NextResponse.json(
      { url: finalUrl, upstream_url: finalUrl, source_url: parsed.url, voice, baseUrl },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("TTS generate failed:", error);
    return NextResponse.json(
      { error: "Failed to generate speech", details: error?.message || String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

