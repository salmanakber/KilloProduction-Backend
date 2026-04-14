import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - List all AI configurations
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const useCase = searchParams.get("useCase")
    const includeInactive = searchParams.get("includeInactive") === "true"

    const where: any = {}
    if (useCase) {
      where.useCase = useCase
    }

    // Only return active configurations by default (one per use case)
    // If you want to see all including inactive, add ?includeInactive=true
    
    if (!includeInactive) {
      where.isActive = true
    }

    const configurations = await prisma.aIConfiguration.findMany({
      where,
      include: {
        model: true,
      },
      orderBy: [
        { useCase: "asc" },
        { version: "desc" },
      ],
    })
    
    // If not including inactive, group by useCase and only return the latest version
    if (!includeInactive) {
      const configMap = new Map()
      configurations.forEach((config: any) => {
        const existing = configMap.get(config.useCase)
        if (!existing || config.version > existing.version) {
          configMap.set(config.useCase, config)
        }
      })
      return NextResponse.json({ configurations: Array.from(configMap.values()) })
    }

    return NextResponse.json({ configurations })
  } catch (error: any) {
    console.error("Error fetching AI configurations:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create or update AI configuration
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
      description,
      useCase,
      modelId,
      systemPrompt,
      enabledTools,
      customFunctions,
      temperature,
      maxTokens,
      topP,
      isActive,
    } = body

    if (!name || !useCase) {
      return NextResponse.json({ error: "Missing required fields: name, useCase" }, { status: 400 })
    }

    const configData: any = {
      name,
      description,
      useCase,
      modelId: modelId || null,
      systemPrompt: systemPrompt || "",
      enabledTools: enabledTools ? JSON.parse(JSON.stringify(enabledTools)) : null,
      customFunctions: customFunctions ? JSON.parse(JSON.stringify(customFunctions)) : null,
      temperature: temperature ?? 0.7,
      maxTokens: maxTokens ?? 4096,
      topP: topP ?? 1.0,
      isActive: isActive !== undefined ? isActive : true,
    }

    let configuration
    
    if (id) {
      // Update existing by ID - increment version
      const existing = await prisma.aIConfiguration.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: "Configuration not found" }, { status: 404 })
      }
      configData.version = existing.version + 1

      configuration = await prisma.aIConfiguration.update({
        where: { id },
        data: configData,
        include: {
          model: true,
        },
      })
    } else {
      // Check if an active configuration already exists for this use case
      const existingConfig = await prisma.aIConfiguration.findFirst({
        where: {
          useCase,
          isActive: true,
        },
        orderBy: {
          version: "desc",
        },
      })

      if (existingConfig) {
        // Update existing active configuration instead of creating duplicate
        // Increment version to track changes
        configData.version = existingConfig.version + 1
        
        // Deactivate old versions (optional - keeps history)
        // Uncomment if you want to keep only one active version
        // await prisma.aIConfiguration.updateMany({
        //   where: {
        //     useCase,
        //     isActive: true,
        //     id: { not: existingConfig.id },
        //   },
        //   data: { isActive: false },
        // })

        configuration = await prisma.aIConfiguration.update({
          where: { id: existingConfig.id },
          data: configData,
          include: {
            model: true,
          },
        })
      } else {
        // Create new if no active configuration exists for this use case
        configuration = await prisma.aIConfiguration.create({
          data: configData,
          include: {
            model: true,
          },
        })
      }
    }

    return NextResponse.json({ configuration, message: id ? "Configuration updated" : "Configuration created" })
  } catch (error: any) {
    console.error("Error creating/updating AI configuration:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete AI configuration
export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Configuration ID is required" }, { status: 400 })
    }

    await prisma.aIConfiguration.delete({
      where: { id },
    })

    return NextResponse.json({ message: "Configuration deleted" })
  } catch (error: any) {
    console.error("Error deleting AI configuration:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
