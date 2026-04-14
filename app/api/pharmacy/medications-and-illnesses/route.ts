import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const medicines = await prisma.centralMedicine.findMany({
      orderBy: { name: "asc" },
    })
    const illnessCategories = await prisma.illnessCategory.findMany({
      orderBy: { displayName: "asc" },
    })
    return NextResponse.json({ medicines, illnessCategories })
  } catch (error) {
    console.error("Failed to fetch medicines and illness categories:", error)
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
  }
} 