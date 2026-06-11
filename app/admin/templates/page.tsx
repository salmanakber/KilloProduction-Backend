"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  Mail,
  MessageSquare,
  Copy,
  Star,
  Code,
  CheckCircle2,
  LayoutTemplate,
  Terminal,
  Smartphone,
  Wand2 // Icon for the auto-magic feature
} from "lucide-react"

// --- Interfaces ---
interface EmailTemplate {
  id: string
  templateKey: string
  name: string
  subject: string
  htmlContent: string
  textContent?: string
  variables: string[]
  category: string
  module: string
  description?: string
  isActive: boolean
  isDefault: boolean
  isSystem: boolean
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

interface SmsTemplate {
  id: string
  templateKey: string
  name: string
  content: string
  variables: string[]
  category: string
  module: string
  description?: string
  isActive: boolean
  isDefault: boolean
  isSystem: boolean
  maxLength: number
  createdAt: string
  updatedAt: string
  lastUsedAt?: string
}

const MODULES = [
  { id: 'GLOBAL', name: 'Global', color: 'bg-indigo-100 text-indigo-700' },
  { id: 'PHARMACY', name: 'Pharmacy', color: 'bg-pink-100 text-pink-700' },
  { id: 'FOOD', name: 'Food', color: 'bg-orange-100 text-orange-700' },
  { id: 'GROCERY', name: 'Grocery', color: 'bg-emerald-100 text-emerald-700' },
  { id: 'AUTO_PARTS', name: 'Auto Parts', color: 'bg-violet-100 text-violet-700' },
  { id: 'RIDING', name: 'Riding', color: 'bg-blue-100 text-blue-700' },
  { id: 'DELIVERY', name: 'Delivery', color: 'bg-teal-100 text-teal-700' },
  { id: 'PROPERTY', name: 'Property', color: 'bg-purple-100 text-purple-700' },
  { id: 'ADMIN', name: 'Admin', color: 'bg-red-100 text-red-700' },
]

const EMAIL_CATEGORIES = [
  'VERIFICATION', 'NOTIFICATION', 'MARKETING', 'TRANSACTIONAL', 'SUPPORT',
  'WELCOME', 'ORDER_CONFIRMATION', 'ORDER_STATUS', 'PAYMENT', 'ACCOUNT',
  'RESET_PASSWORD', 'INVITATION', 'REMINDER', 'PROMOTIONAL', 'NEWSLETTER'
]

const SMS_CATEGORIES = [
  'OTP', 'NOTIFICATION', 'ALERT', 'REMINDER', 'ORDER_UPDATE',
  'PAYMENT', 'DELIVERY', 'VERIFICATION', 'MARKETING', 'PROMOTIONAL'
]

export default function TemplateManagement() {
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email')
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedModule, setSelectedModule] = useState("all")
  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [showDefaultOnly, setShowDefaultOnly] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | SmsTemplate | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  
  // Notification for auto-added variables
  const [autoAddedVars, setAutoAddedVars] = useState<string[]>([])

  const [emailFormData, setEmailFormData] = useState({
    templateKey: '', name: '', subject: '', htmlContent: '', textContent: '',
    variables: [] as string[], category: 'NOTIFICATION', module: 'GLOBAL',
    description: '', isActive: true, isDefault: false, isSystem: false,
  })

  const [smsFormData, setSmsFormData] = useState({
    templateKey: '', name: '', content: '', variables: [] as string[],
    category: 'NOTIFICATION', module: 'GLOBAL', description: '',
    isActive: true, isDefault: false, isSystem: false, maxLength: 160,
  })

  const [variableInput, setVariableInput] = useState('')

  useEffect(() => {
    fetchTemplates()
  }, [activeTab, selectedCategory, selectedModule, showActiveOnly, showDefaultOnly])

  const fetchTemplates = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      if (selectedModule !== 'all') params.append('module', selectedModule)
      if (showActiveOnly) params.append('isActive', 'true')
      if (showDefaultOnly) params.append('isDefault', 'true')
      
      const endpoint = activeTab === 'email' ? 'email' : 'sms'
      const response = await fetch(`/api/admin/templates/${endpoint}?${params.toString()}`)
      const data = await response.json()
      
      if (activeTab === 'email') setEmailTemplates(data.templates || [])
      else setSmsTemplates(data.templates || [])
    } catch (error) {
      console.error("Error fetching templates:", error)
    } finally {
      setLoading(false)
    }
  }

  // --- Handlers ---
  const handleSetDefault = async (templateId: string) => {
    try {
      const endpoint = activeTab === 'email' ? 'email' : 'sms'
      const response = await fetch(`/api/admin/templates/${endpoint}/${templateId}/set-default`, { method: 'POST' })
      if (response.ok) await fetchTemplates()
    } catch (error) { console.error(error) }
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Are you sure?')) return
    try {
      const endpoint = activeTab === 'email' ? 'email' : 'sms'
      const response = await fetch(`/api/admin/templates/${endpoint}/${id}`, { method: 'DELETE' })
      if (response.ok) await fetchTemplates()
    } catch (error) { console.error(error) }
  }

  const handleToggleActive = async (template: any) => {
    try {
      const endpoint = activeTab === 'email' ? 'email' : 'sms'
      const response = await fetch(`/api/admin/templates/${endpoint}/${template.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive })
      })
      if (response.ok) await fetchTemplates()
    } catch (error) { console.error(error) }
  }

  const handleSaveTemplate = async () => {
    try {
      const formData = activeTab === 'email' ? emailFormData : smsFormData
      if (!formData.name || (activeTab === 'email' && !emailFormData.subject) || (activeTab === 'sms' && !smsFormData.content)) {
        alert('Please fill required fields')
        return
      }
      const endpoint = activeTab === 'email' ? 'email' : 'sms'
      const url = editingTemplate ? `/api/admin/templates/${endpoint}/${editingTemplate.id}` : `/api/admin/templates/${endpoint}`
      const method = editingTemplate ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await fetchTemplates()
        handleCloseModal()
      }
    } catch (error) { console.error(error) }
  }

  const handleOpenModal = (template?: any) => {
    setPreviewMode(false)
    setAutoAddedVars([])
    if (template) {
      setEditingTemplate(template)
      if (activeTab === 'email') setEmailFormData({ ...template })
      else setSmsFormData({ ...template })
    } else {
      setEditingTemplate(null)
      const common = { name: '', variables: [], description: '', isActive: true, isDefault: false, isSystem: false, module: 'GLOBAL', category: 'NOTIFICATION' }
      setEmailFormData({ ...common, templateKey: '', subject: '', htmlContent: '', textContent: '' })
      setSmsFormData({ ...common, templateKey: '', content: '', maxLength: 160 })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingTemplate(null)
    setVariableInput('')
    setAutoAddedVars([])
  }

  // --- Logic for Variables ---

  const handleAddVariable = () => {
    if (variableInput.trim()) {
      const formattedVar = variableInput.trim().replace(/[^a-zA-Z0-9_]/g, '_')
      updateVariables(formattedVar)
      setVariableInput('')
    }
  }

  const handleRemoveVariable = (variable: string) => {
    if (activeTab === 'email') {
      setEmailFormData(prev => ({ ...prev, variables: prev.variables.filter(v => v !== variable) }))
    } else {
      setSmsFormData(prev => ({ ...prev, variables: prev.variables.filter(v => v !== variable) }))
    }
  }

  const insertVariable = (variable: string) => {
    const placeholder = `{{${variable}}}`
    if (activeTab === 'email') {
      setEmailFormData(prev => ({ ...prev, htmlContent: prev.htmlContent + placeholder }))
    } else {
      setSmsFormData(prev => ({ ...prev, content: prev.content + placeholder }))
    }
  }

  // Helper to safely add variables without duplicates
  const updateVariables = (newVars: string | string[]) => {
    const varsToAdd = Array.isArray(newVars) ? newVars : [newVars]
    
    if (activeTab === 'email') {
      const uniqueVars = Array.from(new Set([...emailFormData.variables, ...varsToAdd]))
      setEmailFormData(prev => ({ ...prev, variables: uniqueVars }))
    } else {
      const uniqueVars = Array.from(new Set([...smsFormData.variables, ...varsToAdd]))
      setSmsFormData(prev => ({ ...prev, variables: uniqueVars }))
    }
  }

  // --- SMART AUTO-DETECTION LOGIC ---
  const handleContentChange = (content: string, type: 'email' | 'sms') => {
    // 1. Regex to find {{variable_name}}
    // Matches: {{ var }} or {{var}}
    const regex = /{{\s*([a-zA-Z0-9_]+)\s*}}/g
    
    // 2. Extract all matches
    const matches = [...content.matchAll(regex)].map(m => m[1])
    
    // 3. Filter unique matches
    const uniqueMatches = Array.from(new Set(matches))
    
    if (uniqueMatches.length > 0) {
      // 4. Check against existing to detect NEW ones (for visual feedback)
      const currentVars = type === 'email' ? emailFormData.variables : smsFormData.variables
      const newFound = uniqueMatches.filter(v => !currentVars.includes(v))
      
      if (newFound.length > 0) {
        setAutoAddedVars(newFound)
        // Clear the "Just added" notification after 3 seconds
        setTimeout(() => setAutoAddedVars([]), 3000)
      }

      // 5. Update Form Data
      if (type === 'email') {
        setEmailFormData(prev => ({
           ...prev, 
           htmlContent: content,
           variables: Array.from(new Set([...prev.variables, ...uniqueMatches]))
        }))
      } else {
        setSmsFormData(prev => ({
           ...prev, 
           content: content,
           variables: Array.from(new Set([...prev.variables, ...uniqueMatches]))
        }))
      }
    } else {
      // Just update content if no vars found
      if (type === 'email') setEmailFormData(prev => ({ ...prev, htmlContent: content }))
      else setSmsFormData(prev => ({ ...prev, content: content }))
    }
  }

  // --- Render Helpers ---
  const filteredEmailTemplates = emailTemplates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.templateKey.toLowerCase().includes(searchTerm.toLowerCase()))
  const filteredSmsTemplates = smsTemplates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.templateKey.toLowerCase().includes(searchTerm.toLowerCase()))
  
  const getModuleStyle = (id: string) => MODULES.find(m => m.id === id)?.color || 'bg-gray-100'

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-slate-800">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Template Management</h1>
          <p className="text-slate-500 mt-2">Create and manage dynamic notifications for your system.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="group flex items-center px-6 py-3 bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 text-white rounded-xl font-bold transition-all hover:-translate-y-0.5 hover:shadow-green-300"
        >
          <Plus className="h-5 w-5 mr-2 group-hover:rotate-90 transition-transform duration-300" />
          New Template
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Email Templates', val: emailTemplates.length, icon: Mail, color: 'text-blue-600 bg-blue-50' },
          { label: 'SMS Templates', val: smsTemplates.length, icon: MessageSquare, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Default Templates', val: emailTemplates.filter(t => t.isDefault).length + smsTemplates.filter(t => t.isDefault).length, icon: Star, color: 'text-amber-500 bg-amber-50' },
          { label: 'Active System', val: emailTemplates.filter(t => t.isActive).length + smsTemplates.filter(t => t.isActive).length, icon: CheckCircle2, color: 'text-indigo-600 bg-indigo-50' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stat.val}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color}`}><stat.icon className="h-6 w-6" /></div>
            </div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row gap-6 justify-between items-start lg:items-center">
            <div className="bg-slate-100 p-1 rounded-xl inline-flex">
              <button onClick={() => setActiveTab("email")} className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "email" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <Mail className="h-4 w-4 mr-2" /> Email
              </button>
              <button onClick={() => setActiveTab("sms")} className={`flex items-center px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === "sms" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <MessageSquare className="h-4 w-4 mr-2" /> SMS
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none min-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                <input type="text" placeholder="Search templates..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
              </div>
              <select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 focus:border-emerald-500 outline-none cursor-pointer hover:bg-slate-100">
                <option value="all">All Modules</option>
                {MODULES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button onClick={() => setShowActiveOnly(!showActiveOnly)} className={`p-2.5 rounded-xl border transition-colors ${showActiveOnly ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`} title="Active Only">
                {showActiveOnly ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="p-6 bg-slate-50/50 min-h-[400px]">
          {((activeTab === 'email' ? filteredEmailTemplates : filteredSmsTemplates).length === 0) ? (
             <div className="flex flex-col items-center justify-center py-20 text-slate-400">
               <LayoutTemplate className="h-16 w-16 mb-4 opacity-50" />
               <p className="text-lg font-medium">No templates found</p>
             </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {(activeTab === 'email' ? filteredEmailTemplates : filteredSmsTemplates).map((template: any) => (
                <div key={template.id} className="group bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 relative overflow-hidden">
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${template.isActive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div className="pl-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-800">{template.name}</h3>
                          {template.isDefault && <Star className="h-4 w-4 text-amber-500 fill-amber-500" />}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${getModuleStyle(template.module)}`}>{template.module}</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{template.category.replace(/_/g, ' ')}</span>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                         <button onClick={() => handleToggleActive(template)} className={`p-2 rounded-lg transition-colors ${template.isActive ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                           {template.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                         </button>
                         {!template.isDefault && <button onClick={() => handleSetDefault(template.id)} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"><Star className="h-4 w-4" /></button>}
                         <button onClick={() => handleOpenModal(template)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="h-4 w-4" /></button>
                         {!template.isSystem && <button onClick={() => handleDeleteTemplate(template.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 flex items-center justify-between mb-4 font-mono text-xs text-slate-600">
                      <span>{template.templateKey}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-50 pt-3">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1"><Code className="h-3 w-3" /> {template.variables.length} vars</span>
                        {activeTab === 'sms' && <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> {template.content.length} chars</span>}
                      </div>
                      <span>Updated {new Date(template.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={handleCloseModal} />
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${activeTab === 'email' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'}`}>
                   {activeTab === 'email' ? <Mail className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{editingTemplate ? 'Edit Template' : 'Create Template'}</h2>
                  <p className="text-sm text-slate-500">Configure your {activeTab.toUpperCase()} notification</p>
                </div>
              </div>
              <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"><X className="h-6 w-6" /></button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Inputs */}
                <div className="flex-1 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Display Name *</label>
                      <input type="text" value={activeTab === 'email' ? emailFormData.name : smsFormData.name} onChange={(e) => activeTab === 'email' ? setEmailFormData({...emailFormData, name: e.target.value}) : setSmsFormData({...smsFormData, name: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" placeholder="e.g. Order Confirmation" />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-semibold text-slate-700">Template Key {editingTemplate && <span className="text-xs font-normal text-slate-400">(Locked)</span>}</label>
                       <input type="text" value={activeTab === 'email' ? emailFormData.templateKey : smsFormData.templateKey} onChange={(e) => { const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'); activeTab === 'email' ? setEmailFormData({...emailFormData, templateKey: val}) : setSmsFormData({...smsFormData, templateKey: val}) }} disabled={!!editingTemplate} className={`w-full px-4 py-2.5 rounded-xl border font-mono text-sm ${editingTemplate ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-50 border-slate-200 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none'}`} placeholder="MODULE_ACTION_NAME" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Module</label>
                      <select value={activeTab === 'email' ? emailFormData.module : smsFormData.module} onChange={(e) => activeTab === 'email' ? setEmailFormData({...emailFormData, module: e.target.value}) : setSmsFormData({...smsFormData, module: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none">
                         {MODULES.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700">Category</label>
                      <select value={activeTab === 'email' ? emailFormData.category : smsFormData.category} onChange={(e) => activeTab === 'email' ? setEmailFormData({...emailFormData, category: e.target.value}) : setSmsFormData({...smsFormData, category: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-emerald-500 outline-none">
                         {(activeTab === 'email' ? EMAIL_CATEGORIES : SMS_CATEGORIES).map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {activeTab === 'email' && (
                      <div className="space-y-2">
                         <label className="text-sm font-semibold text-slate-700">Subject Line</label>
                         <input type="text" value={emailFormData.subject} onChange={(e) => setEmailFormData({...emailFormData, subject: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none" />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between">
                       <label className="text-sm font-semibold text-slate-700">{activeTab === 'email' ? 'HTML Content' : 'Message Content'}</label>
                       {activeTab === 'email' && (
                         <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-medium">
                           <button onClick={() => setPreviewMode(false)} className={`px-3 py-1 rounded-md transition-all ${!previewMode ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Terminal className="h-3 w-3 inline mr-1" /> Code</button>
                           <button onClick={() => setPreviewMode(true)} className={`px-3 py-1 rounded-md transition-all ${previewMode ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Eye className="h-3 w-3 inline mr-1" /> Preview</button>
                         </div>
                       )}
                    </div>

                    <div className="relative">
                      {activeTab === 'email' ? (
                        previewMode ? (
                          <div className="w-full h-80 rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 text-xs text-slate-400 flex items-center gap-2">
                              <div className="flex gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-red-400"></div><div className="w-2.5 h-2.5 rounded-full bg-amber-400"></div><div className="w-2.5 h-2.5 rounded-full bg-green-400"></div></div>
                              <span className="ml-2">Preview Mode</span>
                            </div>
                            <div className="flex-1 p-4 overflow-y-auto prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailFormData.htmlContent || '<p class="text-gray-400 italic">No content to preview...</p>' }} />
                          </div>
                        ) : (
                          <textarea
                            value={emailFormData.htmlContent}
                            onChange={(e) => handleContentChange(e.target.value, 'email')}
                            rows={12}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-mono text-sm leading-relaxed"
                            placeholder="<html><body>...</body></html>"
                          />
                        )
                      ) : (
                        <textarea
                          value={smsFormData.content}
                          onChange={(e) => handleContentChange(e.target.value, 'sms')}
                          rows={6}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none font-mono text-sm"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${ (activeTab === 'email' ? emailFormData.isActive : smsFormData.isActive) ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-slate-300' }`}>
                         <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </div>
                      <input type="checkbox" className="hidden" checked={activeTab === 'email' ? emailFormData.isActive : smsFormData.isActive} onChange={(e) => activeTab === 'email' ? setEmailFormData({...emailFormData, isActive: e.target.checked}) : setSmsFormData({...smsFormData, isActive: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-700">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${ (activeTab === 'email' ? emailFormData.isDefault : smsFormData.isDefault) ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-300' }`}>
                         <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                      </div>
                      <input type="checkbox" className="hidden" checked={activeTab === 'email' ? emailFormData.isDefault : smsFormData.isDefault} onChange={(e) => activeTab === 'email' ? setEmailFormData({...emailFormData, isDefault: e.target.checked}) : setSmsFormData({...smsFormData, isDefault: e.target.checked})} />
                      <span className="text-sm font-medium text-slate-700">Set as Default</span>
                    </label>
                  </div>
                </div>

                {/* Right Column: Variables */}
                <div className="lg:w-80">
                   <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6 h-full sticky top-0 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-emerald-900 flex items-center gap-2"><Code className="h-4 w-4" /> Available Variables</h3>
                        {autoAddedVars.length > 0 && (
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-2 py-1 rounded-full animate-pulse font-semibold">
                            {autoAddedVars.length} Auto-Added!
                          </span>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mb-4">
                        <input type="text" value={variableInput} onChange={(e) => setVariableInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddVariable()} className="flex-1 min-w-0 px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:outline-none focus:border-emerald-500" placeholder="Add manual..." />
                        <button onClick={handleAddVariable} className="p-2 bg-white text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50"><Plus className="h-4 w-4" /></button>
                      </div>

                      <div className="flex flex-wrap gap-2 content-start">
                         {(activeTab === 'email' ? emailFormData.variables : smsFormData.variables).map(v => (
                           <div key={v} className={`group flex items-center gap-1 pl-2.5 pr-1 py-1 bg-white border rounded-md text-xs font-mono shadow-sm transition-all duration-300 ${autoAddedVars.includes(v) ? 'border-emerald-400 bg-emerald-50 scale-105' : 'border-emerald-200/60 text-emerald-700'}`}>
                             <span>{v}</span>
                             <div className="flex border-l border-emerald-100 ml-1.5 pl-1 gap-0.5">
                                <button onClick={() => insertVariable(v)} className="p-1 hover:bg-emerald-50 rounded text-emerald-600" title="Insert"><Copy className="h-3 w-3" /></button>
                                <button onClick={() => handleRemoveVariable(v)} className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-500" title="Remove"><X className="h-3 w-3" /></button>
                             </div>
                           </div>
                         ))}
                         {(activeTab === 'email' ? emailFormData.variables : smsFormData.variables).length === 0 && (
                            <div className="text-center w-full py-8 opacity-60">
                              <Wand2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                              <p className="text-xs text-emerald-800">Paste HTML with <code>{'{{vars}}'}</code> to auto-detect variables.</p>
                            </div>
                         )}
                      </div>
                   </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={handleCloseModal} className="px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={handleSaveTemplate} className="px-6 py-2.5 rounded-xl bg-gradient-to-tr from-green-500 to-emerald-600 text-white font-bold shadow-lg shadow-green-200 hover:shadow-xl hover:shadow-green-300 transition-all flex items-center gap-2"><Save className="h-4 w-4" /> {editingTemplate ? 'Save Changes' : 'Create Template'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}