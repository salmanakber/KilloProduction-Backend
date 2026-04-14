import { OpenRouterMessage } from "./openrouter"

export interface GitHubChatRequest {
  model: string
  messages: OpenRouterMessage[]
  temperature?: number
  max_tokens?: number
  top_p?: number
}

/**
 * Minimal GitHub Models client using the OpenAI-compatible chat completions API.
 * Expects a GitHub access token with models access to be passed as apiKey.
 */
export async function callGitHub(
  modelId: string,
  request: GitHubChatRequest,
  apiKey: string
): Promise<any> {
  // GitHub Models REST endpoint (matches official docs)
  const url = "https://models.github.ai/inference/chat/completions"

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...request,
      model: modelId,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `GitHub Models request failed with ${res.status}: ${res.statusText} ${text}`
    )
  }

  return res.json()
}


export async function fetchGitHubModels(apiKey: string) {
  try {
    const response = await fetch("https://models.github.ai/catalog/models", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
  })
    if (!response.ok) {
      throw new Error(`GitHub Models request failed with ${response.status}: ${response.statusText}`)
    }
    return response.json()
  } catch (error: any) {
    console.error("Error fetching GitHub models:", error)
    return []
  }
}