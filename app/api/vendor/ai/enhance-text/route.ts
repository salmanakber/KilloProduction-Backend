import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { callOpenRouter } from "@/lib/ai/openrouter"
import { analyzeWithAI } from "@/lib/ai/queue"
import { AIUseCase } from "@prisma/client"



function extractOpenRouterText(data: any): string {
  const msg = data?.choices?.[0]?.message
  if (!msg) return ""
  const c = msg.content
  if (typeof c === "string") return c.trim()
  if (Array.isArray(c)) {
    return c
      .map((part: any) => {
        if (typeof part === "string") return part
        if (part?.type === "text" && part.text) return part.text
        if (part?.text) return part.text
        return ""
      })
      .join("")
      .trim()
  }
  return ""
}

function stripMarkdownFence(raw: string): string {
  let s = raw.trim()
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)```$/im)
  if (fenced) return fenced[1].trim()
  const inline = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (inline) return inline[1].trim()
  return s
}

function parseTitleSuggestions(content: string, fallback: string): string[] {
  const cleaned = stripMarkdownFence(content)
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) {
      const out = parsed.map((x) => String(x).trim()).filter(Boolean)
      if (out.length > 0) return out.slice(0, 5)
    }
  } catch {
    /* fall through */
  }
  const bracket = cleaned.match(/\[[\s\S]*\]/)
  if (bracket) {
    try {
      const parsed = JSON.parse(bracket[0])
      if (Array.isArray(parsed)) {
        const out = parsed.map((x) => String(x).trim()).filter(Boolean)
        if (out.length > 0) return out.slice(0, 5)
      }
    } catch {
      /* fall through */
    }
  }
  const lines = cleaned
    .split(/\n|,/)
    .map((line) =>
      line
        .replace(/^\d+[\.\)]\s*/, "")
        .replace(/^[-*]\s*/, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    )
    .filter((x) => x.length > 2 && x.length < 200)
  if (lines.length > 0) return lines.slice(0, 5)
  if (cleaned.length > 0 && cleaned !== fallback) return [cleaned.slice(0, 120)]
  return [fallback]
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { text, type, context, module } = await request.json()

    if (!text || !type) {
      return NextResponse.json({ error: "text and type are required" }, { status: 400 })
    }

    let aiConfig = await prisma.aIConfiguration.findFirst({
      where: { isActive: true, useCase: "SMART_SHOP" as AIUseCase },
      include: { model: true },
      orderBy: { version: "desc" },
    })

    if (!aiConfig) {
      aiConfig = await prisma.aIConfiguration.findFirst({
        where: { isActive: true },
        include: { model: true },
        orderBy: { version: "desc" },
      })
    }

    if (!aiConfig) {
      return NextResponse.json({
        enhanced: text,
        suggestions: type === "title" ? [text] : undefined,
        message: "AI not configured — returned original text",
      })
    }

    const moduleLabel = module === "GROCERY" ? "grocery store" : "restaurant"
    const contextHint = context ? ` Context: ${context}.` : ""

    let systemPrompt: string
    let userPrompt: string

    if (type === "title") {
      systemPrompt = "You are a marketing expert for a food & grocery delivery app. Generate short, catchy titles."
      userPrompt = `Generate 3 catchy, short title options (max 8 words each) for a ${moduleLabel} deal/item. The vendor wrote: "${text}".${contextHint} Return ONLY a JSON array of 3 strings, nothing else. Example: ["Title One","Title Two","Title Three"]`
    } else {
      systemPrompt = "You are a marketing copywriter for a food & grocery delivery app. Write compelling product descriptions."
      userPrompt = `Enhance this ${moduleLabel} product/deal description to be compelling and professional. Keep the original meaning. Max 120 words. The vendor wrote: "${text}".${contextHint} Return ONLY the enhanced description text, nothing else.`
    }

    const response = await analyzeWithAI("SMART_SHOP" as AIUseCase, { text, type, context, module }, {
      category: "TEXT_TO_TEXT",
      customPrompt: systemPrompt + "\n\n" + userPrompt,
      maxTokens: 2500,
      disableTools: true,
    })

    const rawContent = response.content
    const content = rawContent || text
    console.log(rawContent)

    if (type === "title") {
      const suggestions = parseTitleSuggestions(content, text)
      const unique = [...new Set(suggestions.map((s) => s.trim()).filter(Boolean))]
      return NextResponse.json({ suggestions: unique.length > 0 ? unique : [text] })
    } else {
      const enhanced = stripMarkdownFence(content) || text
      return NextResponse.json({ enhanced: enhanced.length > 0 ? enhanced : text })
    }
  } catch (error: any) {
    console.error("AI enhance-text error:", error)
    return NextResponse.json({ error: "AI enhancement failed", enhanced: "" }, { status: 500 })
  }
}
