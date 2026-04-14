import { prisma } from "@/lib/prisma"

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string | Array<{ type: "text" | "image_url"; text?: string; image_url?: { url: string } }> | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string // Required for tool role messages
}

export interface OpenRouterTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, any>
      required?: string[]
    }
  }
}

export interface OpenRouterRequest {
  model: string
  messages: OpenRouterMessage[]
  temperature?: number
  max_tokens?: number
  top_p?: number
  tools?: OpenRouterTool[]
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } }
}

export interface OpenRouterResponse {
  id: string
  model: string
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: Array<{
        id: string
        type: "function"
        function: {
          name: string
          arguments: string
        }
      }>
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/**
 * Call OpenRouter API
 */
export async function callOpenRouter(
  request: OpenRouterRequest,
  apiKey: string
): Promise<OpenRouterResponse> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://superkillo.com",
      "X-Title": "SuperKillo AI",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * Get available models from OpenRouter
 */
export async function fetchOpenRouterModels(apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`)
  }

  return response.json()
}
