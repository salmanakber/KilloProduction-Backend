import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { fetchOpenRouterModels } from "@/lib/ai/openrouter"

// GET - List all AI models
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const models = await prisma.aIModel.findMany({
      orderBy: [
        { category: "asc" },
        { priority: "asc" },
        { createdAt: "desc" },
      ],
      include: {
        _count: {
          select: {
            usageLogs: true,
          },
        },
      },
    })

    return NextResponse.json({ models })
  } catch (error: any) {
    console.error("Error fetching AI models:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create or update AI model
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      id, // If provided, update existing
      name,
      modelId,
      provider,
      description,
      category,
      apiKey,
      contextLength,
      modality,
      inputModalities,
      outputModalities,
      pricing,
      priority,
      maxTokens,
      temperature,
      topP,
      hourlyQuotaLimit,
      dailyQuotaLimit,
    } = body

    if (!name || !modelId || !category || !apiKey) {
      return NextResponse.json(
        { error: "Missing required fields: name, modelId, category, apiKey" },
        { status: 400 }
      )
    }

    if (category !== "TEXT_TO_TEXT" && category !== "IMAGE_TO_TEXT") {
      return NextResponse.json({ error: "Invalid category. Must be TEXT_TO_TEXT or IMAGE_TO_TEXT" }, { status: 400 })
    }

    const modelData = {
      name,
      modelId,
      provider: provider || modelId.split("/")[0],
      description,
      category,
      apiKey,
      contextLength,
      modality,
      inputModalities: inputModalities ? JSON.parse(JSON.stringify(inputModalities)) : null,
      outputModalities: outputModalities ? JSON.parse(JSON.stringify(outputModalities)) : null,
      pricing: pricing ? JSON.parse(JSON.stringify(pricing)) : null,
      priority: priority ?? 0,
      maxTokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      topP: topP ?? 1.0,
      hourlyQuotaLimit,
      dailyQuotaLimit,
      status: "ONLINE" as const,
      lastHealthCheck: new Date(),
    }

    let model
    if (id) {
      // Update existing
      model = await prisma.aIModel.update({
        where: { id },
        data: modelData,
      })
    } else {
      // Create new
      model = await prisma.aIModel.create({
        data: modelData,
      })
    }

    return NextResponse.json({ model, message: id ? "Model updated" : "Model created" })
  } catch (error: any) {
    console.error("Error creating/updating AI model:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete AI model
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Model ID is required" }, { status: 400 })
    }

    await prisma.aIModel.delete({
      where: { id },
    })

    return NextResponse.json({ message: "Model deleted" })
  } catch (error: any) {
    console.error("Error deleting AI model:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
