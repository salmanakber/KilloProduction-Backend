"use client"

import { useState, useEffect, useCallback, memo } from "react"
import {
  Search, Filter, Download, Upload, Plus, Edit, Eye, MoreHorizontal,
  CheckCircle, XCircle, Trash2, FolderTree, Package, AlertCircle,
  ChevronRight, ChevronDown, FileSpreadsheet, ArrowRight, Check,
  CornerDownRight, X
} from "lucide-react"
import IconPicker from "@/components/admin/IconPicker"
import * as Icons from "lucide-react" // Fallback for dynamic icons if needed

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

// --- Types ---
interface Category {
  id: string
  name: string
  description?: string
  icon?: string
  image?: string
  parentId?: string
  module: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  parent?: { id: string; name: string; module: string }
  children?: Category[] // Recursive type for children
  _count?: { children: number; products: number }
}

const MODULES = [
  { value: "ALL", label: "All Modules" },
  { value: "AUTO_PARTS", label: "Auto Parts" },
  { value: "PHARMACY", label: "Pharmacy" },
  { value: "FOOD", label: "Food" },
  { value: "GROCERY", label: "Grocery" },
  { value: "RIDING", label: "Riding" },
  { value: "COURIER", label: "Courier" },
  { value: "WHOLESALER", label: "Wholesaler" },
]

// --- Utility Hooks ---
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

// --- Icons & Badges ---
const CategoryIcon = memo(({ icon, className = "h-5 w-5" }: { icon?: string; className?: string }) => {
  // Simplified for demo: checks if it's an emoji or assumes a default icon
  if (!icon) return <FolderTree className={`${className} text-gray-400`} />
  if (icon.length <= 2) return <span className="text-lg">{icon}</span>
  // In a real app, integrate your library logic here
  return <FolderTree className={className} />
})
CategoryIcon.displayName = "CategoryIcon"

const ModuleBadge = ({ module }: { module: string }) => {
  const styles: Record<string, string> = {
    AUTO_PARTS: "bg-blue-50 text-blue-700 border-blue-200",
    PHARMACY: "bg-red-50 text-red-700 border-red-200",
    FOOD: "bg-orange-50 text-orange-700 border-orange-200",
    GROCERY: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }
  return (
    <Badge variant="outline" className={`${styles[module] || "bg-gray-100 text-gray-700"} text-[10px] uppercase tracking-wider`}>
      {module.replace("_", " ")}
    </Badge>
  )
}

// --- Main Component ---
export default function CategoriesManagement() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearch = useDebounce(searchTerm, 500)
  
  // Modal State
  const [modalState, setModalState] = useState<{
    type: 'create' | 'edit' | 'view' | 'import' | null,
    data?: Category | null
  }>({ type: null })

  const { toast } = useToast()

  // Fetching Logic
  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch only root categories (parentId is null) - children are included in the response
      const params = new URLSearchParams({
        parentId: "null", // Only fetch root categories
        ...(debouncedSearch && { search: debouncedSearch }),
      })
      const response = await fetch(`/api/admin/categories?${params}&limit=1000`)
      const data = await response.json()
      // Filter to only show root categories (parentId is null)
      const rootCategories = (data.categories || []).filter((cat: Category) => !cat.parentId)
      setCategories(rootCategories)
    } catch (e) {
      console.error(e)
      toast({
        title: "Error",
        description: "Failed to fetch categories",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, toast])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-500 text-sm">Organize your services and products.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setModalState({ type: 'import' })} className="h-9">
            <Upload className="h-4 w-4 mr-2" /> Import CSV
          </Button>
          <Button onClick={() => setModalState({ type: 'create' })} className="bg-green-600 hover:bg-green-700 h-9">
            <Plus className="h-4 w-4 mr-2" /> Add Category
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 bg-white p-2 rounded-lg border shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input 
            placeholder="Search categories..." 
            className="pl-9 border-0 bg-gray-50 focus-visible:ring-0 focus-visible:bg-white transition-colors"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 px-2">
          <Button variant="ghost" size="sm" className="text-gray-600"><Filter className="h-4 w-4 mr-2" /> Filter</Button>
          <div className="h-4 w-px bg-gray-200" />
          <Button variant="ghost" size="sm" className="text-gray-600"><Download className="h-4 w-4 mr-2" /> Export</Button>
        </div>
      </div>

      {/* Hierarchical Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="min-w-full">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b">
            <div className="col-span-5">Category Name</div>
            <div className="col-span-2">Module</div>
            <div className="col-span-2 text-center">Items</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Action</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-8 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : categories.length === 0 ? (
              <div className="py-12 text-center text-gray-500">No categories found</div>
            ) : (
              categories.map((cat) => (
                <CategoryRow 
                  key={cat.id} 
                  category={cat} 
                  level={0} 
                  onView={(c) => setModalState({ type: 'view', data: c })}
                  onEdit={(c) => setModalState({ type: 'edit', data: c })}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modalState.type === 'import' && (
        <ImprovedImportModal onClose={() => setModalState({ type: null })} onSuccess={() => { setModalState({ type: null }); fetchCategories(); }} />
      )}
      {modalState.type === 'view' && modalState.data && (
        <CategoryViewModal category={modalState.data} onClose={() => setModalState({ type: null })} />
      )}
      {modalState.type === 'edit' && modalState.data && (
        <CategoryEditModal category={modalState.data} onClose={() => setModalState({ type: null })} onSuccess={() => { setModalState({ type: null }); fetchCategories(); }} />
      )}
      {modalState.type === 'create' && (
        <CategoryCreateModal onClose={() => setModalState({ type: null })} onSuccess={() => { setModalState({ type: null }); fetchCategories(); }} />
      )}
    </div>
  )
}

// --- Component: Recursive Category Row ---
function CategoryRow({ category, level, onView, onEdit }: { category: Category; level: number; onView: (c: Category) => void; onEdit: (c: Category) => void }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasChildren = category.children && category.children.length > 0
  
  // Indentation calculation
  const paddingLeft = level * 2.5 // Rem units approx

  return (
    <>
      <div 
        className={cn(
          "grid grid-cols-12 gap-4 px-6 py-3 items-center hover:bg-gray-50 transition-colors group text-sm",
          level > 0 && "bg-gray-50/30"
        )}
      >
        {/* Name Column with Indentation & Collapse Toggle */}
        <div className="col-span-5 flex items-center">
          <div style={{ width: `${paddingLeft}rem` }} className="flex-shrink-0 relative h-full">
             {level > 0 && (
                <div className="absolute top-1/2 left-[-1.25rem] w-4 h-[1px] bg-gray-300"></div> // Horizontal line
             )}
             {level > 0 && (
                <div className="absolute bottom-1/2 left-[-1.25rem] w-[1px] h-[200%] bg-gray-200 -translate-y-full"></div> // Vertical Line connection
             )}
          </div>
          
          {/* Toggle Button */}
          {hasChildren ? (
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="mr-2 p-1 rounded-md hover:bg-gray-200 text-gray-500 transition-colors"
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : (
            <div className="w-6 mr-2" /> // Spacer
          )}

          {/* Icon & Name */}
          <div className="flex items-center gap-3">
             {level > 0 && <CornerDownRight className="h-3 w-3 text-gray-300 -ml-2 mr-1" />}
             <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-600", category.image && "bg-cover")}>
                <CategoryIcon icon={category.icon} />
             </div>
             <div>
                <span className="font-medium text-gray-900 block">{category.name}</span>
                {category.description && <span className="text-xs text-gray-400 truncate max-w-[200px] block">{category.description}</span>}
             </div>
          </div>
        </div>

        {/* Module */}
        <div className="col-span-2">
           <ModuleBadge module={category.module} />
        </div>

        {/* Counts */}
        <div className="col-span-2 text-center text-xs text-gray-500">
           {category._count?.products || 0} Products
        </div>

        {/* Status */}
        <div className="col-span-2">
           <div className={cn("inline-flex items-center px-2 py-1 rounded-full text-xs font-medium", 
             category.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
           )}>
             <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", category.isActive ? "bg-green-500" : "bg-red-500")} />
             {category.isActive ? "Active" : "Inactive"}
           </div>
        </div>

        {/* Actions */}
        <div className="col-span-1 text-right">
           <DropdownMenu>
             <DropdownMenuTrigger asChild>
               <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-700">
                 <MoreHorizontal className="h-4 w-4" />
               </Button>
             </DropdownMenuTrigger>
             <DropdownMenuContent align="end">
               <DropdownMenuLabel>Actions</DropdownMenuLabel>
               <DropdownMenuItem onClick={() => onView(category)}>
                 <Eye className="mr-2 h-4 w-4" />
                 View
               </DropdownMenuItem>
               <DropdownMenuItem onClick={() => onEdit(category)}>
                 <Edit className="mr-2 h-4 w-4" />
                 Edit
               </DropdownMenuItem>
             </DropdownMenuContent>
           </DropdownMenu>
        </div>
      </div>

      {/* Render Children Recursively */}
      {isExpanded && hasChildren && (
        <div className="relative">
           {/* Vertical Guideline for children */}
           <div 
             className="absolute top-0 bottom-0 border-l border-gray-200" 
             style={{ left: `${(level * 2.5) + 2.2}rem` }} 
           />
           {category.children?.map(child => (
             <CategoryRow 
               key={child.id} 
               category={child} 
               level={level + 1} 
               onView={onView}
               onEdit={onEdit}
             />
           ))}
        </div>
      )}
    </>
  )
}


// --- Component: Redesigned Import Modal ---
function ImprovedImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [file, setFile] = useState<File | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [headers, setHeaders] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // All DB Fields for mapping
  const dbFields = [
    { key: "name", label: "Category Name", required: true },
    { key: "module", label: "Module Type", required: true },
    { key: "description", label: "Description", required: false },
    { key: "icon", label: "Icon", required: false },
    { key: "image", label: "Image URL", required: false },
    { key: "parent", label: "Parent Category (Name)", required: false, note: "Use parent category name, not ID" },
    { key: "sortOrder", label: "Sort Order", required: false },
    { key: "isActive", label: "Is Active / Status", required: false },
  ] as Array<{ key: string; label: string; required: boolean; note?: string }>

  // Parse CSV line properly
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    setFile(f)
    
    try {
      const text = await f.text()
      const lines = text.split(/\r?\n/).filter((line) => line.trim())
      if (lines.length === 0) {
        toast({
          title: "Error",
          description: "CSV file is empty",
          variant: "destructive",
        })
        return
      }

      const headers = parseCSVLine(lines[0])
      setHeaders(headers)
      
      // Auto-map common variations
      const autoMapping: Record<string, string> = {}
      const fieldVariations: Record<string, string[]> = {
        name: ["name", "category name", "category_name", "title"],
        module: ["module", "mod", "category module", "category_module"],
        description: ["description", "desc", "details", "note", "notes"],
        icon: ["icon", "icon_name", "icon name"],
        image: ["image", "image_url", "image url", "img", "picture"],
        parent: ["parent", "parent name", "parent_name", "parent category", "parent_category"],
        sortOrder: ["sort order", "sort_order", "order", "sort", "position", "priority"],
        isActive: ["is active", "is_active", "active", "enabled", "status"],
      }

      headers.forEach((header) => {
        const normalized = header.toLowerCase().trim()
        for (const [field, variations] of Object.entries(fieldVariations)) {
          if (variations.includes(normalized)) {
            autoMapping[header] = field
            break
          }
        }
      })
      
      setMapping(autoMapping)
      setStep(2)
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to read CSV file: ${error.message}`,
        variant: "destructive",
      })
    }
  }

  const handleImport = async () => {
    if (!file) {
      toast({
        title: "Error",
        description: "Please select a file",
        variant: "destructive",
      })
      return
    }


    // Validate required mappings
    if (!mapping['Category Name'] || !mapping['Module Type']) {
      toast({
        title: "Mapping Required",
        description: "Please map 'Name' and 'Module' columns (marked with *)",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("columnMapping", JSON.stringify(mapping))

      const response = await fetch("/api/admin/categories/import", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to import categories")
      }

      const data = await response.json()
      toast({
        title: "Import Completed",
        description: data.message,
      })

      onSuccess()
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import categories.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-white gap-0">
        
        {/* Modal Header with Steps */}
        <div className="bg-gray-50 border-b p-6 pb-4">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl">Import Categories</DialogTitle>
            <DialogDescription>Add multiple categories at once via CSV.</DialogDescription>
          </DialogHeader>
          
          {/* Stepper */}
          <div className="flex items-center gap-2 text-sm font-medium">
             <div className={cn("flex items-center gap-2", step >= 1 ? "text-green-600" : "text-gray-400")}>
                <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step >= 1 ? "border-green-600 bg-green-100" : "border-gray-300")}>1</span>
                Upload
             </div>
             <div className="w-8 h-px bg-gray-300" />
             <div className={cn("flex items-center gap-2", step >= 2 ? "text-green-600" : "text-gray-400")}>
                <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step >= 2 ? "border-green-600 bg-green-100" : "border-gray-300")}>2</span>
                Map Columns
             </div>
             <div className="w-8 h-px bg-gray-300" />
             <div className={cn("flex items-center gap-2", step >= 3 ? "text-green-600" : "text-gray-400")}>
                <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs border", step >= 3 ? "border-green-600 bg-green-100" : "border-gray-300")}>3</span>
                Finish
             </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-6 min-h-[300px]">
          
          {/* STEP 1: UPLOAD */}
          {step === 1 && (
            <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 hover:bg-green-50/30 transition-colors p-10 text-center">
               <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
               </div>
               <h3 className="text-lg font-medium text-gray-900">Upload your CSV file</h3>
               <p className="text-gray-500 mt-1 mb-6 text-sm max-w-sm">
                 Drag and drop your file here, or click to browse. Max size 5MB.
               </p>
               <div className="relative">
                 <Button className="bg-green-600 hover:bg-green-700">Browse Files</Button>
                 <Input 
                   type="file" 
                   accept=".csv" 
                   className="absolute inset-0 opacity-0 cursor-pointer" 
                   onChange={handleFileUpload}
                 />
               </div>
               <div className="mt-8 flex items-center gap-2 text-xs text-gray-400">
                  <Download className="h-3 w-3" />
                  <span className="underline cursor-pointer hover:text-green-600">Download sample template</span>
               </div>
            </div>
          )}

          {/* STEP 2: MAPPING */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 text-blue-800 p-3 rounded-md text-sm flex items-start gap-2">
                 <AlertCircle className="h-5 w-5 shrink-0" />
                 <p>We detected <strong>{headers.length} columns</strong>. Please match them to the database fields below.</p>
              </div>

              <div className="border rounded-lg overflow-hidden">
                 <div className="grid grid-cols-7 bg-gray-50 p-3 border-b text-xs font-semibold text-gray-500 uppercase">
                    <div className="col-span-3">Your CSV Header</div>
                    <div className="col-span-1 text-center"></div>
                    <div className="col-span-3">System Field</div>
                 </div>
                 
                 <div className="max-h-[250px] overflow-y-auto divide-y">
                    {dbFields.map((field) => (
                       <div key={field.key} className="grid grid-cols-7 p-3 items-center hover:bg-gray-50">
                          {/* Left: CSV Selection */}
                          <div className="col-span-3">
                             <Select 
                               value={Object.keys(mapping).find(k => mapping[k] === field.key) || "__unmapped__"}
                               onValueChange={(val) => {
                                 if (val === "__unmapped__") {
                                   const newMapping = { ...mapping }
                                   Object.keys(newMapping).forEach(key => {
                                     if (newMapping[key] === field.key) {
                                       delete newMapping[key]
                                     }
                                   })
                                   setMapping(newMapping)
                                 } else {
                                   // Remove previous mapping for this field
                                   const newMapping = { ...mapping }
                                   Object.keys(newMapping).forEach(key => {
                                     if (newMapping[key] === field.key) {
                                       delete newMapping[key]
                                     }
                                   })
                                   // Add new mapping
                                   newMapping[val] = field.key
                                   setMapping(newMapping)
                                 }
                               }}
                             >
                                <SelectTrigger className="h-8 text-sm">
                                   <SelectValue placeholder="Select column..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[200px] overflow-y-auto bg-white">
                                   <SelectItem value="__unmapped__">-- Not mapped --</SelectItem>
                                   {headers.map(h => {
                                     const isMapped = Boolean(mapping[h] && mapping[h] !== field.key)
                                     const isThisMapped = mapping[h] === field.key
                                     return (
                                       <SelectItem 
                                         key={h} 
                                         value={h}
                                         disabled={isMapped && !isThisMapped}
                                       >
                                         {h}
                                         {isThisMapped && " ✓"}
                                         {isMapped && !isThisMapped && " (mapped)"}
                                       </SelectItem>
                                     )
                                   })}
                                </SelectContent>
                             </Select>
                          </div>
                          
                          {/* Middle: Arrow */}
                          <div className="col-span-1 flex justify-center text-gray-300">
                             <ArrowRight className="h-4 w-4" />
                          </div>

                          {/* Right: DB Field */}
                          <div className="col-span-3 flex flex-col gap-1">
                             <div className="flex items-center gap-2">
                               <span className="text-sm font-medium text-gray-700">{field.label}</span>
                               {field.required && <span className="text-red-500 text-xs">*</span>}
                               {mapping[field.key] && <Check className="h-4 w-4 text-green-500 ml-auto" />}
                             </div>
                             {field.note && (
                               <p className="text-xs text-gray-500">{field.note}</p>
                             )}
                          </div>
                       </div>
                    ))}
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-6 pt-2 border-t bg-gray-50">
           {step === 1 ? (
             <Button variant="outline" onClick={onClose}>Cancel</Button>
           ) : (
             <div className="flex w-full justify-between">
                <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                <Button 
                  className="bg-green-600 hover:bg-green-700" 
                  onClick={handleImport} 
                  disabled={loading}
                >
                  {loading ? "Importing..." : "Run Import"}
                </Button>
             </div>
           )}
        </DialogFooter>

      </DialogContent>
    </Dialog>
  )
}

// --- Component: Category View Modal ---
function CategoryViewModal({ category, onClose }: { category: Category; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Category Details</DialogTitle>
          <DialogDescription>View detailed information about the category.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="text-sm text-gray-900 mt-1">{category.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Module</label>
              <p className="text-sm text-gray-900 mt-1">{category.module.replace("_", " ")}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <p className="text-sm text-gray-900 mt-1">{category.description || "No description"}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Parent Category</label>
              <p className="text-sm text-gray-900 mt-1">{category.parent?.name || "Root Category"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sort Order</label>
              <p className="text-sm text-gray-900 mt-1">{category.sortOrder}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Children</label>
              <p className="text-sm text-gray-900 mt-1">{category._count?.children || 0}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Products</label>
              <p className="text-sm text-gray-900 mt-1">{category._count?.products || 0}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <Badge className={category.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
              {category.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Created</label>
            <p className="text-sm text-gray-900 mt-1">
              {new Date(category.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Component: Category Create Modal ---
function CategoryCreateModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    icon: "",
    image: "",
    parentId: "",
    module: "AUTO_PARTS",
    sortOrder: 0,
    isActive: true,
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId === "" ? null : formData.parentId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create category")
      }

      toast({
        title: "Category Created",
        description: "Category has been successfully created.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create category.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Category</DialogTitle>
          <DialogDescription>
            Create a new category. Categories can have parent-child relationships.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Engine Parts"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Module *</label>
              <Select
                value={formData.module}
                onValueChange={(value) => setFormData({ ...formData, module: value, parentId: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto bg-white">
                  {MODULES.filter((m) => m.value !== "ALL" && m.value && m.value.trim() !== "").map((mod) => (
                    <SelectItem key={mod.value} value={mod.value}>
                      {mod.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              placeholder="Describe the category..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <Input
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="Image URL"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active
            </label>
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? "Creating..." : "Create Category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// --- Component: Category Edit Modal ---
function CategoryEditModal({ category, onClose, onSuccess }: { category: Category; onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    name: category.name,
    description: category.description || "",
    icon: category.icon || "",
    image: category.image || "",
    parentId: category.parentId || "",
    module: category.module,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
  })
  const [loading, setLoading] = useState(false)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const { toast } = useToast()

  useEffect(() => {
    // Fetch all categories for parent selection
    fetch(`/api/admin/categories?limit=1000`)
      .then(res => res.json())
      .then(data => setAllCategories(data.categories || []))
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          parentId: formData.parentId === "" ? null : formData.parentId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update category")
      }

      toast({
        title: "Category Updated",
        description: "Category has been successfully updated.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update category.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const parentOptions = allCategories.filter(
    (cat) => cat.module === formData.module && cat.id !== category.id && !cat.parentId
  )

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Category</DialogTitle>
          <DialogDescription>Update category information and settings.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Module *</label>
              <Select
                value={formData.module}
                onValueChange={(value) => setFormData({ ...formData, module: value, parentId: "" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto bg-white">
                  {MODULES.filter((m) => m.value !== "ALL" && m.value && m.value.trim() !== "").map((mod) => (
                    <SelectItem key={mod.value} value={mod.value}>
                      {mod.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Category</label>
              <Select
                value={formData.parentId || "__none__"}
                onValueChange={(value) => setFormData({ ...formData, parentId: value === "__none__" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None (Root Category)" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px] overflow-y-auto bg-white">
                  <SelectItem value="__none__">None (Root Category)</SelectItem>
                  {parentOptions && Array.isArray(parentOptions) && parentOptions.filter((cat) => cat.id && cat.id.trim() !== "").map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
              <Input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <Input
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActiveEdit"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="isActiveEdit" className="text-sm font-medium text-gray-700">
              Active
            </label>
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? "Updating..." : "Update Category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}