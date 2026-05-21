"use client"

import { useState, useEffect, type ReactNode } from "react"
import {
  Globe,
  Shield,
  Bell,
  CreditCard,
  Database,
  Mail,
  DollarSign,
  Percent,
  Save,
  RefreshCw,
  AlertTriangle,
  Gift,
  Check,
  ChevronRight,
  Lock,
  Clock,
  Server,
  Key,
  Smartphone,
  ExternalLink,
} from "lucide-react"

import { toast } from "@/hooks/use-toast"

// --- [Interfaces] ---
interface SystemSettings {
  general: {
    appName: string
    appVersion: string
    timezone: string
    language: string
    currency: string
    dateFormat: string
    maintenanceMode: boolean
    maintenanceMessage: string
  }
  tts: {
    baseUrl: string
    voice: string
  }
  security: {
    passwordPolicy: {
      minLength: number
      requireUppercase: boolean
      requireLowercase: boolean
      requireNumbers: boolean
      requireSpecialChars: boolean
      maxAge: number
    }
    sessionTimeout: number
    maxLoginAttempts: number
    lockoutDuration: number
    twoFactorRequired: boolean
    ipWhitelist: string[]
  }
  notifications: {
    emailEnabled: boolean
    smsEnabled: boolean
    pushEnabled: boolean
    emailProvider: string
    smsProvider: string
    defaultSender: string
    bravoEmail: string
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPass: string
    smtpSecure: boolean
    smtpFrom: string
    smtpRejectUnauthorized: boolean
    brevoApiKey: string
    sendgridApiKey: string
    mailgunApiKey: string
    mailgunDomain: string
    sesAccessKeyId: string
    sesSecretAccessKey: string
    sesRegion: string
    twilioAccountSid: string
    twilioAuthToken: string
    twilioPhoneNumber: string
    nexmoApiKey: string
    nexmoApiSecret: string
    nexmoFromNumber: string
    africasTalkingApiKey: string
    africasTalkingUsername: string
    templates: {
      welcome: string
      orderConfirmation: string
      passwordReset: string
    }
    /** BullMQ worker: marketing / rider bonus AI (also in DB columns on system_settings). */
    marketingAutomationAiEnabled: boolean
    marketingAutomationAiMaxCandidates: number
    riderBonusAiEnabled: boolean
  }
  payments: {
    defaultCurrency: string
    pricePerKm: number
    commissionRates: {
      pharmacy: number
      autoParts: number
      food: number
      grocery: number
      riding: number
    }
    paymentMethods: string[] | Record<string, unknown>
    /** Populated by GET /api/admin/settings; do not send on PUT (server ignores). */
    checkoutGateway?: {
      primary: string
      fallback: string | null
      storedPrimary: string | null
    } | null
    minimumWithdrawal: number
    withdrawalFee: number
    processingTime: string
  }
  modules: {
    pharmacy: { enabled: boolean; autoApproval: boolean; requirePrescription: boolean; deliveryRadius: number }
    autoParts: { enabled: boolean; autoApproval: boolean; warrantyRequired: boolean; returnPeriod: number }
    food: { enabled: boolean; autoApproval: boolean; maxDeliveryTime: number; qualityChecks: boolean }
    grocery: { enabled: boolean; autoApproval: boolean; freshnessPeriod: number; bulkOrders: boolean }
    riding: { enabled: boolean; autoApproval: boolean; backgroundCheck: boolean; insuranceRequired: boolean }
  }
  loyaltyPoints: {
    [key: string]: {
      enabled: boolean
      formula: string
      minimumOrderAmount?: number
      maximumPointsPerOrder?: number
      pointsExpiryDays?: number
    }
  }
  compnyinfo: {
    company: {
      name: string
      address: string | object
      contact: string | object
      description: string
    }
    supportCenter: {
      email: string
      phone: string
      liveChat: boolean
      whatsapp: string
      workingHours: string | object
    }
    location?: {
      countryCode: string
      restrictAutocomplete: boolean
      googleMapsApiKey?: string
      mapsApiKeySource?: "database" | "env" | "none"
    }
    ridingEmergencyContacts?: Array<{
      id: string
      name: string
      number: string
      icon?: string
    }>
  }
  customerOAuth?: {
    google?: { enabled?: boolean; webClientId?: string; iosClientId?: string; androidClientId?: string }
    facebook?: { enabled?: boolean; appId?: string; appSecret?: string }
  }
  moneyReceiptWhatsapp: {
    enabled: boolean
    phoneNumberId: string
    apiVersion: string
    wabaId: string
    messageTemplate: string
    templateName: string
    templateLanguage: string
    hasAccessToken: boolean
    accessToken: string
  }
}

type ModuleSettings = SystemSettings["modules"]

// --- [Extracted Design Components to Fix Focus Issue] ---
const ToggleSwitch = ({ checked, onChange, label, description }: { checked: boolean, onChange: (checked: boolean) => void, label: string, description?: string }) => (
  <div className="flex items-center justify-between py-3">
    <div className="flex flex-col pr-4">
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      {description && <span className="text-xs text-gray-500 mt-0.5">{description}</span>}
    </div>
    <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
    </label>
  </div>
)

const InputGroup = ({ label, children, subtext, className = "" }: { label: string, children: ReactNode, subtext?: ReactNode, className?: string }) => (
  <div className={`space-y-1.5 w-full ${className}`}>
    <label className="block text-sm font-semibold text-gray-800">{label}</label>
    {children}
    {subtext != null && subtext !== "" && (
      <div className="text-xs text-gray-500 leading-snug">{subtext}</div>
    )}
  </div>
)

const TextInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    {...props} 
    className={`w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl hover:bg-white focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-sm text-gray-900 placeholder:text-gray-400 shadow-sm ${props.className || ''}`}
  />
)

const SelectInput = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    {...props}
    className={`w-full px-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl hover:bg-white focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all outline-none text-sm text-gray-900 shadow-sm appearance-none ${props.className || ''}`}
  >
    {props.children}
  </select>
)

export default function SystemSettings() {
  const [settings, setSettings] = useState<SystemSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("general")
  const [hasChanges, setHasChanges] = useState(false)
  const [currency, setCurrency] = useState('₦')

  useEffect(() => {
    if (typeof window === "undefined") return
    const p = new URLSearchParams(window.location.search)
    if (p.get("tab") === "notifications" || p.get("moneyReceipts") === "1") {
      setActiveTab("notifications")
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings")
      const data = await response.json()
      const s = data.settings
      const defaultWa = {
        enabled: false,
        phoneNumberId: "",
        apiVersion: "v21.0",
        wabaId: "",
        messageTemplate:
          "Your SuperKillo money transfer receipt for {{reference}}. Amount: {{amount}} {{currency}}.",
        templateName: "",
        templateLanguage: "en",
        hasAccessToken: false,
        accessToken: "",
      }
      setSettings({
        ...s,
        moneyReceiptWhatsapp: { ...defaultWa, ...(s.moneyReceiptWhatsapp || {}) },
        compnyinfo: {
          ...s.compnyinfo,
          ridingEmergencyContacts:
            s.compnyinfo?.ridingEmergencyContacts?.length > 0
              ? s.compnyinfo.ridingEmergencyContacts
              : [
                  { id: "police", name: "Police", number: "199", icon: "call" },
                  { id: "ambulance", name: "Ambulance", number: "199", icon: "medical" },
                  { id: "fire", name: "Fire Service", number: "199", icon: "flame" },
                ],
        },
      })
      setCurrency(data.defaultCurrencyCode)
    } catch (error) {
      console.error("Failed to fetch settings:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (response.ok) {
        setHasChanges(false)
        toast({ title: "Success", description: "Settings saved successfully" })
      } else {
        const body = await response.json().catch(() => ({}))
        toast({
          title: "Save failed",
          description: (body as { error?: string })?.error || `Server returned ${response.status}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to save settings:", error)
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const updateSettings = (section: string, field: string, value: any) => {
    setSettings((prev) => prev ? { ...prev, [section]: { ...prev[section as keyof SystemSettings], [field]: value } } : prev)
    setHasChanges(true)
  }

  const updateNestedSettings = (section: string, subsection: string, field: string, value: any) => {
    setSettings((prev) => {
      if (!prev) return prev
      const sectionData = prev[section as keyof SystemSettings] as any
      if (section === "loyaltyPoints") {
        return { ...prev, [section]: { ...sectionData, [subsection]: { ...(sectionData?.[subsection] || {}), [field]: value } } }
      }
      return { ...prev, [section]: { ...(sectionData || {}), [subsection]: { ...(sectionData?.[subsection] || {}), [field]: value } } }
    })
    setHasChanges(true)
  }

  const updateDeepNestedSettings = (section: string, subsection: string, subsubsection: string, field: string, value: any) => {
    setSettings((prev) => {
      if (!prev) return prev
      const sectionData = prev[section as keyof SystemSettings] as any
      const subsectionData = sectionData?.[subsection] || {}
      const subsubsectionData = subsectionData[subsubsection] || {}
      return { ...prev, [section]: { ...(sectionData || {}), [subsection]: { ...subsectionData, [subsubsection]: { ...subsubsectionData, [field]: value } } } }
    })
    setHasChanges(true)
  }

  const patchMoneyReceiptWhatsapp = (field: string, value: unknown) => {
    setSettings((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        moneyReceiptWhatsapp: { ...prev.moneyReceiptWhatsapp, [field]: value },
      }
    })
    setHasChanges(true)
  }

  if (loading) return <div className="flex justify-center items-center h-screen bg-gray-50"><div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div></div>
  if (!settings) return null

  const tabs = [
    { id: "general", label: "General", icon: Globe, description: "Basic app details" },
    { id: "security", label: "Security", icon: Shield, description: "Passwords & access" },
    { id: "notifications", label: "Notifications", icon: Bell, description: "Email, SMS & Push" },
    { id: "payments", label: "Payments", icon: CreditCard, description: "Fees & commissions" },
    { id: "modules", label: "Modules", icon: Database, description: "Service configuration" },
    { id: "loyaltyPoints", label: "Loyalty Points", icon: Gift, description: "Rewards system" },
  ]

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/80 p-5 md:p-6 rounded-2xl border border-gray-200/60 shadow-sm sticky top-4 z-20 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">System Settings</h1>
            <p className="text-gray-500 mt-1 text-sm">Manage global configurations and preferences</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchSettings}
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </button>
            <button
              onClick={handleSaveSettings}
              disabled={!hasChanges || saving}
              className={`inline-flex items-center px-5 py-2 text-sm font-medium rounded-xl transition-all focus:ring-2 focus:ring-offset-2 focus:ring-green-500 ${
                !hasChanges 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : saving 
                    ? 'bg-green-600/80 text-white cursor-wait' 
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-500/20'
              }`}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Changes Alert */}
        {hasChanges && (
          <div className="flex items-center p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="h-5 w-5 mr-3 flex-shrink-0 text-amber-600" />
            <span className="text-sm font-medium">You have unsaved changes. Review your changes before leaving.</span>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
          
          {/* Sidebar */}
          <nav className="w-full lg:w-72 flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sticky top-32">
            <div className="flex flex-col gap-1.5">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center p-3 rounded-xl transition-all duration-200 group text-left ${
                      isActive 
                        ? "bg-green-50/70 text-green-800 shadow-sm ring-1 ring-green-100" 
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-green-500 rounded-r-full" />}
                    <div className={`p-2 rounded-lg mr-3 transition-colors ${isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 group-hover:bg-white group-hover:text-gray-700'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <span className={`block text-sm ${isActive ? 'font-bold' : 'font-semibold'}`}>{tab.label}</span>
                      <span className={`text-xs ${isActive ? 'text-green-600/80 font-medium' : 'text-gray-400'}`}>{tab.description}</span>
                    </div>
                    {isActive && <ChevronRight className="h-4 w-4 ml-auto text-green-600" />}
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 w-full min-w-0 space-y-6 pb-20">
            
            {/* --- GENERAL TAB --- */}
            {activeTab === "general" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                
                {/* App Details Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Globe className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">App Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="App Name">
                        <TextInput value={settings.general.appName} onChange={(e) => updateSettings("general", "appName", e.target.value)} />
                      </InputGroup>
                      <InputGroup label="App Version">
                        <TextInput value={settings.general.appVersion} onChange={(e) => updateSettings("general", "appVersion", e.target.value)} />
                      </InputGroup>
                      <InputGroup label="Timezone">
                        <SelectInput value={settings.general.timezone} onChange={(e) => updateSettings("general", "timezone", e.target.value)}>
                          <option value="UTC">UTC</option>
                          <option value="Africa/Lagos">Africa/Lagos</option>
                          <option value="America/New_York">America/New_York</option>
                          <option value="Europe/London">Europe/London</option>
                        </SelectInput>
                      </InputGroup>
                      <InputGroup label="Currency">
                        <SelectInput value={settings.general.currency} onChange={(e) => updateSettings("general", "currency", e.target.value)}>
                          <option value="NGN">Nigerian Naira (₦)</option>
                          <option value="USD">US Dollar ($)</option>
                          <option value="EUR">Euro (€)</option>
                          <option value="GBP">British Pound (£)</option>
                        </SelectInput>
                      </InputGroup>
                    </div>
                  </div>
                </div>

                {/* Company Information Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Shield className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Company Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                      <InputGroup label="Company Name">
                        <TextInput value={settings.compnyinfo?.company?.name || ""} onChange={(e) => updateNestedSettings("compnyinfo", "company", "name", e.target.value)} />
                      </InputGroup>
                      <InputGroup label="Company Description">
                        <TextInput value={settings.compnyinfo?.company?.description || ""} onChange={(e) => updateNestedSettings("compnyinfo", "company", "description", e.target.value )} />
                      </InputGroup>
                    </div>

                    <div className="mb-8 p-6 bg-gray-50/60 rounded-2xl border border-gray-100">
                      <h4 className="text-xs font-bold text-gray-800 mb-5 uppercase tracking-wider flex items-center gap-2">Company Address</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="md:col-span-2">
                          <InputGroup label="Street">
                            <TextInput value={(typeof settings.compnyinfo?.company?.address === 'object' && settings.compnyinfo?.company?.address !== null) ? (settings.compnyinfo.company.address as any).street || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "address", "street", e.target.value)} placeholder="123 Main Street" />
                          </InputGroup>
                        </div>
                        <InputGroup label="City">
                          <TextInput value={(typeof settings.compnyinfo?.company?.address === 'object' && settings.compnyinfo?.company?.address !== null) ? (settings.compnyinfo.company.address as any).city || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "address", "city", e.target.value)} placeholder="Karachi" />
                        </InputGroup>
                        <InputGroup label="State/Province">
                          <TextInput value={(typeof settings.compnyinfo?.company?.address === 'object' && settings.compnyinfo?.company?.address !== null) ? (settings.compnyinfo.company.address as any).state || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "address", "state", e.target.value)} placeholder="Sindh" />
                        </InputGroup>
                        <InputGroup label="Country">
                          <TextInput value={(typeof settings.compnyinfo?.company?.address === 'object' && settings.compnyinfo?.company?.address !== null) ? (settings.compnyinfo.company.address as any).country || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "address", "country", e.target.value)} placeholder="Pakistan" />
                        </InputGroup>
                        <InputGroup label="Postal Code">
                          <TextInput value={(typeof settings.compnyinfo?.company?.address === 'object' && settings.compnyinfo?.company?.address !== null) ? (settings.compnyinfo.company.address as any).postalCode || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "address", "postalCode", e.target.value)} placeholder="75000" />
                        </InputGroup>
                      </div>
                    </div>

                    <div className="p-6 bg-gray-50/60 rounded-2xl border border-gray-100">
                      <h4 className="text-xs font-bold text-gray-800 mb-5 uppercase tracking-wider flex items-center gap-2">Company Contact</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <InputGroup label="Email">
                          <TextInput type="email" value={(typeof settings.compnyinfo?.company?.contact === 'object' && settings.compnyinfo?.company?.contact !== null) ? (settings.compnyinfo.company.contact as any).email || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "contact", "email", e.target.value)} placeholder="info@company.com" />
                        </InputGroup>
                        <InputGroup label="Phone">
                          <TextInput value={(typeof settings.compnyinfo?.company?.contact === 'object' && settings.compnyinfo?.company?.contact !== null) ? (settings.compnyinfo.company.contact as any).phone || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "contact", "phone", e.target.value)} placeholder="+92 300 1234567" />
                        </InputGroup>
                        <InputGroup label="Website">
                          <TextInput value={(typeof settings.compnyinfo?.company?.contact === 'object' && settings.compnyinfo?.company?.contact !== null) ? (settings.compnyinfo.company.contact as any).website || "" : ""} onChange={(e) => updateDeepNestedSettings("compnyinfo", "company", "contact", "website", e.target.value)} placeholder="https://company.com" />
                        </InputGroup>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Support Center & Maintenance */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Smartphone className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Support Center</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <InputGroup label="Support Email">
                        <TextInput type="email" value={settings.compnyinfo?.supportCenter?.email || ""} onChange={(e) => updateNestedSettings("compnyinfo", "supportCenter", "email", e.target.value)} placeholder="support@company.com" />
                      </InputGroup>
                      <InputGroup label="Support Phone">
                        <TextInput value={settings.compnyinfo?.supportCenter?.phone || ""} onChange={(e) => updateNestedSettings("compnyinfo", "supportCenter", "phone", e.target.value)} placeholder="+92 300 9876543" />
                      </InputGroup>
                      <InputGroup label="WhatsApp Number">
                        <TextInput value={settings.compnyinfo?.supportCenter?.whatsapp || ""} onChange={(e) => updateNestedSettings("compnyinfo", "supportCenter", "whatsapp", e.target.value)} placeholder="+92 300 9876543" />
                      </InputGroup>
                    </div>

                    <div className="mb-6 p-6 bg-gray-50/60 rounded-2xl border border-gray-100">
                      <h4 className="text-xs font-bold text-gray-800 mb-5 uppercase tracking-wider">Business Hours</h4>
                      
                      {(() => {
                        const timeOptions = [
                          "12:00 AM", "12:30 AM", "1:00 AM", "1:30 AM", "2:00 AM", "2:30 AM", "3:00 AM", "3:30 AM", "4:00 AM", "4:30 AM", "5:00 AM", "5:30 AM",
                          "6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
                          "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM", "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM", "5:00 PM", "5:30 PM",
                          "6:00 PM", "6:30 PM", "7:00 PM", "7:30 PM", "8:00 PM", "8:30 PM", "9:00 PM", "9:30 PM", "10:00 PM", "10:30 PM", "11:00 PM", "11:30 PM"
                        ];

                        const renderDayRow = (label: string, dayKey: string, dotColor: string) => {
                          const workingHoursObj = typeof settings.compnyinfo?.supportCenter?.workingHours === 'object' && settings.compnyinfo?.supportCenter?.workingHours !== null 
                            ? settings.compnyinfo.supportCenter.workingHours as Record<string, string> 
                            : {};
                          
                          const rawValue = workingHoursObj[dayKey] || "Closed";
                          const isClosed = rawValue === "Closed";
                          const is24Hours = rawValue === "24 Hours";
                          const isOpen = !isClosed && !is24Hours;
                          
                          let openTime = "9:00 AM";
                          let closeTime = "6:00 PM";
                          if (isOpen && rawValue.includes("-")) {
                            const parts = rawValue.split("-");
                            openTime = parts[0].trim();
                            closeTime = parts[1].trim();
                          }

                          const handleStatusChange = (newStatus: string) => {
                            setSettings((prev) => {
                              if (!prev) return prev
                              const currentWH = typeof prev.compnyinfo?.supportCenter?.workingHours === 'object' ? prev.compnyinfo.supportCenter.workingHours as Record<string, string> : {}
                              return { ...prev, compnyinfo: { ...prev.compnyinfo, supportCenter: { ...prev.compnyinfo?.supportCenter, workingHours: { ...currentWH, [dayKey]: newStatus === "Open" ? "9:00 AM - 6:00 PM" : newStatus } } } }
                            })
                            setHasChanges(true)
                          };

                          const handleTimeChange = (type: string, value: string) => {
                            setSettings((prev) => {
                              if (!prev) return prev
                              const currentWH = typeof prev.compnyinfo?.supportCenter?.workingHours === 'object' ? prev.compnyinfo.supportCenter.workingHours as Record<string, string> : {}
                              const currentVal = currentWH[dayKey] || "9:00 AM - 6:00 PM"
                              let cOpen = "9:00 AM", cClose = "6:00 PM"
                              if (typeof currentVal === 'string' && currentVal.includes("-")) {
                                const parts = currentVal.split("-")
                                cOpen = parts[0].trim(); cClose = parts[1].trim()
                              }
                              return { ...prev, compnyinfo: { ...prev.compnyinfo, supportCenter: { ...prev.compnyinfo?.supportCenter, workingHours: { ...currentWH, [dayKey]: `${type === "open" ? value : cOpen} - ${type === "close" ? value : cClose}` } } } }
                            })
                            setHasChanges(true)
                          };

                          return (
                            <div key={dayKey} className="flex flex-col xl:flex-row xl:items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                              <div className="w-40 font-semibold text-gray-700 flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></span>{label}
                              </div>
                              <div className="flex-1 flex flex-wrap items-center gap-3">
                                {isOpen ? (
                                  <>
                                    <SelectInput value={openTime} onChange={(e) => handleTimeChange("open", e.target.value)} className="!w-36 py-2">
                                      {timeOptions.map(t => <option key={`open-${t}`} value={t}>{t}</option>)}
                                    </SelectInput>
                                    <span className="text-gray-400 font-medium text-sm">to</span>
                                    <SelectInput value={closeTime} onChange={(e) => handleTimeChange("close", e.target.value)} className="!w-36 py-2">
                                      {timeOptions.map(t => <option key={`close-${t}`} value={t}>{t}</option>)}
                                    </SelectInput>
                                  </>
                                ) : (
                                  <div className="px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm text-gray-500 font-medium w-full max-w-[325px] text-center shadow-inner">
                                    {isClosed ? "Currently Closed" : "Open 24 Hours"}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button type="button" onClick={() => handleStatusChange("Open")} className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${isOpen ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Open</button>
                                <button type="button" onClick={() => handleStatusChange("Closed")} className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${isClosed ? 'bg-red-500 text-white shadow-sm' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}>Closed</button>
                                <button type="button" onClick={() => handleStatusChange("24 Hours")} className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${is24Hours ? 'bg-blue-500 text-white shadow-sm' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}>24 Hrs</button>
                              </div>
                            </div>
                          );
                        };

                        return (
                          <div className="space-y-4">
                            {renderDayRow("Mon - Fri", "mondayToFriday", "bg-green-500")}
                            {renderDayRow("Saturday", "saturday", "bg-yellow-400")}
                            {renderDayRow("Sunday", "sunday", "bg-red-400")}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="border-t border-gray-100 pt-4">
                      <ToggleSwitch label="Live Chat Enabled" description="Enable live chat widget for customers" checked={settings.compnyinfo?.supportCenter?.liveChat || false} onChange={(c) => updateNestedSettings("compnyinfo", "supportCenter", "liveChat", c)} />
                    </div>
                  </div>
                </div>

                {/* Maps & location picking */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100"><Globe className="h-5 w-5 text-blue-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Maps &amp; address search</h3>
                    </div>
                    <p className="text-sm text-gray-500 mb-6">
                      Google Maps API key is stored here for geocoding and address search. If left empty, the server uses{" "}
                      <code className="text-xs bg-gray-100 px-1 rounded">GOOGLE_MAPS_API_KEY</code> from environment.
                    </p>
                    <div className="mb-6">
                      <InputGroup
                        label="Google Maps API key"
                        subtext={
                          settings.compnyinfo?.location?.mapsApiKeySource === "env"
                            ? "No key saved in settings — currently using GOOGLE_MAPS_API_KEY from .env"
                            : settings.compnyinfo?.location?.mapsApiKeySource === "database"
                              ? "Using the key saved below"
                              : "No API key configured — add one here or in .env"
                        }
                      >
                        <TextInput
                          type="password"
                          value={settings.compnyinfo?.location?.googleMapsApiKey || ""}
                          onChange={(e) =>
                            updateNestedSettings(
                              "compnyinfo",
                              "location",
                              "googleMapsApiKey",
                              e.target.value.trim()
                            )
                          }
                          placeholder="AIza..."
                          autoComplete="off"
                        />
                      </InputGroup>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <InputGroup label="Default country (ISO code)" subtext="Two letters, e.g. ng, pk, us, gb">
                        <TextInput
                          value={settings.compnyinfo?.location?.countryCode || "ng"}
                          onChange={(e) =>
                            updateNestedSettings(
                              "compnyinfo",
                              "location",
                              "countryCode",
                              e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 2)
                            )
                          }
                          placeholder="ng"
                          maxLength={2}
                        />
                      </InputGroup>
                      <div className="flex items-end pb-1">
                        <ToggleSwitch
                          label="Restrict search to this country"
                          description="When off, address search is worldwide"
                          checked={settings.compnyinfo?.location?.restrictAutocomplete ?? true}
                          onChange={(c) =>
                            updateNestedSettings("compnyinfo", "location", "restrictAutocomplete", c)
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Maintenance Card */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-gray-100 rounded-lg border border-gray-200"><Server className="h-5 w-5 text-gray-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Maintenance</h3>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch label="Maintenance Mode" description="Temporarily disable user access to the app" checked={settings.general.maintenanceMode} onChange={(c) => updateSettings("general", "maintenanceMode", c)} />
                      {settings.general.maintenanceMode && (
                        <div className="pt-4 border-t border-gray-100">
                          <InputGroup label="Maintenance Message">
                            <textarea value={settings.general.maintenanceMessage} onChange={(e) => updateSettings("general", "maintenanceMessage", e.target.value)} rows={3} className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none text-sm transition-all shadow-sm" placeholder="We are currently performing system maintenance..." />
                          </InputGroup>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- SECURITY TAB --- */}
            {activeTab === "security" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Lock className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Password Policy</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      <InputGroup label="Min Length"><TextInput type="number" value={settings.security.passwordPolicy.minLength} onChange={(e) => updateNestedSettings("security", "passwordPolicy", "minLength", Number(e.target.value))} /></InputGroup>
                      <InputGroup label="Max Age (days)"><TextInput type="number" value={settings.security.passwordPolicy.maxAge} onChange={(e) => updateNestedSettings("security", "passwordPolicy", "maxAge", Number(e.target.value))} /></InputGroup>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                      {["requireUppercase", "requireLowercase", "requireNumbers", "requireSpecialChars"].map((key, i) => (
                         <div key={key} className={`border-gray-200 ${i < 2 ? 'border-b md:border-b-0' : ''} ${i % 2 === 0 ? 'md:border-r md:pr-8' : 'md:pl-8'}`}>
                           <ToggleSwitch label={key.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())} checked={settings.security.passwordPolicy[key as keyof typeof settings.security.passwordPolicy] as boolean} onChange={(c) => updateNestedSettings("security", "passwordPolicy", key, c)} />
                         </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Clock className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Session & Access</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <InputGroup label="Timeout (mins)"><TextInput type="number" value={settings.security.sessionTimeout} onChange={(e) => updateSettings("security", "sessionTimeout", Number(e.target.value))} /></InputGroup>
                      <InputGroup label="Max Login Attempts"><TextInput type="number" value={settings.security.maxLoginAttempts} onChange={(e) => updateSettings("security", "maxLoginAttempts", Number(e.target.value))} /></InputGroup>
                      <InputGroup label="Lockout (mins)"><TextInput type="number" value={settings.security.lockoutDuration} onChange={(e) => updateSettings("security", "lockoutDuration", Number(e.target.value))} /></InputGroup>
                    </div>
                    <div className="border-t border-gray-100 mt-8 pt-4">
                      <ToggleSwitch label="Fingerprint / Face ID Login" description="Enable biometric login (Face ID / Fingerprint) for customers on mobile" checked={settings.security.twoFactorRequired} onChange={(c) => updateSettings("security", "twoFactorRequired", c)} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100">
                        <Smartphone className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Customer OAuth (Google / Facebook)</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Mobile customer login on the role screen. Use OAuth client IDs from Google Cloud Console and Meta Developer Console. Facebook
                          server verification can use the App Secret below or <code className="rounded bg-gray-100 px-1">FACEBOOK_APP_SECRET</code>.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <ToggleSwitch
                        label="Enable Google sign-in"
                        checked={settings.customerOAuth?.google?.enabled !== false}
                        onChange={(c) => updateNestedSettings("customerOAuth", "google", "enabled", c)}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Google Web client ID" subtext="Required for Expo Auth / web redirect">
                          <TextInput
                            value={settings.customerOAuth?.google?.webClientId || ""}
                            onChange={(e) => updateNestedSettings("customerOAuth", "google", "webClientId", e.target.value)}
                            placeholder="xxx.apps.googleusercontent.com"
                          />
                        </InputGroup>
                        <InputGroup label="Google iOS client ID">
                          <TextInput
                            value={settings.customerOAuth?.google?.iosClientId || ""}
                            onChange={(e) => updateNestedSettings("customerOAuth", "google", "iosClientId", e.target.value)}
                          />
                        </InputGroup>
                        <InputGroup label="Google Android client ID">
                          <TextInput
                            value={settings.customerOAuth?.google?.androidClientId || ""}
                            onChange={(e) => updateNestedSettings("customerOAuth", "google", "androidClientId", e.target.value)}
                          />
                        </InputGroup>
                      </div>
                      <div className="border-t border-gray-100 pt-4" />
                      <ToggleSwitch
                        label="Enable Facebook sign-in"
                        checked={settings.customerOAuth?.facebook?.enabled !== false}
                        onChange={(c) => updateNestedSettings("customerOAuth", "facebook", "enabled", c)}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputGroup label="Facebook App ID">
                          <TextInput
                            value={settings.customerOAuth?.facebook?.appId || ""}
                            onChange={(e) => updateNestedSettings("customerOAuth", "facebook", "appId", e.target.value)}
                          />
                        </InputGroup>
                        <InputGroup label="Facebook App Secret" subtext="Stored encrypted in DB; prefer env in production">
                          <TextInput
                            type="password"
                            value={settings.customerOAuth?.facebook?.appSecret || ""}
                            onChange={(e) => updateNestedSettings("customerOAuth", "facebook", "appSecret", e.target.value)}
                            placeholder="••••••••"
                          />
                        </InputGroup>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- NOTIFICATIONS TAB --- */}
            {activeTab === "notifications" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Bell className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Active Channels</h3>
                    </div>
                    <div className="space-y-1">
                      <ToggleSwitch label="Email Notifications" description="Send transactional emails to users" checked={settings.notifications.emailEnabled} onChange={(c) => updateSettings("notifications", "emailEnabled", c)} />
                      <div className="h-px bg-gray-100 w-full" />
                      <ToggleSwitch label="SMS Notifications" description="Send critical SMS updates" checked={settings.notifications.smsEnabled} onChange={(c) => updateSettings("notifications", "smsEnabled", c)} />
                      <div className="h-px bg-gray-100 w-full" />
                      <ToggleSwitch label="Push Notifications" description="Send mobile push notifications" checked={settings.notifications.pushEnabled} onChange={(c) => updateSettings("notifications", "pushEnabled", c)} />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-100"><Server className="h-5 w-5 text-amber-700" /></div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Worker automation &amp; AI</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          Used by the Redis/BullMQ worker (<code className="rounded bg-gray-100 px-1">food-rider-dispatch-worker</code>). Requires an active{" "}
                          <strong>GENERAL_ANALYSIS</strong> AI config when a toggle is on. Env vars{" "}
                          <code className="rounded bg-gray-100 px-1">MARKETING_AI_*</code> / <code className="rounded bg-gray-100 px-1">RIDER_BONUS_AI_ENABLED</code> override these if set.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1 border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                      <ToggleSwitch
                        label="Marketing automation uses AI"
                        description="Refine abandoned-cart nudges with a tiny prompt (heuristics always run first)."
                        checked={settings.notifications.marketingAutomationAiEnabled ?? true}
                        onChange={(c) => updateSettings("notifications", "marketingAutomationAiEnabled", c)}
                      />
                      <div className="h-px bg-gray-100 w-full my-2" />
                      <InputGroup
                        label="Max AI candidate rows per tick"
                        subtext="How many scored users to send to the model (1–20). Lower = fewer tokens."
                      >
                        <TextInput
                          type="number"
                          min={1}
                          max={20}
                          value={settings.notifications.marketingAutomationAiMaxCandidates ?? 12}
                          onChange={(e) =>
                            updateSettings(
                              "notifications",
                              "marketingAutomationAiMaxCandidates",
                              Math.min(20, Math.max(1, Number(e.target.value) || 12))
                            )
                          }
                        />
                      </InputGroup>
                      <div className="h-px bg-gray-100 w-full my-2" />
                      <ToggleSwitch
                        label="Rider peak bonus uses AI tuning"
                        description="Optional: adjust target rides / commission discount from a small numeric prompt. Default off to save credits."
                        checked={settings.notifications.riderBonusAiEnabled ?? false}
                        onChange={(c) => updateSettings("notifications", "riderBonusAiEnabled", c)}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Key className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Provider Settings</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                       <InputGroup label="Email Provider">
                          <SelectInput value={settings.notifications.emailProvider} onChange={(e) => updateSettings("notifications", "emailProvider", e.target.value)}>
                            <option value="sendgrid">SendGrid</option>
                            <option value="brevo">Brevo (Sendinblue)</option>
                            <option value="mailgun">Mailgun</option>
                            <option value="ses">Amazon SES</option>
                            <option value="smtp">Custom SMTP</option>
                          </SelectInput>
                       </InputGroup>
                       <InputGroup label="SMS Provider">
                          <SelectInput value={settings.notifications.smsProvider} onChange={(e) => updateSettings("notifications", "smsProvider", e.target.value)}>
                            <option value="twilio">Twilio</option>
                            <option value="nexmo">Nexmo</option>
                            <option value="africas_talking">Africa's Talking</option>
                          </SelectInput>
                       </InputGroup>
                       <InputGroup label="Default Sender Name">
                          <TextInput value={settings.notifications.defaultSender} onChange={(e) => updateSettings("notifications", "defaultSender", e.target.value)} placeholder="App Name" />
                       </InputGroup>
                    </div>

                    {(settings.notifications.emailProvider === 'smtp' || settings.notifications.emailProvider === 'brevo') && (
                      <div className="bg-emerald-50/40 rounded-2xl p-6 border border-emerald-100/60 mb-8">
                        <h4 className="text-sm font-bold text-emerald-900 uppercase tracking-wider mb-5 flex items-center gap-2">
                          <Mail className="h-4 w-4" /> SMTP Configuration
                        </h4>
                        {settings.notifications.emailProvider === 'brevo' && (
                          <div className="bg-white p-3.5 rounded-xl border border-emerald-200 text-sm text-emerald-800 mb-5 shadow-sm">
                             <strong>Brevo Defaults:</strong> Host: <code className="bg-emerald-100 px-1 rounded">smtp.brevo.com</code> • Port: <code className="bg-emerald-100 px-1 rounded">587</code>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                          <InputGroup label="SMTP Host"><TextInput value={settings.notifications.smtpHost || ""} onChange={(e) => updateSettings("notifications", "smtpHost", e.target.value)} placeholder="smtp.example.com" /></InputGroup>
                          <InputGroup label="SMTP Port"><TextInput type="number" value={settings.notifications.smtpPort || ""} onChange={(e) => updateSettings("notifications", "smtpPort", Number(e.target.value))} placeholder="587" /></InputGroup>
                          <InputGroup label="Username"><TextInput value={settings.notifications.smtpUser || ""} onChange={(e) => updateSettings("notifications", "smtpUser", e.target.value)} /></InputGroup>
                          <InputGroup label="Password"><TextInput type="password" value={settings.notifications.smtpPass || ""} onChange={(e) => updateSettings("notifications", "smtpPass", e.target.value)} /></InputGroup>
                          <InputGroup label="From Email Address" className="md:col-span-2"><TextInput type="email" value={settings.notifications.smtpFrom || ""} onChange={(e) => updateSettings("notifications", "smtpFrom", e.target.value)} placeholder="noreply@example.com" /></InputGroup>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-white p-5 rounded-xl border border-emerald-100 shadow-sm">
                          <ToggleSwitch label="Use SSL/TLS" checked={settings.notifications.smtpSecure ?? true} onChange={(c) => updateSettings("notifications", "smtpSecure", c)} />
                          <ToggleSwitch label="Reject Unauthorized" checked={settings.notifications.smtpRejectUnauthorized ?? false} onChange={(c) => updateSettings("notifications", "smtpRejectUnauthorized", c)} />
                        </div>
                      </div>
                    )}

                    <div className="bg-gray-50/80 rounded-2xl p-6 border border-gray-200">
                      <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wider mb-5 flex items-center gap-2">
                        <Key className="h-4 w-4" /> API Credentials
                      </h4>

                      {settings.notifications.emailProvider === 'brevo' && (
                         <InputGroup label="Brevo API Key" subtext="Required for API features"><TextInput type="password" value={settings.notifications.brevoApiKey || ""} onChange={(e) => updateSettings("notifications", "brevoApiKey", e.target.value)} placeholder="xkeysib-..." /></InputGroup>
                      )}
                      {settings.notifications.emailProvider === 'sendgrid' && (
                         <InputGroup label="SendGrid API Key"><TextInput type="password" value={settings.notifications.sendgridApiKey || ""} onChange={(e) => updateSettings("notifications", "sendgridApiKey", e.target.value)} placeholder="SG...." /></InputGroup>
                      )}
                      {settings.notifications.emailProvider === 'mailgun' && (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <InputGroup label="Mailgun API Key"><TextInput type="password" value={settings.notifications.mailgunApiKey || ""} onChange={(e) => updateSettings("notifications", "mailgunApiKey", e.target.value)} /></InputGroup>
                            <InputGroup label="Mailgun Domain"><TextInput value={settings.notifications.mailgunDomain || ""} onChange={(e) => updateSettings("notifications", "mailgunDomain", e.target.value)} placeholder="mg.example.com" /></InputGroup>
                         </div>
                      )}
                      {settings.notifications.emailProvider === 'ses' && (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            <InputGroup label="Access Key ID"><TextInput value={settings.notifications.sesAccessKeyId || ""} onChange={(e) => updateSettings("notifications", "sesAccessKeyId", e.target.value)} placeholder="AKIA..." /></InputGroup>
                            <InputGroup label="Secret Access Key"><TextInput type="password" value={settings.notifications.sesSecretAccessKey || ""} onChange={(e) => updateSettings("notifications", "sesSecretAccessKey", e.target.value)} /></InputGroup>
                            <InputGroup label="Region"><TextInput value={settings.notifications.sesRegion || ""} onChange={(e) => updateSettings("notifications", "sesRegion", e.target.value)} placeholder="us-east-1" /></InputGroup>
                         </div>
                      )}
                      
                      <div className="mt-8 pt-6 border-t border-gray-200">
                        {settings.notifications.smsProvider === 'twilio' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                             <InputGroup label="Account SID"><TextInput value={settings.notifications.twilioAccountSid || ""} onChange={(e) => updateSettings("notifications", "twilioAccountSid", e.target.value)} placeholder="AC..." /></InputGroup>
                             <InputGroup label="Auth Token"><TextInput type="password" value={settings.notifications.twilioAuthToken || ""} onChange={(e) => updateSettings("notifications", "twilioAuthToken", e.target.value)} /></InputGroup>
                             <InputGroup label="Phone Number"><TextInput value={settings.notifications.twilioPhoneNumber || ""} onChange={(e) => updateSettings("notifications", "twilioPhoneNumber", e.target.value)} placeholder="+123..." /></InputGroup>
                          </div>
                        )}
                        {settings.notifications.smsProvider === 'nexmo' && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                             <InputGroup label="API Key"><TextInput value={settings.notifications.nexmoApiKey || ""} onChange={(e) => updateSettings("notifications", "nexmoApiKey", e.target.value)} /></InputGroup>
                             <InputGroup label="API Secret"><TextInput type="password" value={settings.notifications.nexmoApiSecret || ""} onChange={(e) => updateSettings("notifications", "nexmoApiSecret", e.target.value)} /></InputGroup>
                             <InputGroup label="From Number"><TextInput value={settings.notifications.nexmoFromNumber || ""} onChange={(e) => updateSettings("notifications", "nexmoFromNumber", e.target.value)} placeholder="Sender ID" /></InputGroup>
                          </div>
                        )}
                        {settings.notifications.smsProvider === 'africas_talking' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                             <InputGroup label="API Key"><TextInput type="password" value={settings.notifications.africasTalkingApiKey || ""} onChange={(e) => updateSettings("notifications", "africasTalkingApiKey", e.target.value)} /></InputGroup>
                             <InputGroup label="Username"><TextInput value={settings.notifications.africasTalkingUsername || ""} onChange={(e) => updateSettings("notifications", "africasTalkingUsername", e.target.value)} placeholder="sandbox" /></InputGroup>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100">
                        <Smartphone className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-gray-900">Money transfer receipts</h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                          PDF receipts: Meta WhatsApp Cloud first; if that fails or is not set up, Twilio tries WhatsApp (same sender number), then SMS with a link when Twilio is your SMS provider.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mb-6">
                      <a
                        className="text-green-700 hover:underline inline-flex items-center gap-1"
                        href="https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Meta WhatsApp docs <ExternalLink className="h-3 w-3" />
                      </a>
                    </p>
                    <div className="space-y-5 max-w-3xl">
                      <ToggleSwitch
                        label="Enable receipt delivery"
                        description="Customers can send receipts to their profile phone from the money app."
                        checked={settings.moneyReceiptWhatsapp.enabled}
                        onChange={(c) => patchMoneyReceiptWhatsapp("enabled", c)}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <InputGroup label="Phone Number ID (Meta)">
                          <TextInput
                            value={settings.moneyReceiptWhatsapp.phoneNumberId}
                            onChange={(e) => patchMoneyReceiptWhatsapp("phoneNumberId", e.target.value)}
                            placeholder="From Meta → WhatsApp → API Setup"
                          />
                        </InputGroup>
                        <InputGroup label="Graph API version">
                          <TextInput
                            value={settings.moneyReceiptWhatsapp.apiVersion}
                            onChange={(e) => patchMoneyReceiptWhatsapp("apiVersion", e.target.value)}
                            placeholder="v21.0"
                          />
                        </InputGroup>
                        <InputGroup label="WABA ID (optional)">
                          <TextInput
                            value={settings.moneyReceiptWhatsapp.wabaId}
                            onChange={(e) => patchMoneyReceiptWhatsapp("wabaId", e.target.value)}
                          />
                        </InputGroup>
                        <InputGroup
                          label="Permanent access token"
                          subtext={
                            settings.moneyReceiptWhatsapp.hasAccessToken
                              ? "Token is stored. Paste a new value only to replace it."
                              : "Required for Meta unless WHATSAPP_CLOUD_ACCESS_TOKEN is set in env."
                          }
                        >
                          <TextInput
                            type="password"
                            value={settings.moneyReceiptWhatsapp.accessToken}
                            onChange={(e) => patchMoneyReceiptWhatsapp("accessToken", e.target.value)}
                            placeholder="EAAG..."
                          />
                        </InputGroup>
                      </div>
                      <InputGroup
                        label="Utility template name (recommended)"
                        subtext="Required for outbound receipts outside the 24h customer window."
                      >
                        <TextInput
                          value={settings.moneyReceiptWhatsapp.templateName}
                          onChange={(e) => patchMoneyReceiptWhatsapp("templateName", e.target.value)}
                        />
                      </InputGroup>
                      <InputGroup label="Template language code">
                        <TextInput
                          value={settings.moneyReceiptWhatsapp.templateLanguage}
                          onChange={(e) => patchMoneyReceiptWhatsapp("templateLanguage", e.target.value)}
                          placeholder="en"
                        />
                      </InputGroup>
                      <InputGroup label="Caption / session message template" subtext="Variables: {{reference}}, {{amount}}, {{currency}}, {{name}}">
                        <textarea
                          className="w-full min-h-[100px] px-4 py-2.5 bg-gray-50/50 border border-gray-200 rounded-xl text-sm"
                          value={settings.moneyReceiptWhatsapp.messageTemplate}
                          onChange={(e) => patchMoneyReceiptWhatsapp("messageTemplate", e.target.value)}
                        />
                      </InputGroup>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Shield className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">Monitoring</h3>
                    </div>
                    <InputGroup label="BCC Email (Audit)" subtext="All outbound system emails will be secretly BCC'd to this address.">
                      <TextInput type="email" value={settings.notifications.bravoEmail || ""} onChange={(e) => updateSettings("notifications", "bravoEmail", e.target.value)} placeholder="admin-monitor@example.com" />
                    </InputGroup>
                  </div>
                </div>
              </div>
            )}

            {/* --- PAYMENTS TAB --- */}
            {activeTab === "payments" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="p-6 md:p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><DollarSign className="h-5 w-5 text-green-600" /></div>
                      <h3 className="text-xl font-bold text-gray-900">General Pricing</h3>
                    </div>
                    <div className="max-w-sm">
                       <InputGroup label={`Price per Kilometer`} subtext="Base price calculation for delivery services">
                         <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-gray-500">{currency}</span>
                            <TextInput type="number" className="pl-10" step="0.1" value={settings.payments.pricePerKm} onChange={(e) => updateSettings("payments", "pricePerKm", Number(e.target.value))} />
                         </div>
                       </InputGroup>
                    </div>
                  </div>
                 </div>

                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                   <div className="p-6 md:p-8">
                     <div className="flex items-center gap-3 mb-6">
                       <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><Percent className="h-5 w-5 text-green-600" /></div>
                       <h3 className="text-xl font-bold text-gray-900">Commission Rates</h3>
                     </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {Object.entries(settings.payments.commissionRates).map(([module, rate]) => (
                        <InputGroup key={module} label={module.replace(/([A-Z])/g, " $1").replace(/^./, str => str.toUpperCase())}>
                           <div className="relative">
                              <TextInput type="number" step="0.1" value={rate} onChange={(e) => updateNestedSettings("payments", "commissionRates", module, Number(e.target.value))} className="pr-10" />
                              <Percent className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                           </div>
                        </InputGroup>
                      ))}
                     </div>
                   </div>
                 </div>

                 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-green-50 rounded-lg border border-green-100"><CreditCard className="h-5 w-5 text-green-600" /></div>
                        <h3 className="text-xl font-bold text-gray-900">Withdrawals</h3>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <InputGroup label="Min Withdrawal">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-gray-500">{currency}</span>
                            <TextInput type="number" className="pl-10" value={settings.payments.minimumWithdrawal} onChange={(e) => updateSettings("payments", "minimumWithdrawal", Number(e.target.value))} />
                          </div>
                        </InputGroup>
                        <InputGroup label="Withdrawal Fee">
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-semibold text-gray-500">{currency}</span>
                            <TextInput type="number" className="pl-10" value={settings.payments.withdrawalFee} onChange={(e) => updateSettings("payments", "withdrawalFee", Number(e.target.value))} />
                          </div>
                        </InputGroup>
                        <InputGroup label="Processing Time">
                          <SelectInput value={settings.payments.processingTime} onChange={(e) => updateSettings("payments", "processingTime", e.target.value)}>
                            <option value="instant">Instant</option>
                            <option value="1-3 business days">1-3 business days</option>
                            <option value="3-5 business days">3-5 business days</option>
                          </SelectInput>
                        </InputGroup>
                      </div>
                    </div>
                 </div>

                 <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden">
                    <div className="p-6 md:p-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
                          <CreditCard className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">Card checkout</h3>
                          <p className="text-xs text-gray-500 font-medium">Stripe / Paystack order for mobile checkout</p>
                        </div>
                      </div>
                      {settings.payments.checkoutGateway ? (
                        <div className="text-sm text-gray-700 space-y-2">
                          <p>
                            <span className="font-semibold text-gray-900">Effective primary:</span>{" "}
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-emerald-800">{settings.payments.checkoutGateway.primary}</code>
                            {settings.payments.checkoutGateway.fallback ? (
                              <>
                                <span className="text-gray-400 mx-2">·</span>
                                <span className="font-semibold text-gray-900">Fallback:</span>{" "}
                                <code className="bg-gray-100 px-1.5 py-0.5 rounded">{settings.payments.checkoutGateway.fallback}</code>
                              </>
                            ) : null}
                          </p>
                          {settings.payments.checkoutGateway.storedPrimary ? (
                            <p className="text-xs text-gray-500">
                              Stored preference (DB):{" "}
                              <code className="bg-gray-50 px-1 rounded">{settings.payments.checkoutGateway.storedPrimary}</code>
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Gateway summary unavailable.</p>
                      )}
                      <p className="text-sm text-gray-600 mt-5">
                        To set which provider is tried first (and automatic fallback), use{" "}
                        <a href="/admin/commission" className="text-emerald-600 font-semibold hover:underline">
                          Commission Control → Checkout payment gateway
                        </a>
                        .
                      </p>
                    </div>
                 </div>
              </div>
            )}

            {/* --- MODULES TAB --- */}
            {activeTab === "modules" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Text-to-Speech (TTS) */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b bg-gray-50/50 border-gray-100 flex items-center gap-3">
                    <div className="p-2.5 bg-green-50 rounded-lg border border-green-100">
                      <Smartphone className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Text-to-Speech (TTS)</h3>
                      <p className="text-xs text-gray-500 font-medium">Configure the voice model + base URL used for app narration.</p>
                    </div>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputGroup
                      label="TTS Base URL"
                      subtext="Example: http://209.97.132.83:8080"
                    >
                      <TextInput
                        value={settings.tts.baseUrl}
                        onChange={(e) => updateSettings("tts", "baseUrl", e.target.value)}
                        placeholder="http://209.97.132.83:8080"
                        className="font-mono"
                      />
                    </InputGroup>
                    <InputGroup
                      label="Voice Model"
                      subtext={
                        <>
                          Use the identifier for your chosen neural voice (for example{" "}
                          <code className="bg-gray-100 px-1 rounded text-[11px] font-mono text-gray-800">en-GB-RyanNeural</code>
                          ). For a searchable catalogue of Edge TTS voices, locales, and sample names, refer to{" "}
                          <a
                            href="https://tts.travisvn.com/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-600 font-semibold hover:underline"
                          >
                            Edge TTS Voices
                          </a>
                          —then enter the matching voice string above.
                        </>
                      }
                    >
                      <TextInput
                        value={settings.tts.voice}
                        onChange={(e) => updateSettings("tts", "voice", e.target.value)}
                        placeholder="en-GB-RyanNeural"
                        className="font-mono"
                      />
                    </InputGroup>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {Object.entries(settings.modules).map(([moduleName, moduleSettings]) => (
                   <div key={moduleName} className={`bg-white rounded-2xl border shadow-sm transition-all duration-300 overflow-hidden ${moduleSettings.enabled ? 'border-green-300 shadow-green-500/5 ring-1 ring-green-500/10' : 'border-gray-200 opacity-90'}`}>
                      <div className={`p-5 border-b flex items-center justify-between transition-colors ${moduleSettings.enabled ? 'bg-green-50/50 border-green-100' : 'bg-gray-50/50 border-gray-100'}`}>
                         <h3 className="font-bold text-gray-900 capitalize text-lg flex items-center gap-2">
                           {moduleSettings.enabled ? <Check className="h-5 w-5 text-green-600" /> : <Database className="h-5 w-5 text-gray-400" />}
                           {moduleName.replace(/([A-Z])/g, " $1")}
                         </h3>
                         <ToggleSwitch label="" checked={moduleSettings.enabled} onChange={(c) => updateNestedSettings("modules", moduleName, "enabled", c)} />
                      </div>
                      
                      {moduleSettings.enabled ? (
                        <div className="p-6 space-y-2">
                           <ToggleSwitch label="Auto-Approve Vendors" description="Automatically accept new vendor registrations" checked={moduleSettings.autoApproval} onChange={(c) => updateNestedSettings("modules", moduleName, "autoApproval", c)} />
                           
                           {moduleName === "pharmacy" && (
                              <div className="pt-4 mt-2 border-t border-gray-100 space-y-4">
                                <ToggleSwitch label="Require Prescription" checked={(moduleSettings as ModuleSettings['pharmacy']).requirePrescription} onChange={(c) => updateNestedSettings("modules", moduleName, "requirePrescription", c)} />
                                <InputGroup label="Delivery Radius (km)"><TextInput type="number" value={(moduleSettings as ModuleSettings['pharmacy']).deliveryRadius} onChange={(e) => updateNestedSettings("modules", moduleName, "deliveryRadius", Number(e.target.value))} /></InputGroup>
                              </div>
                           )}
                           {moduleName === "riding" && (
                             <div className="pt-4 mt-2 border-t border-gray-100 space-y-4">
                                <ToggleSwitch label="Background Check" checked={(moduleSettings as ModuleSettings['riding']).backgroundCheck} onChange={(c) => updateNestedSettings("modules", moduleName, "backgroundCheck", c)} />
                                <ToggleSwitch label="Insurance Required" checked={(moduleSettings as ModuleSettings['riding']).insuranceRequired} onChange={(c) => updateNestedSettings("modules", moduleName, "insuranceRequired", c)} />
                                <div className="rounded-xl border border-red-100 bg-red-50/40 p-4 space-y-3">
                                  <div>
                                    <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4 text-red-600" />
                                      SOS emergency numbers
                                    </p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Shown in the customer SOS screen (police, ambulance, etc.).
                                    </p>
                                  </div>
                                  {(settings.compnyinfo.ridingEmergencyContacts || []).map((contact, index) => (
                                    <div key={contact.id || index} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                                      <InputGroup label="Name">
                                        <TextInput
                                          value={contact.name}
                                          onChange={(e) => {
                                            const list = [...(settings.compnyinfo.ridingEmergencyContacts || [])]
                                            list[index] = { ...list[index], name: e.target.value }
                                            setSettings((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    compnyinfo: {
                                                      ...prev.compnyinfo,
                                                      ridingEmergencyContacts: list,
                                                    },
                                                  }
                                                : prev,
                                            )
                                          }}
                                        />
                                      </InputGroup>
                                      <InputGroup label="Phone number">
                                        <TextInput
                                          value={contact.number}
                                          onChange={(e) => {
                                            const list = [...(settings.compnyinfo.ridingEmergencyContacts || [])]
                                            list[index] = { ...list[index], number: e.target.value }
                                            setSettings((prev) =>
                                              prev
                                                ? {
                                                    ...prev,
                                                    compnyinfo: {
                                                      ...prev.compnyinfo,
                                                      ridingEmergencyContacts: list,
                                                    },
                                                  }
                                                : prev,
                                            )
                                          }}
                                        />
                                      </InputGroup>
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-red-600 hover:text-red-800 py-2.5"
                                        onClick={() => {
                                          const list = (settings.compnyinfo.ridingEmergencyContacts || []).filter(
                                            (_, i) => i !== index,
                                          )
                                          setSettings((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  compnyinfo: {
                                                    ...prev.compnyinfo,
                                                    ridingEmergencyContacts: list,
                                                  },
                                                }
                                              : prev,
                                          )
                                        }}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                                    onClick={() => {
                                      const list = [...(settings.compnyinfo.ridingEmergencyContacts || [])]
                                      list.push({
                                        id: `contact-${Date.now()}`,
                                        name: "Emergency",
                                        number: "",
                                        icon: "call",
                                      })
                                      setSettings((prev) =>
                                        prev
                                          ? {
                                              ...prev,
                                              compnyinfo: {
                                                ...prev.compnyinfo,
                                                ridingEmergencyContacts: list,
                                              },
                                            }
                                          : prev,
                                      )
                                    }}
                                  >
                                    + Add emergency contact
                                  </button>
                                </div>
                             </div>
                           )}
                        </div>
                      ) : (
                        <div className="p-8 text-center bg-gray-50 text-gray-400 text-sm font-medium">This module is currently disabled.</div>
                      )}
                   </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- LOYALTY POINTS TAB --- */}
            {activeTab === "loyaltyPoints" && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-5 rounded-2xl border border-green-100 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 text-green-900 text-sm">
                  <div className="p-3 bg-white rounded-full shadow-sm text-green-600 flex-shrink-0"><Gift className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold text-base mb-1">Formula Guide</p>
                    <p>Use variables like <code className="bg-white/60 px-2 py-0.5 rounded-md font-mono text-xs border border-green-200">orderAmount</code>. Example: <span className="font-mono bg-white/60 px-2 py-0.5 rounded-md text-xs border border-green-200">orderAmount * 0.01</span> grants 1% in points.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {["pharmacy", "autoParts", "food", "grocery", "riding"].map((moduleName) => {
                    const moduleKey = moduleName === "autoParts" ? "autoParts" : moduleName
                    const moduleSettings = settings.loyaltyPoints[moduleKey] || { enabled: false, formula: "orderAmount * 0.01", minimumOrderAmount: 0, maximumPointsPerOrder: undefined, pointsExpiryDays: undefined }
                    return (
                      <div key={moduleName} className={`bg-white rounded-2xl border shadow-sm transition-all duration-300 overflow-hidden ${moduleSettings.enabled ? 'border-green-300 shadow-green-500/5 ring-1 ring-green-500/10' : 'border-gray-200 opacity-90'}`}>
                        <div className={`p-5 border-b flex items-center justify-between transition-colors ${moduleSettings.enabled ? 'bg-green-50/50 border-green-100' : 'bg-gray-50/50 border-gray-100'}`}>
                           <h3 className="font-bold text-gray-900 capitalize text-lg">{moduleName.replace(/([A-Z])/g, " $1")}</h3>
                           <ToggleSwitch label="" checked={moduleSettings.enabled} onChange={(e) => {
                             if (!settings.loyaltyPoints[moduleKey]) { setSettings({ ...settings, loyaltyPoints: { ...settings.loyaltyPoints, [moduleKey]: { enabled: e, formula: "orderAmount * 0.01" } } }) } 
                             else { updateNestedSettings("loyaltyPoints", moduleKey, "enabled", e) }
                             setHasChanges(true)
                           }} />
                        </div>
                        {moduleSettings.enabled ? (
                          <div className="p-6 space-y-5">
                             <InputGroup label="Points Formula"><TextInput value={moduleSettings.formula || "orderAmount * 0.01"} onChange={(e) => updateNestedSettings("loyaltyPoints", moduleKey, "formula", e.target.value)} className="font-mono text-green-700 bg-green-50/30" /></InputGroup>
                             <div className="grid grid-cols-2 gap-5">
                                <InputGroup label={`Min Order`}>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-medium text-gray-500 text-sm">{currency}</span>
                                    <TextInput type="number" className="pl-8" value={moduleSettings.minimumOrderAmount || ""} onChange={(e) => updateNestedSettings("loyaltyPoints", moduleKey, "minimumOrderAmount", Number(e.target.value))} />
                                  </div>
                                </InputGroup>
                                <InputGroup label="Max Points"><TextInput type="number" value={moduleSettings.maximumPointsPerOrder || ""} onChange={(e) => updateNestedSettings("loyaltyPoints", moduleKey, "maximumPointsPerOrder", Number(e.target.value))} /></InputGroup>
                             </div>
                             <InputGroup label="Expiry (Days)"><TextInput type="number" value={moduleSettings.pointsExpiryDays || ""} onChange={(e) => updateNestedSettings("loyaltyPoints", moduleKey, "pointsExpiryDays", Number(e.target.value))} placeholder="No Expiry" /></InputGroup>
                          </div>
                        ) : (
                          <div className="p-8 text-center bg-gray-50 text-gray-400 text-sm font-medium">Points disabled for this module.</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}