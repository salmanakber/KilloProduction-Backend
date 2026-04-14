import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, adminNotes } = body // action: "APPROVE" or "REJECT"

    if (!action || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json(
        { error: "Action must be either 'APPROVE' or 'REJECT'" },
        { status: 400 }
      )
    }

    // Get the medicine suggestion
    const suggestion = await prisma.medicineSuggestion.findUnique({
      where: { id: params.id },
    })

    if (!suggestion) {
      return NextResponse.json(
        { error: "Medicine suggestion not found" },
        { status: 404 }
      )
    }

    if (suggestion.status !== "PENDING") {
      return NextResponse.json(
        { error: "This suggestion has already been reviewed" },
        { status: 400 }
      )
    }

    // Update suggestion status
    const updatedSuggestion = await prisma.medicineSuggestion.update({
      where: { id: params.id },
      data: {
        status: action === "APPROVE" ? "APPROVED" : "REJECTED",
        adminNotes,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    })

    // If approved, create the medicine in CentralMedicine
    if (action === "APPROVE") {
      const newMedicine = await prisma.centralMedicine.create({
        data: {
          name: suggestion.name,
          genericName: suggestion.genericName,
          description: suggestion.description,
          purpose: suggestion.purpose,
          dosageInfo: suggestion.dosageInfo,
          warnings: suggestion.warnings,
          sideEffects: suggestion.sideEffects,
          category: suggestion.category,
          illnessTypes: suggestion.illnessTypes,
          activeIngredients: suggestion.activeIngredients,
          form: suggestion.form,
          strength: suggestion.strength,
          manufacturer: suggestion.manufacturer,
          images: suggestion.images,
          isActive: true,
        },
      })

      // Send notification to the suggester
      const { NotificationBridge } = await import("@/lib/notification-bridge")
      
      let suggesterUserId: string | null = null
      
      if (suggestion.suggestedByType === "WHOLESALER") {
        const wholesaler = await prisma.wholesaler.findUnique({
          where: { id: suggestion.suggestedBy },
          select: { userId: true },
        })
        suggesterUserId = wholesaler?.userId || null
      } else if (suggestion.suggestedByType === "PHARMACY") {
        const pharmacy = await prisma.pharmacy.findUnique({
          where: { id: suggestion.suggestedBy },
          select: { userId: true },
        })
        suggesterUserId = pharmacy?.userId || null
      }

      if (suggesterUserId) {
        await NotificationBridge.sendNotification({
          userId: suggesterUserId,
          title: "Medicine Suggestion Approved",
          message: `Your medicine suggestion "${suggestion.name}" has been approved and added to our database.`,
          type: "SYSTEM",
          module: suggestion.suggestedByType === "WHOLESALER" ? "WHOLESALER" : "PHARMACY",
          data: {
            suggestionId: suggestion.id,
            medicineId: newMedicine.id,
            medicineName: suggestion.name,
            action: "APPROVED",
          },
          actionUrl: suggestion.suggestedByType === "WHOLESALER" 
            ? `/wholesaler/medicines` 
            : `/pharmacy/medicines`,
        })
      }
    } else {
      // If rejected, send notification to the suggester
      const { NotificationBridge } = await import("@/lib/notification-bridge")
      
      let suggesterUserId: string | null = null
      
      if (suggestion.suggestedByType === "WHOLESALER") {
        const wholesaler = await prisma.wholesaler.findUnique({
          where: { id: suggestion.suggestedBy },
          select: { userId: true },
        })
        suggesterUserId = wholesaler?.userId || null
      } else if (suggestion.suggestedByType === "PHARMACY") {
        const pharmacy = await prisma.pharmacy.findUnique({
          where: { id: suggestion.suggestedBy },
          select: { userId: true },
        })
        suggesterUserId = pharmacy?.userId || null
      }

      if (suggesterUserId) {
        await NotificationBridge.sendNotification({
          userId: suggesterUserId,
          title: "Medicine Suggestion Rejected",
          message: `Your medicine suggestion "${suggestion.name}" has been rejected. ${adminNotes ? `Reason: ${adminNotes}` : ""}`,
          type: "SYSTEM",
          module: suggestion.suggestedByType === "WHOLESALER" ? "WHOLESALER" : "PHARMACY",
          data: {
            suggestionId: suggestion.id,
            medicineName: suggestion.name,
            action: "REJECTED",
            adminNotes,
          },
          actionUrl: suggestion.suggestedByType === "WHOLESALER" 
            ? `/wholesaler/medicine-suggestions` 
            : `/pharmacy/medicine-suggestions`,
        })
      }
    }

    return NextResponse.json({
      message: `Medicine suggestion ${action.toLowerCase()}d successfully`,
      suggestion: {
        id: updatedSuggestion.id,
        name: updatedSuggestion.name,
        status: updatedSuggestion.status,
        adminNotes: updatedSuggestion.adminNotes,
        reviewedAt: updatedSuggestion.reviewedAt,
      },
    })
  } catch (error) {
    console.error("Medicine suggestion review error:", error)
    return NextResponse.json(
      { error: "Failed to review medicine suggestion" },
      { status: 500 }
    )
  }
}

