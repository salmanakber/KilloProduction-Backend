import { prisma } from "@/lib/prisma"
import { callOpenRouter, OpenRouterMessage, OpenRouterRequest } from "./openrouter"
import { callHuggingFace, HuggingFaceMessage, HuggingFaceRequest } from "./huggingface"
import { callGitHub } from "./github"
import { getAllMedicines } from "../virtual-doctor/ai-medicine-matcher"
import { AIUseCase } from "@prisma/client"

export type AIModelCategory = "TEXT_TO_TEXT" | "IMAGE_TO_TEXT"

export interface AIAnalysisRequest {
  category: AIModelCategory
  useCase?: AIUseCase
  messages: OpenRouterMessage[]
  systemPrompt?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  imageUrl?: string // For image-to-text
  tools?: any[] // Enabled tools from configuration
  customFunctions?: any[] // Custom function schemas
  providerPreference?: "auto" | "openrouter" | "huggingface" | "github" | "groq" | "google" // Provider selection preference
}

export interface AIAnalysisResponse {
  content: string
  modelId: string
  modelName: string
  tokensUsed?: {
    input: number
    output: number
    total: number
  }
  latency?: number
}

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

type GoogleStudioResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
    totalTokenCount?: number
  }
}

type GoogleListModelsResponse = {
  models?: Array<{
    name?: string
    supportedGenerationMethods?: string[]
  }>
}

function normalizeGoogleModelCandidates(inputModelId: string): string[] {
  const raw = String(inputModelId || "").trim()
  const withoutPrefix = raw.replace(/^models\//i, "")
  const tail = withoutPrefix.includes("/") ? withoutPrefix.split("/").pop() || withoutPrefix : withoutPrefix
  const candidates = [
    withoutPrefix,
    tail,
    "gemini-1.5-flash",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash-latest",
    "gemini-2.0-flash",
  ]
  return Array.from(new Set(candidates.filter(Boolean)))
}

/**
 * IDs like `google/gemini-2.0-flash-exp:free` are OpenRouter (and similar) catalog slugs.
 * They must use the OpenRouter HTTP API with an OpenRouter key — not Google AI Studio REST.
 * Native Gemini IDs are usually `gemini-1.5-flash` or `models/gemini-...`.
 */
function isOpenRouterStyleModelId(modelId: string): boolean {
  const raw = String(modelId || "").trim()
  if (!raw || /^https?:\/\//i.test(raw) || raw.includes("huggingface.co")) return false
  const slash = raw.indexOf("/")
  if (slash <= 0 || slash >= raw.length - 1) return false
  const org = raw.slice(0, slash).toLowerCase()
  if (org === "models") return false

  return (
    org === "google" ||
    org.startsWith("meta") ||
    org.includes("openai") ||
    org.includes("anthropic") ||
    org.includes("mistral") ||
    org.includes("deepseek") ||
    org.includes("qwen") ||
    org.includes("x-ai") ||
    org === "xai" ||
    org.includes("cohere") ||
    org.includes("perplexity") ||
    org.includes("nvidia") ||
    org.includes("microsoft") ||
    org.includes("amazon") ||
    org.includes("togethercomputer") ||
    org.includes("nousresearch") ||
    org.includes("openchat")
  )
}

function moveGoogleNativeModelsLast(models: any[]): any[] {
  const native: any[] = []
  const rest: any[] = []
  for (const m of models) {
    const provider = String(m.provider || "").toLowerCase()
    const mid = String(m.modelId || "")
    const isNativeGoogle =
      !isOpenRouterStyleModelId(mid) &&
      !provider.includes("openrouter") &&
      (provider.includes("google") || provider.includes("ai studio") || provider.includes("gemini"))
    if (isNativeGoogle) native.push(m)
    else rest.push(m)
  }
  return [...rest, ...native]
}

async function fetchGoogleSupportedModels(apiKey: string): Promise<string[]> {
  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(listUrl, { method: "GET" })
  const data = (await res.json().catch(() => ({}))) as GoogleListModelsResponse
  if (!res.ok) {
    throw new Error(`Google AI Studio listModels error (${res.status})`)
  }
  return (data.models || [])
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => String(m.name || "").replace(/^models\//i, "").trim())
    .filter(Boolean)
}

async function callGroq(modelId: string, messages: OpenRouterMessage[], apiKey: string, opts: {
  temperature?: number
  maxTokens?: number
  topP?: number
}): Promise<GroqResponse> {
  if (!apiKey) throw new Error("Groq API key is missing")
  const payload = {
    model: modelId,
    messages: messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
    top_p: opts.topP ?? 1.0,
  }
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Groq error (${res.status}): ${data?.error?.message || JSON.stringify(data)}`)
  return data
}

async function callGoogleAIStudio(modelId: string, messages: OpenRouterMessage[], apiKey: string, opts: {
  temperature?: number
  maxTokens?: number
  topP?: number
}): Promise<GoogleStudioResponse> {
  if (!apiKey) throw new Error("Google AI Studio API key is missing")
  const promptText = messages
    .map((m) => `${String(m.role).toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n")
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
      topP: opts.topP ?? 1.0,
    },
  }
  const candidates = normalizeGoogleModelCandidates(modelId)
  let lastError: string | null = null

  for (const candidate of candidates) {
    const encodedModel = encodeURIComponent(candidate)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent?key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return data
    lastError = data?.error?.message || JSON.stringify(data)
    // Only continue trying alternates for not-found style failures.
    if (res.status !== 404) {
      throw new Error(`Google AI Studio error (${res.status}): ${lastError}`)
    }
  }

  // Final recovery: list supported models and retry using first compatible one.
  try {
    const supported = await fetchGoogleSupportedModels(apiKey)
    const preferred = supported.find((m) => /gemini.*(flash|pro)/i.test(m)) || supported[0]
    if (preferred) {
      const retryUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(preferred)}:generateContent?key=${encodeURIComponent(apiKey)}`
      const retryRes = await fetch(retryUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const retryData = await retryRes.json().catch(() => ({}))
      if (retryRes.ok) return retryData
      throw new Error(retryData?.error?.message || JSON.stringify(retryData))
    }
  } catch (e: any) {
    lastError = e?.message || lastError
  }

  throw new Error(`Google AI Studio error (404): ${lastError || "No compatible generateContent model found for this API key"}`)
}

function stripVisualPromptBuilderState(systemPrompt: string): string {
  // The admin visual builder embeds a large JSON state block in the saved prompt so it can be re-hydrated in the UI.
  // That block should NEVER be sent to the model (wastes tokens and increases truncation risk).
  return systemPrompt
    .replace(/<!--\s*\[VP_STATE\][\s\S]*?\[\/VP_STATE\]\s*-->/g, "")
    .trim()
}

/**
 * Load models eligible for the queue. Includes RATE_LIMITED so a temporary API 429
 * does not permanently remove that provider from rotation (otherwise only leftover
 * ONLINE models run — often misordering fallback).
 */
async function getActiveModels(category: AIModelCategory): Promise<any[]> {
  const rows = await prisma.aIModel.findMany({
    where: {
      category,
      isActive: true,
      status: {
        in: ["ONLINE", "ISSUES", "RATE_LIMITED"],
      },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  })

  const statusRank: Record<string, number> = {
    ONLINE: 0,
    ISSUES: 1,
    RATE_LIMITED: 2,
  }

  return [...rows].sort((a, b) => {
    const sa = statusRank[String(a.status)] ?? 9
    const sb = statusRank[String(b.status)] ?? 9
    if (sa !== sb) return sa - sb
    return (a.priority ?? 0) - (b.priority ?? 0)
  })
}

/**
 * Keep preferred attempt order (e.g. OpenRouter first in "auto"), then append any other
 * active models so a narrowed preference does not block cross-provider fallback.
 */
function mergeModelAttemptOrder(primary: any[], pool: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const m of primary) {
    const id = String(m?.id ?? "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(m)
  }
  for (const m of pool) {
    const id = String(m?.id ?? "")
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(m)
  }
  return out
}

/**
 * Check if model has quota available
 */
function hasQuotaAvailable(model: any): boolean {
  const now = new Date()
  const lastReset = new Date(model.lastQuotaReset)
  const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60)

  // Reset hourly quota if more than 1 hour passed
  if (hoursSinceReset >= 1) {
    return true
  }

  // Check hourly quota
  if (model.hourlyQuotaLimit && model.currentHourlyUsage >= model.hourlyQuotaLimit) {
    return false
  }

  // Check daily quota
  if (model.dailyQuotaLimit && model.currentDailyUsage >= model.dailyQuotaLimit) {
    return false
  }

  return true
}

/**
 * Update model usage counters
 */
async function updateModelUsage(modelId: string, tokensUsed: number) {
  const model = await prisma.aIModel.findUnique({ where: { id: modelId } })
  if (!model) return

  const now = new Date()
  const lastReset = new Date(model.lastQuotaReset)
  const hoursSinceReset = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60)

  // Reset counters if needed
  const shouldResetHourly = hoursSinceReset >= 1
  const shouldResetDaily = (now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24) >= 1

  await prisma.aIModel.update({
    where: { id: modelId },
    data: {
      currentHourlyUsage: shouldResetHourly ? 1 : { increment: 1 },
      currentDailyUsage: shouldResetDaily ? 1 : { increment: 1 },
      lastQuotaReset: shouldResetHourly || shouldResetDaily ? now : model.lastQuotaReset,
    },
  })
}

/**
 * Log AI usage
 */
async function logUsage(
  modelId: string,
  category: AIModelCategory,
  useCase: AIUseCase | undefined,
  status: "SUCCESS" | "FAILED" | "RATE_LIMITED" | "TIMEOUT",
  latency: number | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  errorMessage?: string
) {
  await prisma.aIUsageLog.create({
    data: {
      modelId,
      category,
      useCase: useCase || null,
      status,
      latency,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens && outputTokens ? inputTokens + outputTokens : undefined,
      errorMessage,
    },
  })
}

/**
 * Call AI with queue/fallback logic
 */
export async function callAIWithQueue(request: AIAnalysisRequest): Promise<AIAnalysisResponse> {
  const startTime = Date.now()
  const models = await getActiveModels(request.category)

  if (models.length === 0) {
    throw new Error(`No active models found for category: ${request.category}`)
  }

  console.log(
    `[callAIWithQueue] Loaded ${models.length} ${request.category} row(s): ${models
      .map((m) => `${m.name || m.modelId} [${m.provider}] (${m.status})`)
      .join(", ")}`,
  )

  // Filter models with available quota
  const availableModels = models.filter(hasQuotaAvailable)

  if (availableModels.length === 0) {
    throw new Error(`All models have exceeded their quota limits for category: ${request.category}`)
  }

  const quotaSkipped = models.filter((m) => !hasQuotaAvailable(m))
  if (quotaSkipped.length > 0) {
    console.warn(
      `[callAIWithQueue] ${quotaSkipped.length} model(s) skipped (quota): ${quotaSkipped
        .map((m) => `${m.name || m.modelId} [${m.provider}]`)
        .join(", ")}`,
    )
  }

  // Separate models by provider - OpenRouter, Hugging Face, GitHub, Groq, Google AI Studio
  const huggingFaceModels = availableModels.filter(m => {
    const provider = m.provider?.toLowerCase() || ""
    return provider.includes("huggingface") || provider.includes("hugging") || m.modelId.includes("huggingface.co")
  })
  const githubModels = availableModels.filter(m => {
    const provider = m.provider?.toLowerCase() || ""
    return provider.includes("github")
  })
  const groqModels = availableModels.filter(m => {
    const provider = m.provider?.toLowerCase() || ""
    return provider.includes("groq")
  })
  const googleStudioModels = availableModels.filter(m => {
    const provider = m.provider?.toLowerCase() || ""
    if (isOpenRouterStyleModelId(m.modelId)) return false
    if (provider.includes("openrouter")) return false
    return provider.includes("google") || provider.includes("ai studio") || provider.includes("gemini")
  })
  const openRouterModels = availableModels.filter(m => {
    const provider = m.provider?.toLowerCase() || ""
    if (provider.includes("huggingface") || provider.includes("hugging") || m.modelId.includes("huggingface.co")) {
      return false
    }
    if (provider.includes("github")) return false
    if (provider.includes("groq")) return false
    if (isOpenRouterStyleModelId(m.modelId)) return true
    return (
      !provider.includes("google") &&
      !provider.includes("ai studio") &&
      !provider.includes("gemini") &&
      !m.modelId.includes("huggingface.co")
    )
  })

  // Determine model order based on provider preference
  let modelsToTry: any[] = []
  const preference = request.providerPreference || "auto"
  
  if (preference === "openrouter") {
    modelsToTry = openRouterModels.length > 0 ? openRouterModels : availableModels // Fallback to all if no OpenRouter models
  } else if (preference === "huggingface") {
    modelsToTry = huggingFaceModels.length > 0 ? huggingFaceModels : availableModels // Fallback to all if no HF models
  } else if (preference === "github") {
    modelsToTry = githubModels.length > 0 ? githubModels : availableModels // Fallback to all if no GitHub models
  } else if (preference === "groq") {
    modelsToTry = groqModels.length > 0 ? groqModels : availableModels
  } else if (preference === "google") {
    modelsToTry = googleStudioModels.length > 0 ? googleStudioModels : availableModels
  } else {
    // "auto" - Prefer HuggingFace for IMAGE_TO_TEXT (more stable for images),
    // otherwise keep the usual OpenRouter → GitHub → HuggingFace order.
    if (request.category === "IMAGE_TO_TEXT") {
      modelsToTry = [...huggingFaceModels, ...openRouterModels, ...githubModels, ...groqModels, ...googleStudioModels]
    } else {
      modelsToTry = [...openRouterModels, ...githubModels, ...huggingFaceModels, ...groqModels, ...googleStudioModels]
    }
  }
  
  if (modelsToTry.length === 0) {
    modelsToTry = availableModels // Ultimate fallback
  }

  // Always union with full quota-available list so one provider failing cannot end the request
  // if another provider still has models (fixes preference === "openrouter" | "groq" | etc.).
  modelsToTry = mergeModelAttemptOrder(modelsToTry, availableModels)
  // Native Google AI Studio tends to 503 under load; try other providers first when priorities collide.
  modelsToTry = moveGoogleNativeModelsLast(modelsToTry)

  console.log(
    `[callAIWithQueue] ${request.category} attempt order (${modelsToTry.length}): ${modelsToTry
      .map((m) => `${m.name || m.modelId} [${m.provider}]`)
      .join(" → ")}`,
  )

  let lastError: Error | null = null

  // Try each model in priority order
  for (const model of modelsToTry) {
    try {
      // Build messages with system prompt if provided
      const messages: OpenRouterMessage[] = []
      
      if (request.systemPrompt) {
        const cleanedSystemPrompt = stripVisualPromptBuilderState(request.systemPrompt)
        
        messages.push({
          role: "system",
          content: cleanedSystemPrompt,
        })
      }

      // Add user messages
      if (request.imageUrl && request.category === "IMAGE_TO_TEXT") {
        // For image-to-text, format message with image
        messages.push({
          role: "user",
          content: [
            ...(request.messages[0]?.content && typeof request.messages[0].content === "string"
              ? [{ type: "text" as const, text: request.messages[0].content }]
              : []),
            {
              type: "image_url" as const,
              image_url: { url: request.imageUrl },
            },
          ],
        })
      } else {
        messages.push(...request.messages)
      }

      // Check provider and route accordingly (must match buckets above)
      const provider = model.provider?.toLowerCase() || ""
      const mid = String(model.modelId || "")
      const isHuggingFace =
        provider.includes("huggingface") || provider.includes("hugging") || mid.includes("huggingface.co")
      const isGitHub = provider.includes("github")
      const isGroq = provider.includes("groq")
      const isGoogleStudio =
        !isOpenRouterStyleModelId(mid) &&
        !provider.includes("openrouter") &&
        (provider.includes("google") || provider.includes("ai studio") || provider.includes("gemini"))

      if (isHuggingFace) {
        // Hugging Face API call
        // Note: Hugging Face doesn't support tools/function calling in the same way
        // We'll convert messages to text format
        
        const hfMessages: HuggingFaceMessage[] = messages
          .filter((msg): msg is OpenRouterMessage & { role: "system" | "user" | "assistant" } => 
            msg.role === "system" || msg.role === "user" || msg.role === "assistant"
          )
          .map(msg => ({
            role: msg.role as "system" | "user" | "assistant",
            content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
          }))

        const hfRequest: HuggingFaceRequest = {
          inputs: hfMessages,
          parameters: {
            temperature: request.temperature ?? model.temperature ?? 0.7,
            max_new_tokens: request.maxTokens ?? model.maxTokens ?? 4096,
            top_p: request.topP ?? model.topP ?? 1.0,
            return_full_text: false,
          },
          options: {
            wait_for_model: true,
            use_cache: false,
          },
        }

        const hfResponse = await callHuggingFace(model.modelId, hfRequest, model.apiKey)
        const latency = Date.now() - startTime

        // Extract content from Hugging Face response (OpenAI-compatible format)
        let content = ""
        if (Array.isArray(hfResponse)) {
          content = hfResponse[0]?.generated_text || hfResponse[0]?.text || ""
        } else if (hfResponse.generated_text) {
          // New OpenAI-compatible format
          content = hfResponse.generated_text
        } else if ((hfResponse as any).choices && (hfResponse as any).choices[0]?.message?.content) {
          // OpenAI-compatible response format
          content = (hfResponse as any).choices[0].message.content
        } else {
          content = hfResponse.text || JSON.stringify(hfResponse)
        }

        // Update usage counters (Hugging Face doesn't provide token counts in the same way)
        await updateModelUsage(model.id, content.length) // Approximate token count

        // Log successful usage
        await logUsage(
          model.id,
          request.category,
          request.useCase,
          "SUCCESS",
          latency,
          undefined, // Hugging Face doesn't provide detailed token counts
          undefined,
          undefined
        )

        // Update model status to ONLINE if it was ISSUES
        if (model.status === "ISSUES") {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { status: "ONLINE", lastHealthCheck: new Date() },
          })
        }

        return {
          content,
          modelId: model.id,
          modelName: model.name,
          tokensUsed: undefined, // Hugging Face doesn't provide token counts
          latency,
        }
      } else if (isGitHub) {
        // GitHub Models API call (OpenAI-compatible)
        const ghRequest = {
          model: model.modelId,
          messages,
          temperature: request.temperature ?? model.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? model.maxTokens ?? 4096,
          top_p: request.topP ?? model.topP ?? 1.0,
        }

        const ghResponse = await callGitHub(model.modelId, ghRequest, model.apiKey)
        const latency = Date.now() - startTime

        const choice = ghResponse.choices?.[0]
        const content = choice?.message?.content || ""

        if (!content || content.trim().length === 0) {
          throw new Error("GitHub Models returned empty response")
        }

        await updateModelUsage(model.id, ghResponse.usage?.total_tokens || 0)

        await logUsage(
          model.id,
          request.category,
          request.useCase,
          "SUCCESS",
          latency,
          ghResponse.usage?.prompt_tokens,
          ghResponse.usage?.completion_tokens,
          undefined
        )

        if (model.status === "ISSUES") {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { status: "ONLINE", lastHealthCheck: new Date() },
          })
        }

        return {
          content,
          modelId: model.id,
          modelName: model.name,
          tokensUsed: ghResponse.usage
            ? {
                input: ghResponse.usage.prompt_tokens,
                output: ghResponse.usage.completion_tokens,
                total: ghResponse.usage.total_tokens,
              }
            : undefined,
          latency,
        }
      } else if (isGroq) {
        const groqResponse = await callGroq(model.modelId, messages, model.apiKey, {
          temperature: request.temperature ?? model.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxTokens ?? 4096,
          topP: request.topP ?? model.topP ?? 1.0,
        })
        const latency = Date.now() - startTime
        const content = groqResponse.choices?.[0]?.message?.content || ""
        if (!content.trim()) throw new Error("Groq returned empty response")

        await updateModelUsage(model.id, groqResponse.usage?.total_tokens || content.length)
        await logUsage(
          model.id,
          request.category,
          request.useCase,
          "SUCCESS",
          latency,
          groqResponse.usage?.prompt_tokens,
          groqResponse.usage?.completion_tokens,
          undefined
        )
        if (model.status === "ISSUES") {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { status: "ONLINE", lastHealthCheck: new Date() },
          })
        }
        return {
          content,
          modelId: model.id,
          modelName: model.name,
          tokensUsed: groqResponse.usage
            ? {
                input: groqResponse.usage.prompt_tokens || 0,
                output: groqResponse.usage.completion_tokens || 0,
                total: groqResponse.usage.total_tokens || 0,
              }
            : undefined,
          latency,
        }
      } else if (isGoogleStudio) {
        const googleResponse = await callGoogleAIStudio(model.modelId, messages, model.apiKey, {
          temperature: request.temperature ?? model.temperature ?? 0.7,
          maxTokens: request.maxTokens ?? model.maxTokens ?? 4096,
          topP: request.topP ?? model.topP ?? 1.0,
        })
        const latency = Date.now() - startTime
        const content = (googleResponse.candidates?.[0]?.content?.parts || [])
          .map((p) => p?.text || "")
          .join("\n")
          .trim()
        if (!content) throw new Error("Google AI Studio returned empty response")

        await updateModelUsage(model.id, googleResponse.usageMetadata?.totalTokenCount || content.length)
        await logUsage(
          model.id,
          request.category,
          request.useCase,
          "SUCCESS",
          latency,
          googleResponse.usageMetadata?.promptTokenCount,
          googleResponse.usageMetadata?.candidatesTokenCount,
          undefined
        )
        if (model.status === "ISSUES") {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { status: "ONLINE", lastHealthCheck: new Date() },
          })
        }
        return {
          content,
          modelId: model.id,
          modelName: model.name,
          tokensUsed: googleResponse.usageMetadata
            ? {
                input: googleResponse.usageMetadata.promptTokenCount || 0,
                output: googleResponse.usageMetadata.candidatesTokenCount || 0,
                total: googleResponse.usageMetadata.totalTokenCount || 0,
              }
            : undefined,
          latency,
        }
      } else {
        // OpenRouter API call (existing logic)
        // Build tools array from enabled tools and custom functions
        const tools: any[] = []
        
        // Add enabled tools (web_search, code_interpreter)
        if (request.tools && Array.isArray(request.tools)) {
          for (const toolName of request.tools) {
            if (toolName === "web_search") {
              tools.push({
                type: "function",
                function: {
                  name: "web_search",
                  description: "Search the web for real-time information using Google or Bing",
                  parameters: {
                    type: "object",
                    properties: {
                      query: {
                        type: "string",
                        description: "The search query"
                      }
                    },
                    required: ["query"]
                  }
                }
              })
            } else if (toolName === "code_interpreter") {
              tools.push({
                type: "function",
                function: {
                  name: "code_interpreter",
                  description: "Execute Python code in a sandboxed environment for data analysis, calculations, and computations",
                  parameters: {
                    type: "object",
                    properties: {
                      code: {
                        type: "string",
                        description: "The Python code to execute"
                      }
                    },
                    required: ["code"]
                  }
                }
              })
            }
          }
        }
        
        // Add custom functions if provided
        if (request.customFunctions && Array.isArray(request.customFunctions)) {
          tools.push(...request.customFunctions)
        }

        // Prepare OpenRouter request
        const openRouterRequest: OpenRouterRequest = {
          model: model.modelId,
          messages,
          temperature: request.temperature ?? model.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? model.maxTokens ?? 4096,
          top_p: request.topP ?? model.topP ?? 1.0,
          ...(tools.length > 0 && { tools, tool_choice: "auto" }),
        }

        // Make API call
        let response = await callOpenRouter(openRouterRequest, model.apiKey)
        const latency = Date.now() - startTime

      // Handle function calls (tool calls) - loop until we get final response
      let maxIterations = 5 // Prevent infinite loops
      let iteration = 0
      
      while (response.choices && response.choices.length > 0 && iteration < maxIterations) {
        const choice = response.choices[0]
        const message = choice.message
        
        // Check if AI wants to call a function
        if (message.tool_calls && message.tool_calls.length > 0) {
          iteration++
          
          
          // Execute function calls and add results to messages
          const toolResults: OpenRouterMessage[] = []
          
          for (const toolCall of message.tool_calls) {
            const functionName = toolCall.function.name
            let functionArgs: any = {}
            
            try {
              functionArgs = JSON.parse(toolCall.function.arguments)
            } catch (parseError) {
              console.error(`Failed to parse function arguments for ${functionName}:`, toolCall.function.arguments)
              functionArgs = {}
            }
            
            
            
            try {
              let functionResult: any
              
              // Handle search_medicines function
              if (functionName === "search_medicines") {
                const query = functionArgs.query || ""
                const image = functionArgs.image // Optional image input
                
                
                
                // Search medicines from database
                const allMedicines = await getAllMedicines()
                
                
                // Filter medicines based on query - more comprehensive search
                const matchingMedicines = allMedicines.filter(med => {
                  if (!query || query.trim() === "") return false
                  
                  const searchText = query.toLowerCase()
                  const medName = med.name?.toLowerCase() || ""
                  const genericName = med.genericName?.toLowerCase() || ""
                  const description = med.description?.toLowerCase() || ""
                  const illnessTypes = Array.isArray(med.illnessTypes) 
                    ? med.illnessTypes.map((ill: any) => String(ill).toLowerCase())
                    : []
                  
                  return (
                    medName.includes(searchText) ||
                    genericName.includes(searchText) ||
                    description.includes(searchText) ||
                    illnessTypes.some(ill => ill.includes(searchText)) ||
                    searchText.split(' ').some(word => 
                      medName.includes(word) || 
                      genericName.includes(word) ||
                      description.includes(word)
                    )
                  )
                }).slice(0, 20) // Limit to 20 results
                
                
                
                functionResult = {
                  medicines: matchingMedicines.map(med => ({
                    name: med.name,
                    genericName: med.genericName,
                    description: med.description,
                    illnessTypes: med.illnessTypes,
                    activeIngredients: med.activeIngredients,
                    dosageInfo: med.dosageInfo,
                    warnings: med.warnings,
                    sideEffects: med.sideEffects,
                    category: med.category,
                    strength: med.strength,
                    manufacturer: med.manufacturer
                  })),
                  count: matchingMedicines.length,
                  query: query
                }
              } else {
                // Unknown function
                console.warn(`⚠️ Unknown function requested: ${functionName}`)
                functionResult = { error: `Unknown function: ${functionName}` }
              }
              
              // Add function result to messages (OpenRouter requires tool_call_id)
              toolResults.push({
                role: "tool",
                content: JSON.stringify(functionResult),
                tool_call_id: toolCall.id
              } as any)
              
            } catch (funcError: any) {
              console.error(`❌ Error executing function ${functionName}:`, funcError)
              toolResults.push({
                role: "tool",
                content: JSON.stringify({ error: funcError.message }),
                tool_call_id: toolCall.id
              } as any)
            }
          }
          
          // Add assistant's function call request and tool results to messages
          messages.push({
            role: "assistant",
            content: message.content || null,
            tool_calls: message.tool_calls
          } as any)
          messages.push(...toolResults)
          
          console.log(`📤 Sending function results back to AI (iteration ${iteration}/${maxIterations})`)
          
          // Make another API call with function results
          const nextRequest: OpenRouterRequest = {
            ...openRouterRequest,
            messages,
          }
          response = await callOpenRouter(nextRequest, model.apiKey)
          continue
        }
        
        // No function calls, we have the final response
        const content = message.content || ""
        
        // Log response details for debugging
        if (iteration > 0) {
          console.log(`✅ Final response received after ${iteration} function call iteration(s)`)
        }
        
        // If content is empty, check finish_reason and provide helpful error
        if (!content || content.trim().length === 0) {
          console.error('❌ AI returned empty content');
          console.error(`  Finish reason: ${choice.finish_reason}`);
          console.error(`  Iteration: ${iteration}`);
          console.error(`  Has tool_calls: ${!!message.tool_calls}`);
          
          // If finish_reason is "tool_calls" but we're here, something went wrong
          if (choice.finish_reason === "tool_calls" && iteration === 0) {
            console.error('❌ AI requested tool calls but we did not handle them properly');
            throw new Error('AI requested function calls but they were not processed correctly');
          }
          
          // If we've done iterations but still no content, the AI might need a prompt adjustment
          if (iteration > 0) {
            throw new Error('AI completed function calls but did not return a final response. Your system prompt should instruct the AI to always provide a final JSON response after using search_medicines function.');
          }
          
          // If no iterations and no content, the AI might have failed
          throw new Error('AI returned empty response. Check system prompt configuration - it should instruct the AI to return JSON format.');
        }
        
        // Update usage counters
        await updateModelUsage(model.id, response.usage?.total_tokens || 0)

        // Log successful usage
        await logUsage(
          model.id,
          request.category,
          request.useCase,
          "SUCCESS",
          latency,
          response.usage?.prompt_tokens,
          response.usage?.completion_tokens,
          undefined
        )

        // Update model status to ONLINE if it was ISSUES
        if (model.status === "ISSUES") {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { status: "ONLINE", lastHealthCheck: new Date() },
          })
        }

        return {
          content,
          modelId: model.id,
          modelName: model.name,
          tokensUsed: response.usage
            ? {
                input: response.usage.prompt_tokens,
                output: response.usage.completion_tokens,
                total: response.usage.total_tokens,
              }
            : undefined,
          latency,
        }
      }
      
      // If we exit the loop without a response, throw error
      throw new Error("No response from model or too many function call iterations")
      }
    } catch (error: any) {
      lastError = error
      const latency = Date.now() - startTime

      const prov = String(model?.provider || "unknown")
      const label = String(model?.name || model?.modelId || model?.id || "model")
      console.warn(
        `[callAIWithQueue] ${label} (${prov}) failed: ${error?.message || error}. Trying next model if available…`,
      )

      // Check error types
      const isRateLimited = error.message?.includes("429") || error.message?.includes("rate limit")
      const isOpenRouter404 = error.message?.includes("404") && error.message?.includes("OpenRouter")
      const isDataPolicyError = error.message?.includes("data policy") || error.message?.includes("No endpoints found")
      
      // OpenRouter / aggregator HTTP path (includes google/... slugs mislabeled as Google AI Studio)
      const provider = model.provider?.toLowerCase() || ""
      const mid = String(model.modelId || "")
      const isHuggingFace =
        provider.includes("huggingface") || provider.includes("hugging") || mid.includes("huggingface.co")
      const isGitHub = provider.includes("github")
      const isGroq = provider.includes("groq")
      const isGoogleStudio =
        !isOpenRouterStyleModelId(mid) &&
        !provider.includes("openrouter") &&
        (provider.includes("google") || provider.includes("ai studio") || provider.includes("gemini"))
      const isOpenRouterModel = !isHuggingFace && !isGitHub && !isGroq && !isGoogleStudio
      
      // If OpenRouter has data policy issues (404), log and continue to next model (which should be HuggingFace if available)
      if ((isOpenRouter404 || isDataPolicyError) && isOpenRouterModel) {
        console.warn(`OpenRouter model ${model.modelId} failed with data policy error (404). Error: ${error.message}. Will try HuggingFace models if available.`)
      }

      // Update model status
      if (isRateLimited) {
        await prisma.aIModel.update({
          where: { id: model.id },
          data: { status: "RATE_LIMITED", lastHealthCheck: new Date() },
        })
      } else if (isOpenRouter404 || isDataPolicyError) {
        // Mark OpenRouter models with data policy issues as having issues
        await prisma.aIModel.update({
          where: { id: model.id },
          data: { status: "ISSUES", lastHealthCheck: new Date() },
        })
      } else {
        await prisma.aIModel.update({
          where: { id: model.id },
          data: { status: "ISSUES", lastHealthCheck: new Date() },
        })
      }

      // Log failed usage
      await logUsage(
        model.id,
        request.category,
        request.useCase,
        isRateLimited ? "RATE_LIMITED" : "FAILED",
        latency,
        undefined,
        undefined,
        error.message
      )

      // Continue to next model (should automatically try HuggingFace if available in modelsToTry)
      continue
    }
  }

  // All models failed
  throw new Error(
    `All models failed for category ${request.category}. Last error: ${lastError?.message || "Unknown error"}`
  )
}

/**
 * Get configuration for a specific use case
 */
export async function getConfigurationForUseCase(useCase: AIUseCase) {
  return prisma.aIConfiguration.findFirst({
    where: {
      useCase,
      isActive: true,
    },
    include: {
      model: true,
    },
    orderBy: {
      version: "desc",
    },
  })
}

/**
 * Analyze data using AI (main helper function)
 */
export async function analyzeWithAI(
  useCase: AIUseCase,
  data: any,
  options?: {
    category?: AIModelCategory
    imageUrl?: string
    customPrompt?: string
    maxTokens?: number // Allow overriding maxTokens for specific calls
    providerPreference?: "auto" | "openrouter" | "huggingface" | "github" | "groq" | "google" // Provider selection preference
    disableTools?: boolean // Disable enabledTools + customFunctions from DB config (prevents tool-calling loops)
  }
): Promise<AIAnalysisResponse> {
  // Get configuration for use case
  const config = await getConfigurationForUseCase(useCase)

  if (!config) {
    throw new Error(`No active configuration found for use case: ${useCase}`)
  }

  // Determine category
  const category: AIModelCategory = options?.category || (options?.imageUrl ? "IMAGE_TO_TEXT" : "TEXT_TO_TEXT")

  // Build prompt based on use case
  let prompt = options?.customPrompt || ""

  if (!prompt) {
    switch (useCase) {
      case "ORDER_HISTORY":
        prompt = `Analyze the following order history data and provide insights:\n\n${JSON.stringify(data, null, 2)}`
        break
      case "REPORTING":
        prompt = `Analyze the following reporting data and provide a comprehensive report:\n\n${JSON.stringify(data, null, 2)}`
        break
      case "AI_DOCTOR":
        prompt = `As a medical AI assistant, analyze the following medical information and provide helpful guidance:\n\n${JSON.stringify(data, null, 2)}`
        break
      case "AI_MECHANIC":
        prompt = `As an automotive AI assistant, analyze the following vehicle/mechanic information and provide helpful guidance:\n\n${JSON.stringify(data, null, 2)}`
        break
        case "GENERAL_ANALYSIS":
          prompt = `Analyze the following data and provide a comprehensive analysis:\n\n${JSON.stringify(data, null, 2)}`
          break
        case "USER_ANALYTICS":
          prompt = `Analyze the following user analytics data and provide a comprehensive analysis:\n\n${JSON.stringify(data, null, 2)}`
          break
        case "PRESCRIPTION_ANALYSIS":
          prompt = `Analyze the following prescription data and provide a comprehensive analysis:\n\n${JSON.stringify(data, null, 2)}`
          break
        case "CUSTOM":
          prompt = `Analyze the following data and provide a comprehensive analysis:\n\n${JSON.stringify(data, null, 2)}`
          break
      default:
        prompt = `Analyze the following data:\n\n${JSON.stringify(data, null, 2)}`
    }
  }

  // Parse enabled tools and custom functions from config
  const enabledTools = config.enabledTools ? JSON.parse(JSON.stringify(config.enabledTools)) : []
  const customFunctions = config.customFunctions ? JSON.parse(JSON.stringify(config.customFunctions)) : []
  const finalEnabledTools = options?.disableTools ? [] : enabledTools
  const finalCustomFunctions = options?.disableTools ? [] : customFunctions

  // Call AI with queue
  // Use override maxTokens if provided, otherwise use config value
  const maxTokens = options?.maxTokens !== undefined 
    ? options.maxTokens 
    : (config.maxTokens !== null && config.maxTokens !== undefined ? config.maxTokens : undefined)
  
  return callAIWithQueue({
    category,
    useCase,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    systemPrompt: config.systemPrompt || undefined,
    temperature: config.temperature !== null && config.temperature !== undefined ? config.temperature : undefined,
    maxTokens: maxTokens,
    topP: config.topP !== null && config.topP !== undefined ? config.topP : undefined,
    imageUrl: options?.imageUrl,
    tools: finalEnabledTools,
    customFunctions: finalCustomFunctions,
    providerPreference: options?.providerPreference || "auto",
  })
}
