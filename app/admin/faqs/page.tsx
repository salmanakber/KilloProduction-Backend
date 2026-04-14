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
  HelpCircle,
  ArrowUp,
  ArrowDown,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"

interface FAQ {
  id: string
  question: string
  answer: string
  category: string
  isActive: boolean
  order: number
  views: number
  helpful: number
  notHelpful: number
  tags: string[]
  createdAt: string
  updatedAt: string
}

const FAQ_CATEGORIES = [
  { id: 'general', name: 'General', color: '#6366F1' },
  { id: 'account', name: 'Account', color: '#8B5CF6' },
  { id: 'payment', name: 'Payment', color: '#10B981' },
  { id: 'order', name: 'Orders', color: '#F59E0B' },
  { id: 'technical', name: 'Technical', color: '#EF4444' },
  { id: 'pharmacy', name: 'Pharmacy', color: '#EC4899' },
]

export default function FAQManagement() {
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null)
  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'general',
    isActive: true,
    order: 0,
    tags: [] as string[],
  })
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    fetchFAQs()
  }, [selectedCategory, showActiveOnly])

  const fetchFAQs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      if (showActiveOnly) params.append('isActive', 'true')
      
      const response = await fetch(`/api/admin/support/faqs?${params.toString()}`)
      const data = await response.json()
      
      setFaqs(data.faqs || [])
    } catch (error) {
      console.error("Error fetching FAQs:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (faq?: FAQ) => {
    if (faq) {
      setEditingFaq(faq)
      setFormData({
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        isActive: faq.isActive,
        order: faq.order,
        tags: Array.isArray(faq.tags) ? faq.tags : [],
      })
    } else {
      setEditingFaq(null)
      setFormData({
        question: '',
        answer: '',
        category: 'general',
        isActive: true,
        order: faqs.length,
        tags: [],
      })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingFaq(null)
    setFormData({
      question: '',
      answer: '',
      category: 'general',
      isActive: true,
      order: 0,
      tags: [],
    })
    setTagInput('')
  }

  const handleSaveFAQ = async () => {
    try {
      if (!formData.question || !formData.answer) {
        alert('Please fill in all required fields')
        return
      }

      const url = editingFaq 
        ? `/api/admin/support/faqs/${editingFaq.id}` 
        : '/api/admin/support/faqs'
      
      const method = editingFaq ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      if (response.ok) {
        await fetchFAQs()
        handleCloseModal()
      }
    } catch (error) {
      console.error("Error saving FAQ:", error)
    }
  }

  const handleDeleteFAQ = async (id: string) => {
    if (!confirm('Are you sure you want to delete this FAQ?')) return

    try {
      const response = await fetch(`/api/admin/support/faqs/${id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchFAQs()
      }
    } catch (error) {
      console.error("Error deleting FAQ:", error)
    }
  }

  const handleToggleActive = async (faq: FAQ) => {
    try {
      const response = await fetch(`/api/admin/support/faqs/${faq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !faq.isActive })
      })

      if (response.ok) {
        await fetchFAQs()
      }
    } catch (error) {
      console.error("Error toggling FAQ status:", error)
    }
  }

  const handleReorderFAQ = async (faq: FAQ, direction: 'up' | 'down') => {
    try {
      const newOrder = direction === 'up' ? faq.order - 1 : faq.order + 1
      
      const response = await fetch(`/api/admin/support/faqs/${faq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder })
      })

      if (response.ok) {
        await fetchFAQs()
      }
    } catch (error) {
      console.error("Error reordering FAQ:", error)
    }
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] })
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) })
  }

  const filteredFAQs = faqs.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 space-y-8 font-sans text-slate-800">
      
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">FAQ Manager</h1>
          <p className="text-slate-500 mt-1">Manage, organize, and track your frequently asked questions.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="inline-flex items-center px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg shadow-sm hover:shadow transition-all duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-green-600"
        >
          <HelpCircle className="w-5 h-5 mr-2" />
          Add New FAQ
        </button>
      </div>
  
      {/* Stats Cards - Added gradients and hover lifts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { 
            label: 'Total FAQs', 
            value: faqs.length, 
            icon: HelpCircle, 
            color: 'blue', 
            bg: 'bg-blue-50', 
            text: 'text-blue-600' 
          },
          { 
            label: 'Active Now', 
            value: faqs.filter(f => f.isActive).length, 
            icon: Eye, 
            color: 'green', 
            bg: 'bg-green-50', 
            text: 'text-green-600' 
          },
          { 
            label: 'Total Views', 
            value: faqs.reduce((sum, f) => sum + f.views, 0).toLocaleString(), 
            icon: Eye, 
            color: 'purple', 
            bg: 'bg-purple-50', 
            text: 'text-purple-600' 
          },
          { 
            label: 'Helpfulness', 
            value: `${faqs.length > 0 ? Math.round((faqs.reduce((sum, f) => sum + f.helpful, 0) / (faqs.reduce((sum, f) => sum + f.helpful + f.notHelpful, 0) || 1)) * 100) : 0}%`, 
            icon: ThumbsUp, 
            color: 'orange', 
            bg: 'bg-orange-50', 
            text: 'text-orange-600' 
          },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
              </div>
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.text}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
  
      {/* Filters Bar - Cleaner inputs and focus states */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="flex-1 relative group">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-green-600 transition-colors h-5 w-5" />
            <input
              type="text"
              placeholder="Search questions, answers, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-full bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-green-500/20 focus:bg-white transition-all placeholder:text-slate-400 text-slate-700"
            />
          </div>
  
          <div className="flex items-center gap-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-50 border-none text-slate-700 text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-green-500/20 cursor-pointer hover:bg-slate-100 transition-colors"
            >
              <option value="all">All Categories</option>
              {FAQ_CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            
            <button
              onClick={() => setShowActiveOnly(!showActiveOnly)}
              className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                showActiveOnly 
                  ? 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-600/20' 
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {showActiveOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
              {showActiveOnly ? 'Active Only' : 'Show All'}
            </button>
          </div>
        </div>
      </div>
  
      {/* FAQs List - Card Stack Layout */}
      <div className="space-y-4">
        {filteredFAQs.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center">
            <div className="mx-auto h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No FAQs found</h3>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">
              We couldn't find any FAQs matching your current filters. Try adjusting your search or create a new one.
            </p>
            <button
              onClick={() => {setSearchTerm(''); setSelectedCategory('all');}}
              className="mt-6 text-green-600 font-medium hover:text-green-700 hover:underline"
            >
              Clear all filters
            </button>
          </div>
        ) : (
          filteredFAQs.map((faq, index) => (
            <div 
              key={faq.id} 
              className={`group bg-white rounded-2xl p-5 border transition-all duration-200 ${
                faq.isActive ? 'border-slate-200 hover:border-green-300 shadow-sm hover:shadow-md' : 'border-slate-100 bg-slate-50/50 opacity-75'
              }`}
            >
              <div className="flex items-start gap-5">
                
                {/* Drag/Order Handle Visual */}
                <div className="flex flex-col items-center justify-center space-y-1 mt-1">
                  <button
                    onClick={() => handleReorderFAQ(faq, 'up')}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 hover:bg-slate-100 rounded transition-colors"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-mono font-medium text-slate-400">
                    {String(faq.order).padStart(2, '0')}
                  </span>
                  <button
                    onClick={() => handleReorderFAQ(faq, 'down')}
                    disabled={index === filteredFAQs.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 hover:bg-slate-100 rounded transition-colors"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
  
                {/* Main Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ring-1 ring-inset"
                      style={{
                        backgroundColor: `${FAQ_CATEGORIES.find(c => c.id === faq.category)?.color}15`, // 15 is approx 10% opacity hex
                        color: FAQ_CATEGORIES.find(c => c.id === faq.category)?.color,
                        ringColor: `${FAQ_CATEGORIES.find(c => c.id === faq.category)?.color}40`
                      }}
                    >
                      {FAQ_CATEGORIES.find(c => c.id === faq.category)?.name || faq.category}
                    </span>
                    
                    {!faq.isActive && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/20">
                        Inactive
                      </span>
                    )}
                    
                    <h4 className={`text-lg font-semibold truncate ${faq.isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                      {faq.question}
                    </h4>
                  </div>
  
                  <p className="text-slate-600 text-sm leading-relaxed mb-4 line-clamp-2">
                    {faq.answer}
                  </p>
  
                  {/* Footer Metadata */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
                    <div className="flex items-center gap-1.5" title="Views">
                      <Eye className="w-3.5 h-3.5" />
                      <span className="font-medium">{faq.views}</span>
                    </div>
                    <div className="h-3 w-px bg-slate-300"></div>
                    <div className="flex items-center gap-1.5 text-green-600" title="Helpful">
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span className="font-medium">{faq.helpful}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-red-500" title="Not Helpful">
                      <ThumbsDown className="w-3.5 h-3.5" />
                      <span className="font-medium">{faq.notHelpful}</span>
                    </div>
  
                    {Array.isArray(faq.tags) && faq.tags.length > 0 && (
                      <>
                        <div className="h-3 w-px bg-slate-300 hidden sm:block"></div>
                        <div className="flex items-center flex-wrap gap-2">
                          {faq.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium tracking-wide uppercase">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
  
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => handleToggleActive(faq)}
                    className={`p-2 rounded-lg transition-colors ${
                      faq.isActive 
                        ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' 
                        : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title={faq.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {faq.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleOpenModal(faq)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Edit"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteFAQ(faq.id)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
  
      {/* Modal - Backdrop Blur & Clean Design */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
            onClick={handleCloseModal}
          />
  
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl transform transition-all relative flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingFaq ? 'Edit FAQ' : 'Create New FAQ'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">Fill in the details below</p>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
  
            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Question */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Question</label>
                <input
                  type="text"
                  value={formData.question}
                  onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                  placeholder="e.g., How do I reset my password?"
                />
              </div>
  
              {/* Category & Order Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all appearance-none cursor-pointer"
                  >
                    {FAQ_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
  
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Sort Order</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                  />
                </div>
              </div>
  
              {/* Answer */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Answer</label>
                <textarea
                  value={formData.answer}
                  onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all resize-y"
                  placeholder="Provide a helpful and detailed answer..."
                />
              </div>
  
              {/* Tags Input */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all"
                    placeholder="Type tag & press Enter"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-5 py-2.5 bg-slate-800 text-white rounded-xl hover:bg-slate-900 font-medium transition-colors"
                  >
                    Add
                  </button>
                </div>
                
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {formData.tags.map(tag => (
                      <span
                        key={tag}
                        className="inline-flex items-center px-3 py-1 bg-white text-slate-700 border border-slate-200 rounded-lg text-sm shadow-sm"
                      >
                        {tag}
                        <button
                          onClick={() => handleRemoveTag(tag)}
                          className="ml-2 text-slate-400 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
  
              {/* Status Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-sm font-semibold text-slate-900">Visibility Status</span>
                  <span className="block text-xs text-slate-500">Hide or show this FAQ to users</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
              </div>
            </div>
  
            {/* Modal Footer */}
            <div className="px-6 py-5 border-t border-slate-100 flex items-center justify-end gap-3 rounded-b-2xl bg-slate-50/50">
              <button
                onClick={handleCloseModal}
                className="px-5 py-2.5 text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 font-medium transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveFAQ}
                className="px-5 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 font-medium shadow-sm shadow-green-200 transition-all flex items-center"
              >
                <Save className="h-4 w-4 mr-2" />
                {editingFaq ? 'Save Changes' : 'Create FAQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

