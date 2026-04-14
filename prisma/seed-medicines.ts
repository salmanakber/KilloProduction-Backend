import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting medicine data seeding...")

  // ========================================
  // 1. SEED ILLNESS CATEGORIES
  // ========================================
  console.log("\n🏥 Seeding illness categories...")

  const illnessCategories = [
    {
      name: "fever",
      displayName: "Fever & Flu",
      description: "Common fever, cold, and flu symptoms",
      icon: "🤒",
      isCommon: true,
      symptoms: ["Fever", "Cough", "Sore throat", "Runny nose", "Body aches"],
      medicines: ["Paracetamol", "Ibuprofen", "Aspirin", "Vitamin C"],
      isActive: true
    },
    {
      name: "headache",
      displayName: "Headache & Migraine",
      description: "Various types of headaches and migraines",
      icon: "🤕",
      isCommon: true,
      symptoms: ["Head pain", "Nausea", "Sensitivity to light", "Dizziness"],
      medicines: ["Paracetamol", "Ibuprofen", "Aspirin", "Sumatriptan"],
      isActive: true
    },
    {
      name: "pain",
      displayName: "Pain Management",
      description: "General pain relief and management",
      icon: "😣",
      isCommon: true,
      symptoms: ["Muscle pain", "Joint pain", "Back pain", "Toothache"],
      medicines: ["Ibuprofen", "Paracetamol", "Diclofenac", "Tramadol"],
      isActive: true
    },
    {
      name: "diabetes",
      displayName: "Diabetes Management",
      description: "Diabetes treatment and management",
      icon: "🩸",
      isCommon: false,
      symptoms: ["High blood sugar", "Frequent urination", "Increased thirst", "Fatigue"],
      medicines: ["Metformin", "Insulin", "Glimepiride", "Sitagliptin"],
      isActive: true
    },
    {
      name: "hypertension",
      displayName: "Hypertension (High Blood Pressure)",
      description: "Blood pressure management and treatment",
      icon: "💓",
      isCommon: false,
      symptoms: ["High blood pressure", "Headache", "Dizziness", "Chest pain"],
      medicines: ["Amlodipine", "Lisinopril", "Losartan", "Hydrochlorothiazide"],
      isActive: true
    },
    {
      name: "asthma",
      displayName: "Asthma & Respiratory",
      description: "Asthma and respiratory condition management",
      icon: "🫁",
      isCommon: false,
      symptoms: ["Shortness of breath", "Wheezing", "Chest tightness", "Coughing"],
      medicines: ["Salbutamol", "Budesonide", "Montelukast", "Theophylline"],
      isActive: true
    },
    {
      name: "allergies",
      displayName: "Allergies & Antihistamines",
      description: "Allergy treatment and prevention",
      icon: "🤧",
      isCommon: true,
      symptoms: ["Sneezing", "Itchy eyes", "Runny nose", "Skin rashes"],
      medicines: ["Cetirizine", "Loratadine", "Fexofenadine", "Diphenhydramine"],
      isActive: true
    },
    {
      name: "digestive",
      displayName: "Digestive Health",
      description: "Stomach and digestive system issues",
      icon: "🤢",
      isCommon: true,
      symptoms: ["Nausea", "Vomiting", "Diarrhea", "Indigestion", "Acid reflux"],
      medicines: ["Omeprazole", "Ranitidine", "Loperamide", "Bismuth subsalicylate"],
      isActive: true
    },
    {
      name: "skin",
      displayName: "Skin Conditions",
      description: "Various skin problems and treatments",
      icon: "🩹",
      isCommon: true,
      symptoms: ["Rashes", "Itching", "Acne", "Eczema", "Psoriasis"],
      medicines: ["Hydrocortisone", "Benzoyl peroxide", "Salicylic acid", "Clotrimazole"],
      isActive: true
    },
    {
      name: "vitamins",
      displayName: "Vitamins & Supplements",
      description: "Essential vitamins and nutritional supplements",
      icon: "💊",
      isCommon: true,
      symptoms: ["Vitamin deficiency", "Weakness", "Fatigue", "Poor immunity"],
      medicines: ["Vitamin C", "Vitamin D", "Vitamin B12", "Iron", "Calcium"],
      isActive: true
    }
  ]

  for (const category of illnessCategories) {
    await prisma.illnessCategory.upsert({
      where: { name: category.name },
      update: category,
      create: category
    })
  }
  console.log(`✅ Created ${illnessCategories.length} illness categories`)

  // ========================================
  // 2. SEED MEDICINE ORIGINS
  // ========================================
  console.log("\n🌍 Seeding medicine origins...")

  const medicineOrigins = [
    {
      name: "local",
      displayName: "Local (Nigeria)",
      description: "Medicines manufactured locally in Nigeria",
      isActive: true
    },
    {
      name: "imported",
      displayName: "Imported",
      description: "Medicines imported from other countries",
      isActive: true
    },
    {
      name: "india",
      displayName: "India",
      description: "Medicines manufactured in India",
      isActive: true
    },
    {
      name: "china",
      displayName: "China",
      description: "Medicines manufactured in China",
      isActive: true
    },
    {
      name: "usa",
      displayName: "United States",
      description: "Medicines manufactured in the United States",
      isActive: true
    },
    {
      name: "uk",
      displayName: "United Kingdom",
      description: "Medicines manufactured in the United Kingdom",
      isActive: true
    },
    {
      name: "germany",
      displayName: "Germany",
      description: "Medicines manufactured in Germany",
      isActive: true
    },
    {
      name: "france",
      displayName: "France",
      description: "Medicines manufactured in France",
      isActive: true
    },
    {
      name: "switzerland",
      displayName: "Switzerland",
      description: "Medicines manufactured in Switzerland",
      isActive: true
    },
    {
      name: "japan",
      displayName: "Japan",
      description: "Medicines manufactured in Japan",
      isActive: true
    }
  ]

  for (const origin of medicineOrigins) {
    await prisma.medicineOrigin.upsert({
      where: { name: origin.name },
      update: origin,
      create: origin
    })
  }
  console.log(`✅ Created ${medicineOrigins.length} medicine origins`)

  // ========================================
  // 3. SEED CENTRAL MEDICINES
  // ========================================
  console.log("\n💊 Seeding central medicines...")

  const centralMedicines = [
    {
      name: "Paracetamol 500mg",
      genericName: "Acetaminophen",
      description: "Pain reliever and fever reducer",
      purpose: "Relieves pain and reduces fever",
      dosageInfo: "1-2 tablets every 4-6 hours as needed, max 8 tablets per day",
      warnings: "Do not exceed recommended dose. Consult doctor if symptoms persist.",
      sideEffects: ["Nausea", "Stomach upset", "Allergic reactions"],
      category: "pain",
      illnessTypes: ["fever", "headache", "pain"],
      activeIngredients: ["Acetaminophen 500mg"],
      form: "TABLET",
      strength: "500mg",
      manufacturer: "Local Pharmaceutical Co.",
      images: ["paracetamol_500mg_1.jpg", "paracetamol_500mg_2.jpg"],
      isActive: true
    },
    {
      name: "Ibuprofen 400mg",
      genericName: "Ibuprofen",
      description: "Non-steroidal anti-inflammatory drug for pain and inflammation",
      purpose: "Relieves pain, reduces inflammation and fever",
      dosageInfo: "1-2 tablets every 4-6 hours as needed, max 6 tablets per day",
      warnings: "Take with food. Avoid if you have stomach ulcers.",
      sideEffects: ["Stomach upset", "Dizziness", "Headache"],
      category: "pain",
      illnessTypes: ["fever", "headache", "pain"],
      activeIngredients: ["Ibuprofen 400mg"],
      form: "TABLET",
      strength: "400mg",
      manufacturer: "MediPharm Ltd.",
      images: ["ibuprofen_400mg_1.jpg"],
      isActive: true
    },
    {
      name: "Amoxicillin 500mg",
      genericName: "Amoxicillin",
      description: "Broad-spectrum antibiotic for bacterial infections",
      purpose: "Treats various bacterial infections",
      dosageInfo: "1 capsule 3 times daily for 7-10 days",
      warnings: "Complete full course. May cause stomach upset.",
      sideEffects: ["Diarrhea", "Nausea", "Skin rash"],
      category: "antibiotics",
      illnessTypes: ["bacterial_infections"],
      activeIngredients: ["Amoxicillin trihydrate 500mg"],
      form: "CAPSULE",
      strength: "500mg",
      manufacturer: "Global Pharma Inc.",
      images: ["amoxicillin_500mg_1.jpg"],
      isActive: true
    },
    {
      name: "Cetirizine 10mg",
      genericName: "Cetirizine",
      description: "Antihistamine for allergy relief",
      purpose: "Relieves allergy symptoms",
      dosageInfo: "1 tablet once daily",
      warnings: "May cause drowsiness. Avoid alcohol.",
      sideEffects: ["Drowsiness", "Dry mouth", "Headache"],
      category: "allergies",
      illnessTypes: ["allergies"],
      activeIngredients: ["Cetirizine hydrochloride 10mg"],
      form: "TABLET",
      strength: "10mg",
      manufacturer: "AllerCare Pharmaceuticals",
      images: ["cetirizine_10mg_1.jpg"],
      isActive: true
    },
    {
      name: "Metformin 500mg",
      genericName: "Metformin",
      description: "Oral diabetes medication",
      purpose: "Controls blood sugar levels in type 2 diabetes",
      dosageInfo: "1 tablet twice daily with meals",
      warnings: "Take with food. Monitor blood sugar regularly.",
      sideEffects: ["Nausea", "Diarrhea", "Stomach upset"],
      category: "diabetes",
      illnessTypes: ["diabetes"],
      activeIngredients: ["Metformin hydrochloride 500mg"],
      form: "TABLET",
      strength: "500mg",
      manufacturer: "DiabeCare Ltd.",
      images: ["metformin_500mg_1.jpg"],
      isActive: true
    },
    {
      name: "Omeprazole 20mg",
      genericName: "Omeprazole",
      description: "Proton pump inhibitor for acid reflux",
      purpose: "Reduces stomach acid production",
      dosageInfo: "1 capsule once daily before breakfast",
      warnings: "Take on empty stomach. Long-term use may affect bone health.",
      sideEffects: ["Headache", "Nausea", "Diarrhea"],
      category: "digestive",
      illnessTypes: ["digestive"],
      activeIngredients: ["Omeprazole 20mg"],
      form: "CAPSULE",
      strength: "20mg",
      manufacturer: "GastroHealth Pharma",
      images: ["omeprazole_20mg_1.jpg"],
      isActive: true
    },
    {
      name: "Salbutamol Inhaler",
      genericName: "Albuterol",
      description: "Bronchodilator for asthma relief",
      purpose: "Relieves asthma symptoms and breathing difficulties",
      dosageInfo: "2 puffs every 4-6 hours as needed",
      warnings: "Shake well before use. Rinse mouth after use.",
      sideEffects: ["Tremors", "Increased heart rate", "Headache"],
      category: "asthma",
      illnessTypes: ["asthma"],
      activeIngredients: ["Salbutamol sulfate 100mcg"],
      form: "INHALER",
      strength: "100mcg per puff",
      manufacturer: "Respiratory Care Inc.",
      images: ["salbutamol_inhaler_1.jpg"],
      isActive: true
    },
    {
      name: "Vitamin C 1000mg",
      genericName: "Ascorbic Acid",
      description: "Essential vitamin for immune support",
      purpose: "Supports immune system and overall health",
      dosageInfo: "1 tablet once daily",
      warnings: "Take with food. High doses may cause stomach upset.",
      sideEffects: ["Stomach upset", "Diarrhea", "Kidney stones (high doses)"],
      category: "vitamins",
      illnessTypes: ["vitamins"],
      activeIngredients: ["Ascorbic Acid 1000mg"],
      form: "TABLET",
      strength: "1000mg",
      manufacturer: "VitaHealth Ltd.",
      images: ["vitamin_c_1000mg_1.jpg"],
      isActive: true
    },
    {
      name: "Hydrocortisone Cream 1%",
      genericName: "Hydrocortisone",
      description: "Topical steroid for skin inflammation",
      purpose: "Relieves itching and inflammation from skin conditions",
      dosageInfo: "Apply thin layer 2-3 times daily",
      warnings: "For external use only. Avoid face and sensitive areas.",
      sideEffects: ["Skin thinning", "Burning", "Itching"],
      category: "skin",
      illnessTypes: ["skin"],
      activeIngredients: ["Hydrocortisone acetate 1%"],
      form: "CREAM",
      strength: "1%",
      manufacturer: "DermaCare Pharmaceuticals",
      images: ["hydrocortisone_cream_1.jpg"],
      isActive: true
    },
    {
      name: "Calcium Carbonate 500mg",
      genericName: "Calcium Carbonate",
      description: "Calcium supplement for bone health",
      purpose: "Supports bone health and prevents osteoporosis",
      dosageInfo: "1-2 tablets daily with food",
      warnings: "Take with food. Avoid taking with iron supplements.",
      sideEffects: ["Constipation", "Gas", "Stomach upset"],
      category: "vitamins",
      illnessTypes: ["vitamins"],
      activeIngredients: ["Calcium Carbonate 500mg"],
      form: "TABLET",
      strength: "500mg",
      manufacturer: "BoneHealth Inc.",
      images: ["calcium_500mg_1.jpg"],
      isActive: true
    }
  ]

  for (const medicine of centralMedicines) {
    try {
      await prisma.centralMedicine.create({
        data: medicine
      })
    } catch (error) {
      // If medicine already exists, skip it
      console.log(`⚠️  Medicine "${medicine.name}" already exists, skipping...`)
    }
  }
  console.log(`✅ Created ${centralMedicines.length} central medicines`)

  // ========================================
  // 4. CREATE MEDICINE-ORIGIN RELATIONSHIPS
  // ========================================
  console.log("\n🔗 Creating medicine-origin relationships...")

  // Get created medicines and origins
  const createdMedicines = await prisma.centralMedicine.findMany()
  const createdOrigins = await prisma.medicineOrigin.findMany()

  // Create relationships (assigning origins to medicines)
  const medicineOriginRelations = [
    { medicineName: "Paracetamol 500mg", originName: "local" },
    { medicineName: "Ibuprofen 400mg", originName: "imported" },
    { medicineName: "Amoxicillin 500mg", originName: "india" },
    { medicineName: "Cetirizine 10mg", originName: "usa" },
    { medicineName: "Metformin 500mg", originName: "local" },
    { medicineName: "Omeprazole 20mg", originName: "germany" },
    { medicineName: "Salbutamol Inhaler", originName: "uk" },
    { medicineName: "Vitamin C 1000mg", originName: "local" },
    { medicineName: "Hydrocortisone Cream 1%", originName: "usa" },
    { medicineName: "Calcium Carbonate 500mg", originName: "local" }
  ]

  for (const relation of medicineOriginRelations) {
    const medicine = createdMedicines.find(m => m.name === relation.medicineName)
    const origin = createdOrigins.find(o => o.name === relation.originName)
    
    if (medicine && origin) {
      await prisma.centralMedicineOrigin.upsert({
        where: {
          centralMedicineId_medicineOriginId: {
            centralMedicineId: medicine.id,
            medicineOriginId: origin.id
          }
        },
        update: {},
        create: {
          centralMedicineId: medicine.id,
          medicineOriginId: origin.id
        }
      })
    }
  }
  console.log(`✅ Created ${medicineOriginRelations.length} medicine-origin relationships`)

  // ========================================
  // SUMMARY
  // ========================================
  console.log("\n🎉 MEDICINE DATA SEEDING COMPLETED SUCCESSFULLY!")
  console.log("📊 Created/Updated:")
  console.log(`  - ${illnessCategories.length} Illness Categories`)
  console.log(`  - ${medicineOrigins.length} Medicine Origins`)
  console.log(`  - ${centralMedicines.length} Central Medicines`)
  console.log(`  - ${medicineOriginRelations.length} Medicine-Origin Relationships`)
  
  console.log("\n🏥 Sample Illness Categories:")
  console.log("  - Fever & Flu, Headache & Migraine, Pain Management")
  console.log("  - Diabetes, Hypertension, Asthma, Allergies")
  console.log("  - Digestive Health, Skin Conditions, Vitamins")
  
  console.log("\n🌍 Medicine Origins:")
  console.log("  - Local (Nigeria), Imported, India, China, USA, UK, Germany, France, Switzerland, Japan")
  
  console.log("\n💊 Sample Medicines:")
  console.log("  - Paracetamol, Ibuprofen, Amoxicillin, Cetirizine, Metformin")
  console.log("  - Omeprazole, Salbutamol, Vitamin C, Hydrocortisone, Calcium")
}

main()
  .catch((e) => {
    console.error("❌ Error during medicine seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
