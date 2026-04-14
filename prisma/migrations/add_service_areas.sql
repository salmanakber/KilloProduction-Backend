-- Create service_areas table
CREATE TABLE "service_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceAreaType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id")
);

-- Create service_area_polygons table
CREATE TABLE "service_area_polygons" (
    "id" TEXT NOT NULL,
    "serviceAreaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#FF6B6B',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "serviceTypes" TEXT[] DEFAULT ARRAY['courier', 'ride', 'delivery'],
    "maxDistance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_area_polygons_pkey" PRIMARY KEY ("id")
);

-- Create service_area_grid_cells table
CREATE TABLE "service_area_grid_cells" (
    "id" TEXT NOT NULL,
    "serviceAreaId" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "center" JSONB NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "bounds" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "serviceTypes" TEXT[] DEFAULT ARRAY['courier', 'ride', 'delivery'],
    "maxDistance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_area_grid_cells_pkey" PRIMARY KEY ("id")
);

-- Create ServiceAreaType enum
CREATE TYPE "ServiceAreaType" AS ENUM ('POLYGON', 'GRID');

-- Add foreign key constraints
ALTER TABLE "service_area_polygons" ADD CONSTRAINT "service_area_polygons_serviceAreaId_fkey" FOREIGN KEY ("serviceAreaId") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_area_grid_cells" ADD CONSTRAINT "service_area_grid_cells_serviceAreaId_fkey" FOREIGN KEY ("serviceAreaId") REFERENCES "service_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for better performance
CREATE INDEX "service_areas_isActive_idx" ON "service_areas"("isActive");
CREATE INDEX "service_areas_priority_idx" ON "service_areas"("priority");
CREATE INDEX "service_area_polygons_serviceAreaId_idx" ON "service_area_polygons"("serviceAreaId");
CREATE INDEX "service_area_grid_cells_serviceAreaId_idx" ON "service_area_grid_cells"("serviceAreaId");
CREATE INDEX "service_area_grid_cells_isActive_idx" ON "service_area_grid_cells"("isActive");

-- Add unique constraint for service area polygon
ALTER TABLE "service_area_polygons" ADD CONSTRAINT "service_area_polygons_serviceAreaId_key" UNIQUE ("serviceAreaId");


