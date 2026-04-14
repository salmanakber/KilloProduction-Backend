import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"
import { prisma } from "@/lib/prisma"
import { analyzeWithAI, type AIUseCase } from "@/lib/ai/queue"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("image") || formData.get("file")
    const module = (formData.get("module") as string) || "GROCERY"

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "image file required" }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const mime = file.type || "image/jpeg"
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`

    const folder =
      module === "AUTO_PARTS" ? "vendor-products/auto-parts" : module === "FOOD" ? "vendor-products/food" : "vendor-products/grocery"

    const uploaded = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: "image",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    })
    const imageUrl = uploaded.secure_url

    let categoryList: { id: string; name: string }[] = []
    if (module === "AUTO_PARTS") {
      const cats = await prisma.category.findMany({
        where: { module: "AUTO_PARTS", isActive: true, parentId: null },
        select: { id: true, name: true },
        take: 80,
        orderBy: { sortOrder: "asc" },
      })
      categoryList = cats
    } else if (module === "FOOD") {
      const rest = await prisma.restaurant.findUnique({
        where: { userId: user.id },
        include: { menuCategories: { where: { isActive: true }, select: { id: true, name: true } } },
      })
      categoryList = (rest?.menuCategories || []).map((c) => ({ id: c.id, name: c.name }))
    } else {
      const store = await prisma.groceryStore.findUnique({ where: { userId: user.id }, select: { productCategories: true } })
      const pc = store?.productCategories
      if (Array.isArray(pc)) {
        categoryList = (pc as any[]).map((c: any, i: number) => ({
          id: String(c.id || c.templateId || i),
          name: String(c.name || c.title || "Category"),
        }))
      }
    }

    const catLines = categoryList.map((c) => `- "${c.name}" (id: ${c.id})`).join("\n")

    const customPrompt = `You are helping a marketplace vendor list a product from a photo.

Known categories for this vendor module (${module}):
${catLines || "(no categories — suggest a short category label)"}

Return JSON only:
{
  "title": "short product title",
  "description": "2-4 sentences, customer-facing, no markdown",
  "suggestedCategoryId": "id from list or empty string if unknown",
  "suggestedCategoryName": "best matching category name"
}`

    const ai = await analyzeWithAI("GENERAL_ANALYSIS" as AIUseCase, { module }, {
      category: "IMAGE_TO_TEXT",
      imageUrl,
      customPrompt,
      maxTokens: 1200,
      disableTools: true,
    })

    let parsed: {
      title?: string
      description?: string
      suggestedCategoryId?: string
      suggestedCategoryName?: string
    } = {}
    try {
      let cleaned = (ai.content || "").trim().replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
      const first = cleaned.indexOf("{")
      const last = cleaned.lastIndexOf("}")
      if (first !== -1 && last !== -1) cleaned = cleaned.substring(first, last + 1)
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { title: "", description: ai.content || "", suggestedCategoryName: "" }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      title: parsed.title || "",
      description: parsed.description || "",
      suggestedCategoryId: parsed.suggestedCategoryId || "",
      suggestedCategoryName: parsed.suggestedCategoryName || "",
      categories: categoryList,
    })
  } catch (e: any) {
    console.error("vendor product-from-image:", e)
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 })
  }
}
