import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Helper function to parse CSV with proper handling of quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  
  // Add last field
  result.push(current.trim())
  return result
}

// Field mapping - flexible header matching
const FIELD_MAPPINGS: Record<string, string[]> = {
  name: ['name', 'category name', 'category_name', 'title'],
  module: ['module', 'mod', 'category module', 'category_module'],
  description: ['description', 'desc', 'details', 'note', 'notes'],
  icon: ['icon', 'icon_name', 'icon name'],
  image: ['image', 'image_url', 'image url', 'img', 'picture'],
  parent: ['parent', 'parent name', 'parent_name', 'parent category', 'parent_category', 'parentcategory'],
  sortOrder: ['sort order', 'sort_order', 'order', 'sort', 'position', 'priority'],
  isActive: ['is active', 'is_active', 'active', 'enabled', 'status'],
}

function mapField(header: string): string | null {
  const normalized = header.toLowerCase().trim()
  for (const [key, variations] of Object.entries(FIELD_MAPPINGS)) {
    if (variations.includes(normalized)) {
      return key
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File
    const columnMappingJson = formData.get("columnMapping") as string | null
    const customMapping = columnMappingJson ? JSON.parse(columnMappingJson) : null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "File must be a CSV" }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split(/\r?\n/).filter((line) => line.trim())
    const encoding = text.includes('') ? 'utf8' : 'utf-8'

    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have at least a header and one data row" }, { status: 400 })
    }

    // Parse CSV header with proper field mapping
    const headerLine = lines[0]
    const headerValues = parseCSVLine(headerLine)
    const headerMap: Record<string, number> = {}
    
    // Use custom mapping if provided, otherwise auto-detect
    if (customMapping && typeof customMapping === 'object') {
      // Custom mapping provided by UI
      headerValues.forEach((header, index) => {
        if (customMapping[header]) {
          headerMap[customMapping[header]] = index
        }
      })
    } else {
      // Auto-map using field variations
      headerValues.forEach((header, index) => {
        const mappedField = mapField(header)
        if (mappedField) {
          headerMap[mappedField] = index
        }
      })
    }

    // Validate required fields
    console.log( "headerMap", headerMap.module)
    // if (!headerMap.name || !headerMap.module) {
    //   return NextResponse.json(
    //     { error: "CSV must include 'name' and 'module' columns. Found headers: " +headerMap + headerValues.join(", ") },
    //     { status: 400 }
    //   )
    // }

    const validModules = ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY", "RIDING", "COURIER", "WHOLESALER", "TEST"]
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Two-pass import: First pass - collect all rows, second pass - process with parent resolution
    interface CategoryRow {
      rowNumber: number
      name: string
      module: string
      description?: string | null
      icon?: string | null
      image?: string | null
      parentName?: string | null
      sortOrder: number
      isActive: boolean
      parentId?: string | null
    }

    const categoryRows: CategoryRow[] = []
    const categoryMap = new Map<string, { id: string; name: string; module: string }>() // name+module -> category

    // PASS 1: Parse all rows and collect data
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      try {
        const values = parseCSVLine(line)
        if (values.length < headerValues.length) {
          // Pad with empty strings if row is shorter
          while (values.length < headerValues.length) {
            values.push('')
          }
        }

        const getValue = (field: string) => {
          const index = headerMap[field]
          return index !== undefined ? values[index]?.trim() : ''
        }

        const name = getValue('name')
        const module = getValue('module')?.toUpperCase() || ''
        const description = getValue('description') || null
        const icon = getValue('icon') || null
        const image = getValue('image') || null
        const parentName = getValue('parent') || null
        const sortOrderStr = getValue('sortOrder') || '0'
        const isActiveStr = getValue('isActive') || 'true'

        if (!name || !module) {
          results.failed++
          results.errors.push(`Row ${i + 1}: Name and module are required`)
          continue
        }

        if (!validModules.includes(module)) {
          results.failed++
          results.errors.push(`Row ${i + 1}: Invalid module "${module}". Valid modules: ${validModules.join(", ")}`)
          continue
        }

        const sortOrder = parseInt(sortOrderStr) || 0
        const isActive = isActiveStr.toLowerCase() === 'true' || isActiveStr.toLowerCase() === '1' || isActiveStr === ''

        categoryRows.push({
          rowNumber: i + 1,
          name,
          module,
          description,
          icon,
          image,
          parentName: parentName || null,
          sortOrder,
          isActive,
        })
      } catch (error: any) {
        results.failed++
        results.errors.push(`Row ${i + 1}: Parse error - ${error.message}`)
      }
    }

    // PASS 2: Create/update categories in correct order (parents first)
    // Group by module for better organization
    const byModule = new Map<string, CategoryRow[]>()
    categoryRows.forEach(row => {
      if (!byModule.has(row.module)) {
        byModule.set(row.module, [])
      }
      byModule.get(row.module)!.push(row)
    })

    // Process each module separately
    for (const [module, rows] of byModule.entries()) {
      // First, load existing categories for this module into map
      const existingCategories = await prisma.category.findMany({
        where: { module: module as any },
        select: { id: true, name: true, module: true, parentId: true },
      })

      existingCategories.forEach(cat => {
        const key = `${cat.name.toLowerCase()}_${cat.module}`
        categoryMap.set(key, { id: cat.id, name: cat.name, module: cat.module })
      })

      // Separate root categories (no parent) from child categories
      const rootCategories = rows.filter(r => !r.parentName || r.parentName.trim() === '')
      const childCategories = rows.filter(r => r.parentName && r.parentName.trim() !== '')

      // PASS 2a: Process root categories first
      for (const row of rootCategories) {
        try {
          const key = `${row.name.toLowerCase()}_${row.module}`
          const existing = categoryMap.get(key)

          if (existing) {
            // Update existing root category
            await prisma.category.update({
              where: { id: existing.id },
              data: {
                description: row.description,
                icon: row.icon,
                image: row.image,
                sortOrder: row.sortOrder,
                isActive: row.isActive,
                parentId: null, // Ensure it's still root
              },
            })
            results.success++
          } else {
            // Create new root category
            const created = await prisma.category.create({
              data: {
                name: row.name,
                description: row.description,
                icon: row.icon,
                image: row.image,
                module: row.module as any,
                sortOrder: row.sortOrder,
                isActive: row.isActive,
                parentId: null,
              },
            })
            categoryMap.set(key, { id: created.id, name: created.name, module: created.module })
            results.success++
          }
        } catch (error: any) {
          results.failed++
          results.errors.push(`Row ${row.rowNumber}: ${error.message || "Failed to create/update category"}`)
        }
      }

      // PASS 2b: Process child categories (with parent resolution)
      // Sort children by parent name to process in dependency order
      const processedParents = new Set<string>()
      let maxIterations = childCategories.length * 2 // Prevent infinite loops
      let iterations = 0

      while (childCategories.length > 0 && iterations < maxIterations) {
        iterations++
        const remaining: CategoryRow[] = []

        for (const row of childCategories) {
          if (!row.parentName) {
            // Shouldn't happen, but handle it
            remaining.push(row)
            continue
          }

          const parentKey = `${row.parentName.toLowerCase()}_${row.module}`
          const parent = categoryMap.get(parentKey)

          if (!parent) {
            // Parent not found yet, check if it exists in DB
            const parentInDb = await prisma.category.findFirst({
              where: {
                name: { equals: row.parentName, mode: "insensitive" },
                module: row.module as any,
              },
              select: { id: true, name: true, module: true },
            })

            if (parentInDb) {
              // Found parent in DB, add to map
              categoryMap.set(parentKey, parentInDb)
              processedParents.add(parentKey)
            } else {
              // Parent doesn't exist, skip for now (will try again)
              remaining.push(row)
              if (!processedParents.has(parentKey)) {
                results.errors.push(`Row ${row.rowNumber}: Parent category "${row.parentName}" not found for module ${row.module}. Skipping.`)
                processedParents.add(parentKey)
              }
              continue
            }
          }

          // Parent found, create/update child category
          const parentCat = categoryMap.get(parentKey)!
          try {
            const key = `${row.name.toLowerCase()}_${row.module}_${parentCat.id}`
            const existing = await prisma.category.findFirst({
              where: {
                name: { equals: row.name, mode: "insensitive" },
                module: row.module as any,
                parentId: parentCat.id,
              },
            })

            if (existing) {
              // Update existing
              await prisma.category.update({
                where: { id: existing.id },
                data: {
                  description: row.description,
                  icon: row.icon,
                  image: row.image,
                  sortOrder: row.sortOrder,
                  isActive: row.isActive,
                  parentId: parentCat.id, // Ensure correct parent
                },
              })
              categoryMap.set(key, existing)
              results.success++
            } else {
              // Create new
              const created = await prisma.category.create({
                data: {
                  name: row.name,
                  description: row.description,
                  icon: row.icon,
                  image: row.image,
                  module: row.module as any,
                  sortOrder: row.sortOrder,
                  isActive: row.isActive,
                  parentId: parentCat.id,
                },
              })
              categoryMap.set(key, created)
              results.success++
            }
          } catch (error: any) {
            results.failed++
            results.errors.push(`Row ${row.rowNumber}: ${error.message || "Failed to create/update category"}`)
          }
        }

        // Update remaining list
        childCategories.length = 0
        childCategories.push(...remaining)

        // If no progress made, break to avoid infinite loop
        if (remaining.length === childCategories.length) {
          break
        }
      }

      // Report any remaining unprocessed children
      if (childCategories.length > 0) {
        childCategories.forEach(row => {
          results.failed++
          results.errors.push(`Row ${row.rowNumber}: Could not resolve parent category "${row.parentName}" for "${row.name}"`)
        })
      }
    }

    return NextResponse.json({
      message: `Import completed: ${results.success} succeeded, ${results.failed} failed`,
      results,
      summary: {
        totalRows: categoryRows.length,
        successful: results.success,
        failed: results.failed,
      },
    })
  } catch (error: any) {
    console.error("Category import error:", error)
    return NextResponse.json({ error: "Failed to import categories", details: error.message }, { status: 500 })
  }
}
