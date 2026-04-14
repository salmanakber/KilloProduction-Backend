import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET - Fetch food settings (public for vendors)
export async function GET(request: NextRequest) {
  try {
    // Default settings
    const defaultSettings = {
      spiceLevels: [
        { value: "NONE", label: "No Spice", description: "Completely mild, no heat", icon: "🌿", enabled: true },
        { value: "MILD", label: "Mild", description: "Slightly spicy, minimal heat", icon: "🌶️", enabled: true },
        { value: "MEDIUM", label: "Medium", description: "Moderately spicy", icon: "🌶️🌶️", enabled: true },
        { value: "HOT", label: "Hot", description: "Very spicy, significant heat", icon: "🌶️🌶️🌶️", enabled: true },
        { value: "EXTRA_HOT", label: "Extra Hot", description: "Extremely spicy, maximum heat", icon: "🔥", enabled: true },
      ],
      commonAllergens: [
        { id: "nuts", name: "Nuts", description: "Tree nuts and peanuts", enabled: true },
        { id: "dairy", name: "Dairy", description: "Milk, cheese, yogurt", enabled: true },
        { id: "eggs", name: "Eggs", description: "Eggs and egg products", enabled: true },
        { id: "gluten", name: "Gluten", description: "Wheat, barley, rye", enabled: true },
        { id: "soy", name: "Soy", description: "Soybeans and soy products", enabled: true },
        { id: "shellfish", name: "Shellfish", description: "Crustaceans and mollusks", enabled: true },
        { id: "fish", name: "Fish", description: "Fish and fish products", enabled: true },
        { id: "sesame", name: "Sesame", description: "Sesame seeds and oil", enabled: true },
      ],
      dietaryOptions: [
        { value: "vegetarian", label: "Vegetarian", icon: "🥬", enabled: true },
        { value: "vegan", label: "Vegan", icon: "🌱", enabled: true },
        { value: "glutenFree", label: "Gluten Free", icon: "🌾", enabled: true },
        { value: "halal", label: "Halal", icon: "☪️", enabled: true },
        { value: "kosher", label: "Kosher", icon: "✡️", enabled: false },
      ],
      defaults: {
        defaultPreparationTime: 15,
        defaultSpiceLevel: "MILD",
        requireCaloriesInfo: false,
        requireIngredientsInfo: false,
        allowCustomVariants: true,
        allowCustomAddOns: true,
      },
      validation: {
        minPrice: 0,
        maxPrice: 1000000,
        minPreparationTime: 1,
        maxPreparationTime: 300,
        maxImagesPerItem: 10,
        maxVariantsPerItem: 10,
        maxAddOnsPerItem: 20,
      },
    }

    // Get food settings from FoodSettings model
    let foodSettings = defaultSettings
    
    try {
      const dbSettings = await prisma.foodSettings.findUnique({
        where: { id: 1 },
      })

      if (dbSettings) {
        // Merge with defaults to ensure all fields exist
        foodSettings = {
          ...defaultSettings,
          spiceLevels: (dbSettings.spiceLevels as any) || defaultSettings.spiceLevels,
          commonAllergens: (dbSettings.commonAllergens as any) || defaultSettings.commonAllergens,
          dietaryOptions: (dbSettings.dietaryOptions as any) || defaultSettings.dietaryOptions,
          defaults: { ...defaultSettings.defaults, ...((dbSettings.defaults as any) || {}) },
          validation: { ...defaultSettings.validation, ...((dbSettings.validation as any) || {}) },
        }
      }
    } catch (error) {
      // If FoodSettings doesn't exist yet, use defaults
      console.log("FoodSettings not found, using defaults")
    }

    return NextResponse.json({ settings: foodSettings })
  } catch (error) {
    console.error("Error fetching food settings:", error)
    return NextResponse.json({ error: "Failed to fetch food settings" }, { status: 500 })
  }
}
