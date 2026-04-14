import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { vehicleAINLP, vehicleAIPartMatching, vehicleAISpeechToText, vehicleAIOCR, analyzeVehicleImage, vehicleAIDiagnosis } from "@/lib/virtual-doctor/vehicle-ai"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const inputType = formData.get('inputType') as string // 'text', 'voice', 'image'
    
    // Get car information
    const vehicleMake = formData.get('vehicleMake') as string | null
    const vehicleModel = formData.get('vehicleModel') as string | null
    const vehicleYear = formData.get('vehicleYear') as string | null
    const vehicleVariant = formData.get('vehicleVariant') as string | null
    const mileage = formData.get('mileage') as string | null
    const recentMaintenance = formData.get('recentMaintenance') as string | null
    const warningLightsStr = formData.get('warningLights') as string | null
    const warningLights = warningLightsStr ? warningLightsStr.split(',').map(w => w.trim()) : []

    const customerCity = (formData.get('customerCity') as string | null)?.trim() || null
    const customerLatStr = formData.get('customerLatitude') as string | null
    const customerLngStr = formData.get('customerLongitude') as string | null
    const customerLatitude = customerLatStr ? parseFloat(customerLatStr) : null
    const customerLongitude = customerLngStr ? parseFloat(customerLngStr) : null

    // Validate required car information
    if (!vehicleMake || !vehicleModel) {
      return NextResponse.json({ error: "Vehicle make and model are required" }, { status: 400 })
    }

    // Get text/voice input
    const text = formData.get('text') as string | null
    const audioFile = formData.get('audio') as File | null

    // Up to two diagnostic images (primary + optional secondary); legacy multi-angle still accepted but capped at 2 analyses
    const vehicleImages: Record<string, Buffer> = {}
    const primary = formData.get('image_primary') as File | null
    const secondary = formData.get('image_secondary') as File | null
    if (primary) vehicleImages.primary = Buffer.from(await primary.arrayBuffer())
    if (secondary) vehicleImages.secondary = Buffer.from(await secondary.arrayBuffer())

    const legacyTypes = ['front', 'back', 'left', 'right', 'interior', 'engine_bay', 'dashboard', 'tyres']
    if (Object.keys(vehicleImages).length === 0) {
      for (const imgType of legacyTypes) {
        const imageFile = formData.get(`image_${imgType}`) as File | null
        if (imageFile) {
          vehicleImages[imgType] = Buffer.from(await imageFile.arrayBuffer())
          if (Object.keys(vehicleImages).length >= 2) break
        }
      }
    }

    // Legacy single image support
    const legacyImageFile = formData.get('image') as File | null
    let processedText = ''

    // Process input based on type
    if (inputType === 'text' && text) {
      processedText = text
    } else if (inputType === 'voice' && audioFile) {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
      const transcription = await vehicleAISpeechToText(audioBuffer)
      processedText = transcription.text
    } else if (legacyImageFile) {
      // Legacy single image
      const imageBuffer = Buffer.from(await legacyImageFile.arrayBuffer())
      const imageType = (formData.get('imageType') as string) || 'general'
      const analysis = await analyzeVehicleImage(imageBuffer, imageType as any)
      processedText = analysis.text
    }

    // Process vehicle images (max 2 analyses for latency / UX)
    if (Object.keys(vehicleImages).length > 0) {
      const imageDescriptions: string[] = []
      const entries = Object.entries(vehicleImages).slice(0, 2)
      for (const [imgType, imageBuffer] of entries) {
        const imageTypeMap: Record<string, any> = {
          primary: 'damage_photo',
          secondary: 'part_photo',
          front: 'vehicle_photo',
          back: 'vehicle_photo',
          left: 'vehicle_photo',
          right: 'vehicle_photo',
          interior: 'vehicle_photo',
          engine_bay: 'vehicle_photo',
          dashboard: 'vehicle_photo',
          tyres: 'damage_photo',
        }
        const analysis = await analyzeVehicleImage(imageBuffer, imageTypeMap[imgType] || 'general')
        imageDescriptions.push(`${imgType.replace('_', ' ')}: ${analysis.text}`)
      }
      if (imageDescriptions.length > 0) {
        processedText = (processedText ? processedText + '\n\n' : '') + 'Vehicle Images:\n' + imageDescriptions.join('\n')
      }
    }

    if (!processedText || processedText.trim().length === 0) {
      return NextResponse.json({ error: "Please provide text description, voice recording, or images" }, { status: 400 })
    }

    // Perform NLP analysis (AI will use structured data, but NLP helps extract additional symptoms)
    const nlpResult = await vehicleAINLP(processedText)

    // Perform advanced diagnosis with structured car information
    const advancedDiagnosis = await vehicleAIDiagnosis(
      {
        make: vehicleMake || nlpResult.vehicleInfo?.brand,
        model: vehicleModel || nlpResult.vehicleInfo?.model,
        year: vehicleYear || nlpResult.vehicleInfo?.year,
        variant: vehicleVariant || undefined,
      },
      nlpResult.symptoms,
      nlpResult.partTypes,
      nlpResult.partNames,
      Object.keys(vehicleImages).length > 0 ? Object.keys(vehicleImages) : undefined,
      mileage ? parseInt(mileage) : undefined,
      recentMaintenance || undefined,
      warningLights.length > 0 ? warningLights : undefined
    )

    const basePartWhere: any = {
      type: 'AUTO_PART',
      isActive: true,
      stockQuantity: { gt: 0 },
    }
    if (customerCity) {
      basePartWhere.vendor = {
        vendorProfile: {
          is: {
            city: { contains: customerCity, mode: 'insensitive' },
          },
        },
      }
    }

    // Get available parts from database (using Product model), location-aware when city provided
    let availableParts = await prisma.product.findMany({
      where: basePartWhere,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
              }
            }
          }
        },
        category: {
          select: {
            name: true,
          }
        }
      },
      take: 120,
    })

    if (availableParts.length < 8 && customerCity) {
      availableParts = await prisma.product.findMany({
        where: { type: 'AUTO_PART', isActive: true, stockQuantity: { gt: 0 } },
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              vendorProfile: {
                select: {
                  businessName: true,
                  logo: true,
                  city: true,
                  state: true,
                  latitude: true,
                  longitude: true,
                }
              }
            }
          },
          category: { select: { name: true } },
        },
        take: 120,
      })
    }

    // Optional distance trim when coordinates known
    if (
      customerLatitude != null &&
      customerLongitude != null &&
      !Number.isNaN(customerLatitude) &&
      !Number.isNaN(customerLongitude)
    ) {
      const R = 6371
      const dist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const dLat = ((lat2 - lat1) * Math.PI) / 180
        const dLon = ((lon2 - lon1) * Math.PI) / 180
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2)
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
      }
      const withDist = availableParts
        .map((p) => {
          const lat = p.vendor.vendorProfile?.latitude
          const lon = p.vendor.vendorProfile?.longitude
          if (lat == null || lon == null) return { p, d: 999 }
          return { p, d: dist(customerLatitude, customerLongitude, lat, lon) }
        })
        .filter((x) => x.d <= 200)
        .sort((a, b) => a.d - b.d)
        .map((x) => x.p)
      if (withDist.length >= 5) availableParts = withDist.slice(0, 120)
    }

    // Format parts for AI matching (convert Product to expected format)
    const formattedPartsForAI = availableParts.map(part => ({
      id: part.id,
      name: part.name,
      partNumber: part.sku || '',
      description: part.description || '',
      brand: part.brand || '',
      model: '',
      year: '',
      category: part.category?.name || '',
      partType: '',
      price: part.price,
    }))

    // Match parts using AI
    const matchedParts = await vehicleAIPartMatching(
      processedText,
      nlpResult.symptoms,
      nlpResult.partTypes,
      nlpResult.partNames,
      formattedPartsForAI
    )

    // Get full part details for matched parts
    const matchedPartIds = matchedParts.map(m => m.partId)
    const fullMatchedParts = await prisma.product.findMany({
      where: {
        id: { in: matchedPartIds },
        type: 'AUTO_PART',
        isActive: true,
        stockQuantity: { gt: 0 }
      },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            vendorProfile: {
              select: {
                businessName: true,
                logo: true,
                city: true,
                state: true,
                address: true,
              }
            }
          }
        },
        category: {
          select: {
            name: true,
          }
        },
        reviews: {
          select: {
            rating: true,
          }
        }
      }
    })

    // Combine AI matching data with full part details
    const results = fullMatchedParts.map(part => {
      const matchData = matchedParts.find(m => m.partId === part.id)
      const avgRating = part.reviews.length > 0
        ? part.reviews.reduce((sum, r) => sum + r.rating, 0) / part.reviews.length
        : 4.5

      const vendorProfile = part.vendor.vendorProfile

      return {
        id: part.id,
        name: part.name,
        description: part.description,
        partNumber: part.sku,
        brand: part.brand || '',
        model: '',
        year: '',
        partType: '',
        category: part.category?.name || '',
        condition: '',
        price: part.price,
        compareAtPrice: part.comparePrice,
        stock: part.stockQuantity,
        images: part.images,
        warranty: '',
        rating: avgRating,
        reviews: part.reviews.length,
        store: {
          id: part.vendor.id,
          name: vendorProfile?.businessName || part.vendor.name || '',
          logo: vendorProfile?.logo || null,
          rating: 4.5,
          isVerified: false, // Will be populated from vendor profile if needed
          address: vendorProfile?.address || '',
        },
        aiMatch: {
          confidence: matchData?.confidence || 0,
          reason: matchData?.matchReason || '',
          explanation: matchData?.aiExplanation || '',
        }
      }
    })

    // Sort by AI confidence
    results.sort((a, b) => b.aiMatch.confidence - a.aiMatch.confidence)

    // Generate helpful instructions based on results
    let instructions = ''
    let issueSummary = ''
    
    if (results.length > 0) {
      const topMatch = results[0]
      instructions = `✅ Killo Assist found ${results.length} matching part${results.length > 1 ? 's' : ''} for your vehicle issue. `
      
      if (topMatch.aiMatch.confidence > 0.7) {
        instructions += `The top match "${topMatch.name}" has a ${Math.round(topMatch.aiMatch.confidence * 100)}% confidence match. `
        instructions += `This part is ${topMatch.stock > 0 ? 'available in stock' : 'currently out of stock'}. `
        instructions += `Consider comparing prices and reviews from different sellers before making a purchase.`
      } else if (topMatch.aiMatch.confidence > 0.4) {
        instructions += `The matches have moderate confidence. Please review the part details carefully and verify compatibility with your ${nlpResult.vehicleInfo?.brand || ''} ${nlpResult.vehicleInfo?.model || ''}. `
        instructions += `If unsure, consult with a professional mechanic or contact the seller for more information.`
      } else {
        instructions += `The matches have lower confidence. Please double-check part compatibility and consider posting a part request to get quotes from multiple sellers.`
      }
    } else {
      // Generate brief issue summary (2-3 lines)
      if (nlpResult.vehicleInfo?.brand && nlpResult.vehicleInfo?.model) {
        issueSummary += `Your ${nlpResult.vehicleInfo.brand} ${nlpResult.vehicleInfo.model}${nlpResult.vehicleInfo.year ? ` (${nlpResult.vehicleInfo.year})` : ''} `
      } else {
        issueSummary += `Your vehicle `
      }
      
      if (nlpResult.symptoms && nlpResult.symptoms.length > 0) {
        const mainSymptom = nlpResult.symptoms[0]
        issueSummary += `is experiencing ${mainSymptom}`
        if (nlpResult.symptoms.length > 1) {
          issueSummary += ` and other related issues`
        }
        issueSummary += `. `
      }
      
      if (nlpResult.partNames && nlpResult.partNames.length > 0) {
        issueSummary += `You're looking for ${nlpResult.partNames.slice(0, 2).join(' and ')}${nlpResult.partNames.length > 2 ? ' and related parts' : ''}.`
      } else if (nlpResult.partTypes && nlpResult.partTypes.length > 0) {
        issueSummary += `This likely requires ${nlpResult.partTypes.slice(0, 2).join(' or ')} related parts.`
      } else {
        issueSummary += `We couldn't identify specific parts needed from your description.`
      }
      
      instructions = `⚠️ Killo Assist couldn't find exact matches for your request. `
      if (nlpResult.partNames && nlpResult.partNames.length > 0) {
        instructions += `Based on your description, you're looking for: ${nlpResult.partNames.join(', ')}. `
      }
      instructions += `Here's what you can do:\n\n`
      instructions += `1. **Post a Part Request**: Create a detailed request with your vehicle make, model, year, and the part you need. Sellers will send you quotes.\n\n`
      instructions += `2. **Contact a Mechanic**: For complex issues, consult with a professional mechanic who can diagnose the exact part needed.\n\n`
      instructions += `3. **Search Manually**: Try searching with different keywords or browse categories to find similar parts.\n\n`
      instructions += `4. **Check Vehicle Manual**: Your vehicle's manual may have part numbers that can help with a more specific search.`
    }

    return NextResponse.json({
      input: processedText,
      analysis: {
        vehicleInfo: nlpResult.vehicleInfo,
        symptoms: nlpResult.symptoms,
        partTypes: nlpResult.partTypes,
        partNames: nlpResult.partNames,
        confidence: nlpResult.confidence,
        source: nlpResult.source,
      },
      advancedDiagnosis: advancedDiagnosis,
      recommendedParts: results,
      totalMatches: results.length,
      instructions: instructions,
      issueSummary: issueSummary || undefined,
      // Include recommended mechanic types for frontend to use
      recommendedMechanicTypes: advancedDiagnosis.recommended_mechanics || [],
    })
  } catch (error) {
    console.error("Vehicle check error:", error)
    return NextResponse.json({ error: "Failed to process vehicle check" }, { status: 500 })
  }
}

