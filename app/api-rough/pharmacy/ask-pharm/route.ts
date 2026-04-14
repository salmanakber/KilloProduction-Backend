import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const data = await request.json()
    const { queryText, queryVoiceUrl, queryImages, selectedIllness, symptoms } = data

    // Generate consultation number
    const consultationNumber = `ASK${Date.now()}${Math.floor(Math.random() * 1000)}`

    // Create consultation
    const consultation = await prisma.pharmConsultation.create({
      data: {
        consultationNumber,
        consumerId: user.id,
        queryText,
        queryVoiceUrl,
        queryImages: queryImages || [],
        selectedIllness,
        symptoms: symptoms || [],
        status: "PENDING",
      },
    })

    // Find best matching pharmacy using intelligent algorithm
    const matchedPharmacy = await findBestMatchingPharmacy({
      illness: selectedIllness,
      symptoms,
      queryText,
      userLocation: data.userLocation, // lat, lng from request
    })

    if (matchedPharmacy) {
      // Assign consultation to pharmacy
      await prisma.pharmConsultation.update({
        where: { id: consultation.id },
        data: {
          pharmacyId: matchedPharmacy.id,
          status: "ASSIGNED",
          assignedAt: new Date(),
          matchScore: matchedPharmacy.matchScore,
        },
      })

      // Create initial system message
      await prisma.consultationMessage.create({
        data: {
          consultationId: consultation.id,
          senderId: "system",
          senderType: "SYSTEM",
          content: `Your consultation has been assigned to ${matchedPharmacy.pharmacyName}. A pharmacist will respond shortly.`,
          messageType: "TEXT",
        },
      })

      // Send notification to pharmacy
      await prisma.notification.create({
        data: {
          userId: matchedPharmacy.userId,
          title: "New Consultation Request",
          message: `New Ask Pharm consultation for ${selectedIllness || "general inquiry"}`,
          type: "CHAT_MESSAGE",
          module: "PHARMACY",
          data: { consultationId: consultation.id },
        },
      })
    } else {
      // No pharmacy found, escalate to Super Pharm
      await prisma.consultationMessage.create({
        data: {
          consultationId: consultation.id,
          senderId: "super-pharm",
          senderType: "SUPER_PHARM",
          content:
            "Hello! I'm Super Pharm, your AI assistant. I'll help you find the right medication and connect you with a suitable pharmacy.",
          messageType: "TEXT",
        },
      })
    }

    return NextResponse.json(
      {
        consultation: {
          id: consultation.id,
          consultationNumber: consultation.consultationNumber,
          status: consultation.status,
          assignedPharmacy: matchedPharmacy,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Ask Pharm consultation error:", error)
    return NextResponse.json({ error: "Failed to create consultation" }, { status: 500 })
  }
}

// Intelligent pharmacy matching algorithm
async function findBestMatchingPharmacy({ illness, symptoms, queryText, userLocation }) {
  try {
    // Get all active pharmacies with their specializations
    const pharmacies = await prisma.pharmacy.findMany({
      where: {
        isActive: true,
        isApprovedByAdmin: true,
        isVerified: true,
      },
      include: {
        specializations: true,
        pharmacyMedicines: {
          where: { isAvailable: true },
          include: {
            centralMedicine: {
              select: {
                illnessTypes: true,
                name: true,
              },
            },
          },
        },
        user: {
          select: {
            name: true,
            isActive: true,
          },
        },
      },
    })

    if (pharmacies.length === 0) return null

    // Score each pharmacy
    const scoredPharmacies = pharmacies.map((pharmacy) => {
      let score = 0

      // Base score for active and verified pharmacy
      if (pharmacy.isVerified) score += 20
      if (pharmacy.isApprovedByAdmin) score += 15

      // Specialization bonus
      if (illness) {
        const hasSpecialization = pharmacy.specializations.some((spec) => spec.illnessTypes.includes(illness))
        if (hasSpecialization) score += 30
      }

      // Medicine availability bonus
      if (illness) {
        const relevantMedicines = pharmacy.pharmacyMedicines.filter((pm) =>
          pm.centralMedicine.illnessTypes.includes(illness),
        )
        score += relevantMedicines.length * 5
      }

      // Rating bonus
      score += pharmacy.rating * 2

      // Response time bonus (lower is better)
      score += Math.max(0, 50 - pharmacy.responseTime)

      // Inventory health bonus
      const totalMedicines = pharmacy.pharmacyMedicines.length
      if (totalMedicines > 50) score += 10
      else if (totalMedicines > 20) score += 5

      // Availability bonus
      if (pharmacy.deliveryAvailable) score += 10

      return {
        ...pharmacy,
        matchScore: score,
      }
    })

    // Sort by score and return best match
    scoredPharmacies.sort((a, b) => b.matchScore - a.matchScore)

    return scoredPharmacies[0] || null
  } catch (error) {
    console.error("Pharmacy matching error:", error)
    return null
  }
}
