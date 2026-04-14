import { prisma } from "@/lib/prisma"

export interface HuggingFaceMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface HuggingFaceRequest {
  inputs: string | HuggingFaceMessage[] // For chat models, use messages array; for text models, use string
  parameters?: {
    temperature?: number
    max_new_tokens?: number
    top_p?: number
    return_full_text?: boolean
  }
  options?: {
    wait_for_model?: boolean
    use_cache?: boolean
  }
}

export interface HuggingFaceResponse {
  generated_text?: string // For text generation models
  [key: string]: any // Hugging Face responses can vary
}

export interface HuggingFaceChatResponse {
  generated_text: string
  conversation: {
    generated_responses: string[]
    past_user_inputs: string[]
  }
}

/**
 * Call Hugging Face Router API (OpenAI-compatible)
 * 
 * Note: We use the HTTP API directly instead of @huggingface/inference SDK because:
 * 1. The router API (router.huggingface.co) uses OpenAI-compatible format
 * 2. Direct HTTP calls give us more control and fewer dependencies
 * 3. The SDK may not fully support the new router endpoint yet
 * 
 * If you want to use the official SDK, install: npm install @huggingface/inference
 * Then you can use: import { HfInference } from '@huggingface/inference'
 */
export async function callHuggingFace(
  modelId: string,
  request: HuggingFaceRequest,
  apiKey: string
): Promise<HuggingFaceResponse | HuggingFaceResponse[]> {
  // Convert HuggingFaceRequest to OpenAI-compatible format
  // The router API expects messages in OpenAI format
  const messages: any[] = []
  
  if (Array.isArray(request.inputs) && request.inputs.length > 0) {
    // If inputs is already an array of messages, use them directly
    for (const input of request.inputs) {
      if (typeof input === 'object' && 'role' in input && 'content' in input) {
        messages.push({
          role: input.role,
          content: input.content
        })
      } else {
        // Convert string to user message
        messages.push({
          role: "user",
          content: typeof input === 'string' ? input : JSON.stringify(input)
        })
      }
    }
  } else if (typeof request.inputs === 'string') {
    // Single string input
    messages.push({
      role: "user",
      content: request.inputs
    })
  } else {
    // Fallback
    messages.push({
      role: "user",
      content: JSON.stringify(request.inputs)
    })
  }

  // Use OpenAI-compatible chat completions endpoint
  // The router API is OpenAI-compatible, so we use the standard format
  const url = `https://router.huggingface.co/v1/chat/completions`
  
  const body = {
    model: modelId,
    messages: messages,
    temperature: request.parameters?.temperature ?? 0.7,
    max_tokens: request.parameters?.max_new_tokens ?? 4096,
    top_p: request.parameters?.top_p ?? 1.0,
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Hugging Face API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  
  // Handle OpenAI-compatible response format
  if (data.choices && data.choices.length > 0) {
    const content = data.choices[0].message?.content || ""
    return {
      generated_text: content,
      ...data
    }
  }
  
  // Fallback to original format if needed
  if (Array.isArray(data) && data.length > 0) {
    return data[0]
  }
  
  return data
}

/**
 * Get available models from Hugging Face
 * Note: Hugging Face doesn't have a single endpoint for all models
 * We'll fetch popular models or allow manual model ID entry
 */
export async function fetchHuggingFaceModels(apiKey: string) {
  // Hugging Face doesn't have a direct API to list all available models
  // We'll return a curated list of popular models that work with the Inference API
  // Users can also manually enter model IDs
  
  const popularModels = [
    {
      id: "meta-llama/Llama-2-7b-chat-hf",
      name: "Llama 2 7B Chat",
      description: "Meta's Llama 2 7B parameter chat model, optimized for dialogue use cases.",
      context_length: 4096,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "llama",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
    {
      id: "mistralai/Mistral-7B-Instruct-v0.2",
      name: "Mistral 7B Instruct",
      description: "Mistral AI's 7B parameter instruction-tuned model, designed for following instructions and completing tasks.",
      context_length: 8192,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "mistral",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
    {
      id: "google/flan-t5-large",
      name: "FLAN-T5 Large",
      description: "Google's FLAN-T5 large model, fine-tuned on instruction following tasks.",
      context_length: 512,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "t5",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
    {
      id: "microsoft/DialoGPT-large",
      name: "DialoGPT Large",
      description: "Microsoft's large conversational model trained on Reddit data.",
      context_length: 1024,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "gpt2",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
    {
      id: "HuggingFaceH4/zephyr-7b-beta",
      name: "Zephyr 7B Beta",
      description: "Hugging Face's Zephyr 7B model, fine-tuned for helpful, harmless, and honest responses.",
      context_length: 32768,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "mistral",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
    {
      id: "bigscience/bloom-7b1",
      name: "BLOOM 7B1",
      description: "BigScience's BLOOM 7B1 multilingual language model.",
      context_length: 2048,
      architecture: {
        modality: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        tokenizer: "bloom",
      },
      pricing: {
        prompt: "0",
        completion: "0",
      },
    },
  ]

  // Try to fetch from Hugging Face Model Hub API (if available)
  try {
    // Note: This is a placeholder - Hugging Face doesn't have a public API for listing all models
    // Users will need to provide model IDs manually or we use the curated list above
    return { data: popularModels }
  } catch (error) {
    // Fallback to curated list
    return { data: popularModels }
  }
}

/**
 * Search for Hugging Face models by query
 * This uses the Hugging Face Hub API (public, no auth required)
 */
export async function searchHuggingFaceModels(query: string, limit: number = 20) {
    try {
      const response = await fetch(
        `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&sort=downloads&direction=-1&limit=${limit}`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
  
      if (!response.ok) {
        throw new Error(`Hugging Face Hub API error: ${response.status}`)
      }
  
      const models = await response.json()
  
      // Filter models that are runnable on the hosted inference API

  
      
  
      // Transform to your app format
      return models.map((model: any) => ({
        id: model.id,
        name: model.id.split("/").pop() || model.id,
        description: model.pipeline_tag === "text-generation" 
          ? `Text generation model: ${model.id}`
          : model.pipeline_tag || "Hugging Face model",
        context_length: 4096, // Default, can be updated per model
        architecture: {
          modality: model.pipeline_tag === "image-to-text" ? "image" : "text",
          input_modalities: model.pipeline_tag === "image-to-text" ? ["image", "text"] : ["text"],
          output_modalities: ["text"],
          tokenizer: "auto",
          model_type: model.pipeline_tag,
        },
        pricing: {
          prompt: "0",
          completion: "0",
        },
      }))
    } catch (error: any) {
      console.error("Error searching Hugging Face models:", error)
      return []
    }
  }
