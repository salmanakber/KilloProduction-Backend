"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Filter,
  Download,
  Plus,
  MessageSquare,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  Calendar,
  Tag,
  Send,
  Paperclip,
  MoreHorizontal,
} from "lucide-react"

interface Complaint {
  id: string
  ticketNumber: string
  subject: string
  description: string
  category: string
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
  user: {
    id: string
    name: string
    email: string
    phone: string
    role: string
  }
  createdAt: string
  updatedAt: string
  assignedTo?: string | null
  replies?: any[]
}

interface ComplaintMessage {
  id: string
  complaintId: string
  sender: "customer" | "admin" | "vendor"
  senderName: string
  message: string
  timestamp: string
  attachments?: string[]
}

export default function ComplaintsManagement() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null)
  const [complaintMessages, setComplaintMessages] = useState<ComplaintMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedPriority, setSelectedPriority] = useState("all")
  const [showFilters, setShowFilters] = useState(false)
  const [showComplaintDetail, setShowComplaintDetail] = useState(false)
  const [newMessage, setNewMessage] = useState("")

  useEffect(() => {
    fetchComplaints()
  }, [])

  const fetchComplaints = async () => {
    try {
      const params = new URLSearchParams()
      if (selectedStatus !== 'all') params.append('status', selectedStatus.toUpperCase())
      if (selectedPriority !== 'all') params.append('priority', selectedPriority.toUpperCase())
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      
      const response = await fetch(`/api/admin/support/tickets?${params.toString()}`)
      const data = await response.json()
      
      setComplaints(data.tickets || [])
      setLoading(false)
    } catch (error) {
      console.error("Error fetching tickets:", error)
      setComplaints([])
      setLoading(false)
    }
  }

  const fetchComplaintMessages = async (complaintId: string) => {
    try {
      const response = await fetch(`/api/admin/support/tickets/${complaintId}/replies`)
      const data = await response.json()
      
      // Map replies to ComplaintMessage format
      const messages: ComplaintMessage[] = data.replies?.map((reply: any) => ({
        id: reply.id,
        complaintId: complaintId,
        sender: reply.isAdmin ? "admin" : "customer",
        senderName: reply.user.name,
        message: reply.message,
        timestamp: reply.createdAt,
        attachments: reply.attachments ? JSON.parse(reply.attachments) : [],
      })) || []
      
      setComplaintMessages(messages)
    } catch (error) {
      console.error("Error fetching complaint messages:", error)
      setComplaintMessages([])
    }
  }

  const filteredComplaints = complaints.filter((complaint) => {
    const matchesSearch =
      complaint.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      complaint.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      complaint.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === "all" || complaint.category.toLowerCase() === selectedCategory
    const matchesStatus = selectedStatus === "all" || complaint.status.toLowerCase() === selectedStatus
    const matchesPriority = selectedPriority === "all" || complaint.priority.toLowerCase() === selectedPriority

    return matchesSearch && matchesCategory && matchesStatus && matchesPriority
  })

  const handleComplaintClick = (complaint: Complaint) => {
    setSelectedComplaint(complaint)
    setShowComplaintDetail(true)
    fetchComplaintMessages(complaint.id)
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedComplaint) return

    try {
      const response = await fetch(`/api/admin/support/tickets/${selectedComplaint.id}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: newMessage,
          isAdmin: true,
        })
      })

      if (response.ok) {
        const data = await response.json()
        
        // Add the new message to the list
        const newMsg: ComplaintMessage = {
          id: data.reply.id,
          complaintId: selectedComplaint.id,
          sender: "admin",
          senderName: data.reply.user.name,
          message: newMessage,
          timestamp: data.reply.createdAt,
        }

        setComplaintMessages((prev) => [...prev, newMsg])
        setNewMessage("")
        
        // Refresh complaints list to update status
        fetchComplaints()
      }
    } catch (error) {
      console.error("Error sending message:", error)
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "order":
        return "bg-blue-100 text-blue-800"
      case "delivery":
        return "bg-orange-100 text-orange-800"
      case "payment":
        return "bg-green-100 text-green-800"
      case "vendor":
        return "bg-purple-100 text-purple-800"
      case "app":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "urgent":
        return "bg-red-100 text-red-800"
      case "high":
        return "bg-orange-100 text-orange-800"
      case "medium":
        return "bg-yellow-100 text-yellow-800"
      case "low":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return "bg-yellow-100 text-yellow-800"
      case "in_progress":
        return "bg-blue-100 text-blue-800"
      case "resolved":
        return "bg-green-100 text-green-800"
      case "closed":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "open":
        return <Clock className="w-4 h-4 text-yellow-600" />
      case "in_progress":
        return <AlertTriangle className="w-4 h-4 text-blue-600" />
      case "resolved":
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case "escalated":
        return <AlertTriangle className="w-4 h-4 text-red-600" />
      default:
        return <Clock className="w-4 h-4 text-gray-600" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Complaints Management</h1>
          <p className="text-gray-600 mt-1">Handle and resolve customer complaints</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4 mr-2" />
            Export
          </button>
          <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            <Plus className="w-4 h-4 mr-2" />
            New Complaint
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Open</p>
              <p className="text-2xl font-bold text-gray-900">
                {complaints.filter((c) => c.status === "OPEN").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-blue-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">In Progress</p>
              <p className="text-2xl font-bold text-gray-900">
                {complaints.filter((c) => c.status === "IN_PROGRESS").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">
                {complaints.filter((c) => c.status === "RESOLVED").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Urgent</p>
              <p className="text-2xl font-bold text-gray-900">
                {complaints.filter((c) => c.priority === "URGENT").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search complaints..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent w-64"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Categories</option>
                  <option value="order">Order</option>
                  <option value="delivery">Delivery</option>
                  <option value="payment">Payment</option>
                  <option value="vendor">Vendor</option>
                  <option value="app">App</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assigned To</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent">
                  <option value="all">All Staff</option>
                  <option value="unassigned">Unassigned</option>
                  <option value="admin">Admin User</option>
                  <option value="support">Support Team</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Complaints List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Complaints ({filteredComplaints.length})</h3>
        </div>
        <div className="divide-y divide-gray-200">
          {filteredComplaints.map((complaint) => (
            <div
              key={complaint.id}
              className="p-6 hover:bg-gray-50 cursor-pointer"
              onClick={() => handleComplaintClick(complaint)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h4 className="text-lg font-medium text-gray-900">{complaint.subject}</h4>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(complaint.category)}`}
                    >
                      {complaint.category}
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(complaint.priority.toLowerCase())}`}
                    >
                      {complaint.priority}
                    </span>
                  </div>
                  <p className="text-gray-600 mb-3 line-clamp-2">{complaint.description}</p>
                  <div className="flex items-center space-x-6 text-sm text-gray-500">
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {complaint.user.name}
                    </div>
                    <div className="flex items-center">
                      <Tag className="w-4 h-4 mr-1" />
                      {complaint.ticketNumber}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {new Date(complaint.createdAt).toLocaleDateString()}
                    </div>
                    {complaint.assignedTo && (
                      <div className="flex items-center">
                        <User className="w-4 h-4 mr-1" />
                        Assigned to {complaint.assignedTo}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    {getStatusIcon(complaint.status)}
                    <span
                      className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(complaint.status)}`}
                    >
                      {complaint.status.replace("_", " ")}
                    </span>
                  </div>
                  <button className="text-gray-400 hover:text-gray-600">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredComplaints.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No complaints found</h3>
            <p className="text-gray-500">Try adjusting your search or filter criteria.</p>
          </div>
        )}
      </div>

      {/* Complaint Detail Modal */}
      {showComplaintDetail && selectedComplaint && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
              onClick={() => setShowComplaintDetail(false)}
            ></div>

            <div className="inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
              <div className="flex h-96">
                {/* Complaint Details */}
                <div className="w-1/2 p-6 border-r border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Complaint Details</h3>
                    <button onClick={() => setShowComplaintDetail(false)} className="text-gray-400 hover:text-gray-600">
                      ×
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900">{selectedComplaint.subject}</h4>
                      <p className="text-sm text-gray-500 mb-2">Ticket: {selectedComplaint.ticketNumber}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(selectedComplaint.category)}`}
                        >
                          {selectedComplaint.category}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(selectedComplaint.priority.toLowerCase())}`}
                        >
                          {selectedComplaint.priority}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedComplaint.status.toLowerCase())}`}
                        >
                          {selectedComplaint.status.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <p className="mt-1 text-sm text-gray-600">{selectedComplaint.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Customer</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedComplaint.user.name}</p>
                        <p className="text-sm text-gray-500">{selectedComplaint.user.email}</p>
                        <p className="text-sm text-gray-500">{selectedComplaint.user.phone}</p>
                        <p className="text-xs text-gray-400 mt-1">Role: {selectedComplaint.user.role}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Ticket Info</label>
                        <p className="mt-1 text-sm text-gray-900">Number: {selectedComplaint.ticketNumber}</p>
                        <p className="text-sm text-gray-500">Replies: {selectedComplaint.replies?.length || 0}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Created</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(selectedComplaint.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Last Updated</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(selectedComplaint.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Assigned To</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedComplaint.assignedTo || "Unassigned"}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="w-1/2 flex flex-col">
                  <div className="p-6 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Messages</h3>
                  </div>

                  <div className="flex-1 p-6 overflow-y-auto">
                    <div className="space-y-4">
                      {complaintMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender === "admin" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                              message.sender === "admin" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-900"
                            }`}
                          >
                            <p className="text-sm">{message.message}</p>
                            <p
                              className={`text-xs mt-1 ${
                                message.sender === "admin" ? "text-green-100" : "text-gray-500"
                              }`}
                            >
                              {message.senderName} • {new Date(message.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 border-t border-gray-200">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your response..."
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
                      />
                      <button className="text-gray-400 hover:text-gray-600">
                        <Paperclip className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleSendMessage}
                        className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
