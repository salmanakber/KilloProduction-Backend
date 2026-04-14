import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(request.url)
    const typeFilter = (searchParams.get('type') || 'ALL').toUpperCase() // ALL | ILLNESS | CATEGORY
    const search = (searchParams.get('search') || '').trim().toLowerCase()

    // Fetch all active illness categories
    const illnessCategories = await prisma.illnessCategory.findMany({
      where: {
        isActive: true
      },
      orderBy: {
        isCommon: 'desc' // Show common categories first
      }
    })

    // Fetch active PHARMACY categories from generic Category model
    const pharmacyCategories = await prisma.category.findMany({
      where: {
        isActive: true,
        module: 'PHARMACY',
      },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        description: true,
        icon: true,
      },
    })

    

    // Fetch all central medicines with their illness types
    const centralMedicines = await prisma.centralMedicine.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        illnessTypes: true,
        pharmacyMedicines: {
          select: {
            id: true
          }
        }
      }
    })

    // Build a map of illness category name to medicine IDs
    const categoryToMedicineIds: { [key: string]: Set<string> } = {}
    
    illnessCategories.forEach(category => {
      categoryToMedicineIds[category.name] = new Set()
    })

    // For each central medicine, check if its illnessTypes contains any of our categories
    centralMedicines.forEach(medicine => {
      if (medicine.illnessTypes && Array.isArray(medicine.illnessTypes)) {
        const illnessTypesArray = medicine.illnessTypes as string[]
        
        // Get pharmacy medicine IDs for this central medicine
        const pharmacyMedicineIds = medicine.pharmacyMedicines.map(pm => pm.id)
        
        illnessCategories.forEach(category => {
          // Check if this category's name appears in the medicine's illnessTypes
          const found = illnessTypesArray.some(illnessType => 
            illnessType.toLowerCase().includes(category.name.toLowerCase()) ||
            category.name.toLowerCase().includes(illnessType.toLowerCase())
          )
          
          if (found) {
            pharmacyMedicineIds.forEach(id => {
              categoryToMedicineIds[category.name].add(id)
            })
          }
        })
      }
    })

    // Now calculate sales for each category
    const categoriesWithSales = await Promise.all(
      illnessCategories.map(async (category) => {
        const medicineIds = Array.from(categoryToMedicineIds[category.name])
        
        let totalSales = 0
        
        if (medicineIds.length > 0) {
          // Calculate total sales for medicines in this category
          const salesData = await prisma.orderItem.aggregate({
            where: {
              productId: {
                in: medicineIds
              },
              order: {
                status: {
                  in: ['DELIVERED', 'CONFIRMED']
                }
              }
            },
            _sum: {
              quantity: true
            }
          })
          
          totalSales = salesData._sum.quantity || 0
        }

        return {
          id: category.id,
          name: category.displayName,
          categoryName: category.name,
          icon: category.icon || '💊',
          color: '#10B981', // Default color
          gradient: ['#10B981', '#059669'],
          isCommon: category.isCommon,
          totalSales,
          medicineCount: medicineIds.length
        }
      })
    )

    // Sort by sales (top-selling first), then by common flag
    const sortedIllnessCategories = categoriesWithSales.sort((a, b) => {
      if (b.totalSales !== a.totalSales) {
        return b.totalSales - a.totalSales
      }
      return b.isCommon === a.isCommon ? 0 : b.isCommon ? 1 : -1
    })

    const illnessItems = sortedIllnessCategories.map((c) => ({
      ...c,
      description: null as string | null,
      sourceType: 'ILLNESS',
      sourceLabel: 'Illness',
    }))

    const categoryItems = pharmacyCategories.map((c) => ({
      id: c.id,
      name: c.name,
      categoryName: c.name,
      icon: c.icon || '🧴',
      color: '#0EA5E9',
      gradient: ['#38BDF8', '#0284C7'],
      isCommon: false,
      totalSales: 0,
      medicineCount: 0,
      description: c.description || null,
      sourceType: 'CATEGORY',
      sourceLabel: 'Category',
    }))

    let combined = [...illnessItems, ...categoryItems]

    if (typeFilter === 'ILLNESS') {
      combined = combined.filter((c) => c.sourceType === 'ILLNESS')
    } else if (typeFilter === 'CATEGORY') {
      combined = combined.filter((c) => c.sourceType === 'CATEGORY')
    }

    if (search) {
      combined = combined.filter((c) =>
        String(c.name || '').toLowerCase().includes(search) ||
        String(c.categoryName || '').toLowerCase().includes(search) ||
        String(c.description || '').toLowerCase().includes(search)
      )
    }

    return NextResponse.json({ 
      categories: combined,
      total: combined.length
    })
  } catch (error) {
    console.error('Error fetching health categories:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

