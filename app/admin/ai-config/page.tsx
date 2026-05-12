    "use client"

    import { useState, useEffect, useMemo, useRef } from "react"
    import {
    Search,
    Plus,
    Activity,
    Settings,
    Server,
    X,
    Zap,
    Trash2,
    Cpu,
    Coins,
    Box,
    ChevronRight,
    Database,
    MoreVertical,
    Layers,
    Sparkles,
    Brain,
    Key,
    Eye,
    EyeOff,
    Save,
    Terminal,
    Code,
    Sliders,
    Play,
    ToggleLeft,
    ToggleRight,
    FileJson,
    Check,
    Command,
    Globe,
    Lock,
    MessageSquare,
    RefreshCw,
    Maximize2,
    Bot,
    Wrench,
    Badge,
    BrainCircuit, 
    Maximize, 
    Image as ImageIcon,
    TerminalSquare,
    Type,
    Shield,
    List,
    LayoutTemplate,
  GithubIcon
    } from "lucide-react"

    // --- Types ---
    type OpenRouterModel = {
    id: string
    name: string
    description: string
    context_length: number
    architecture: {
        modality: string
        input_modalities: string[]
        output_modalities: string[]
    }
    pricing: {
        prompt: string
        completion: string
    }
    }

    type PromptLanguage = {
    name: string
    code: string
    flag: string
    }

    type PromptSchema = {
    name: string
    schema: string
    }

    // --- Main Page Component ---
    export default function AiConfigPage() {
    const [activeTab, setActiveTab] = useState("dashboard")
    const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalProvider, setModalProvider] = useState<"openrouter" | "huggingface" | "github" | "groq" | "google" | null>(null)

    return (
        <div className="w-full min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-green-100 selection:text-green-900">
        
        {/* Subtle Grid Background */}
        <div className="fixed inset-0 z-0 pointer-events-none opacity-[0.03]" 
            style={{ backgroundImage: "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)", backgroundSize: "32px 32px" }}>
        </div>

        {/* Floating Header */}
        <div className="sticky top-4 z-40 mx-auto max-w-[1400px] px-4 sm:px-6">
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/80 bg-white/80 px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl md:flex-row md:items-center md:justify-between transition-all duration-300">
            <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-600 to-green-500 shadow-lg shadow-green-500/20 text-white">
                <Sparkles size={18} fill="currentColor" className="text-white/90" />
                </div>
                <div>
                <h1 className="text-lg font-bold tracking-tight text-gray-900">Neural Orchestrator</h1>
                <div className="flex items-center gap-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                    <span>Production</span>
                    <span className="h-1 w-1 rounded-full bg-gray-300"></span>
                    <span className="text-emerald-600 flex items-center gap-1">
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span> 
                    v2.4.0
                    </span>
                </div>
                </div>
            </div>
            
            <div className="flex items-center gap-1 rounded-xl bg-gray-100/50 p-1 ring-1 ring-gray-900/5">
                <NavTab active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} label="Fleet" icon={<Server size={14}/>} />
                <NavTab active={activeTab === "settings"} onClick={() => setActiveTab("settings")} label="Configuration" icon={<Sliders size={14}/>} />
                <NavTab active={activeTab === "logs"} onClick={() => setActiveTab("logs")} label="Analytics" icon={<Activity size={14}/>} />
            </div>
            </div>
        </div>

        {/* Main Content Area */}
        <main className="relative z-10 px-4 sm:px-6 pb-12 pt-8 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === "dashboard" && <DashboardCardView onAddModel={(provider) => { setModalProvider(provider); setIsModalOpen(true); }} />}
        
            {activeTab === "logs" && (
            <div className="flex h-[60vh] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-300 bg-gray-50/50 text-gray-400">
                <Activity size={48} className="mb-4 opacity-20" />
                <span className="text-sm font-medium">Real-time telemetry module initializing...</span>
            </div>
            )}
        
            {activeTab === "settings" && <AiConfigSettings />}
        </main>

        {isModalOpen && modalProvider === "openrouter" && <OpenRouterModal onClose={() => { setIsModalOpen(false); setModalProvider(null); }} />}
        {isModalOpen && modalProvider === "huggingface" && <HuggingFaceModal onClose={() => { setIsModalOpen(false); setModalProvider(null); }} />}
      {isModalOpen && modalProvider === "github" && <GitHubModelsModal onClose={() => { setIsModalOpen(false); setModalProvider(null); }} />}
      {isModalOpen && modalProvider === "groq" && <ProviderManualModal providerName="Groq" keyStorageKey="groq_api_key" providerValue="Groq" defaultModelId="llama-3.1-8b-instant" onClose={() => { setIsModalOpen(false); setModalProvider(null); }} />}
      {isModalOpen && modalProvider === "google" && <ProviderManualModal providerName="Google AI Studio" keyStorageKey="google_ai_studio_api_key" providerValue="Google AI Studio" defaultModelId="gemini-1.5-pro" onClose={() => { setIsModalOpen(false); setModalProvider(null); }} />}
        </div>
    )
    }

    // --- 1. Dashboard View ---

function DashboardCardView({ onAddModel }: { onAddModel: (provider: "openrouter" | "huggingface" | "github" | "groq" | "google") => void }) {
    const [models, setModels] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState("")
    
  useEffect(() => {
    fetchModels()
  }, [])

    const fetchModels = async () => {
        try {
        setLoading(true)
        const response = await fetch("/api/admin/ai-config/models")
        const data = await response.json()
      if (data.models) {
        setModels(data.models)
      }
    } catch (error) {
      console.error("Failed to fetch models:", error)
    } finally {
      setLoading(false)
    }
    }

    const handleDelete = async (modelId: string) => {
        if (!confirm("Are you sure you want to delete this model?")) return
        try {
      const response = await fetch(`/api/admin/ai-config/models?id=${modelId}`, {
        method: "DELETE",
      })
      if (response.ok) {
        fetchModels()
      }
    } catch (error) {
      console.error("Failed to delete model:", error)
    }
    }

    const filteredModels = models.filter((model) =>
        model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        model.modelId.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const activeModels = models.filter((m) => m.isActive && m.status === "ONLINE")
  const avgLatency = models.length > 0
    ? Math.round(models.reduce((sum, m) => sum + (m.latency || 0), 0) / models.length)
    : 0

    return (
        <div className="space-y-8">
      {/* Metrics Row */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Active Endpoints" value={activeModels.length.toString()} subValue={`of ${models.length} total`} icon={<Server className="text-emerald-600" />} color="emerald" />
            <StatCard title="Global Latency" value={avgLatency > 0 ? `${avgLatency}ms` : "N/A"} subValue="Average response" icon={<Zap className="text-amber-500" />} color="amber" />
            <StatCard title="Total Models" value={models.length.toString()} subValue="Connected" icon={<Coins className="text-green-500" />} color="green" />
            <StatCard title="Request Health" value="99.9%" subValue="Stable" icon={<Activity className="text-blue-500" />} color="blue" />
        </div>

      {/* Action Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-green-500 transition-colors" />
            </div>
            <input 
                type="text" 
                placeholder="Search models, providers, or tags..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full rounded-xl border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium placeholder-gray-400 shadow-sm transition-all focus:border-green-500 focus:ring-4 focus:ring-green-500/10 hover:border-gray-300"
            />
            </div>
            <div className="relative group">
            <button 
                onClick={() => onAddModel("openrouter")}
                className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-gray-900/20 transition-all hover:bg-gray-800 hover:-translate-y-0.5 active:scale-95 active:shadow-sm"
            >
                <span className="relative z-10 flex items-center gap-2">
               <Plus size={16} className="text-green-300" />
               Deploy Model
                </span>
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-green-600 to-green-500 opacity-0 transition-opacity group-hover:opacity-100"></div>
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <button
              onClick={() => onAddModel("openrouter")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Globe size={14} className="text-blue-500" />
              OpenRouter
                </button>
            <button
              onClick={() => onAddModel("huggingface")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Brain size={14} className="text-yellow-500" />
              Hugging Face
            </button>
            <button
              onClick={() => onAddModel("github")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
            >
              <Server size={14} className="text-emerald-500" />
              GitHub Models
            </button>
            <button
              onClick={() => onAddModel("github")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
            >
              <GithubIcon size={14} className="text-purple-500" /> 
              GitHub
                </button>
            <button
              onClick={() => onAddModel("groq")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Zap size={14} className="text-fuchsia-500" />
              Groq
            </button>
            <button
              onClick={() => onAddModel("google")}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 rounded-b-lg flex items-center gap-2"
            >
              <Bot size={14} className="text-indigo-500" />
              Google AI Studio
            </button>
            </div>
            </div>
        </div>

      {/* Grid */}
        {loading ? (
        <div className="flex items-center justify-center h-64">
           <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-green-600"></div>
        </div>
        ) : filteredModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 rounded-3xl border border-dashed border-gray-200 bg-gray-50/50">
          <div className="bg-white p-4 rounded-full shadow-sm mb-4">
            <Server size={32} className="text-gray-300" />
          </div>
            <p className="text-lg font-semibold text-gray-900">No models found</p>
            <p className="text-sm text-gray-500">Deploy a new model to get started</p>
            </div>
        ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredModels.map((model) => (
             <ModelCard key={model.id} model={model} onDelete={() => handleDelete(model.id)} />
          ))}
            </div>
        )}
        </div>
    )
    }

    function ModelCard({ model, onDelete }: { model: any, onDelete: () => void }) {
    const quota = model.hourlyQuotaLimit
      ? Math.round((model.currentHourlyUsage / model.hourlyQuotaLimit) * 100)
      : 0
        const isCritical = quota > 90
        const latency = model.latency ? `${model.latency}ms` : "-"
        
        return (
            <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-white p-1 shadow-[0_2px_10px_rgb(0,0,0,0.02)] ring-1 ring-gray-100 transition-all hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.04)]">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-green-500 via-green-400 to-green-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
                <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 ring-1 ring-gray-200/50 text-gray-600">
                             <Box size={20} strokeWidth={1.5} />
                        </div>
                            <div>
                                <h3 className="font-bold text-gray-900 leading-tight">{model.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{model.provider}</span>
                                    <span className="h-0.5 w-0.5 rounded-full bg-gray-300"></span>
                                    <span className="font-mono text-[10px] text-gray-400">{model.modelId}</span>
                                </div>
                            </div>
                        </div>
                        <StatusBadge status={model.status} />
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs font-medium text-gray-500 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                         <div className="flex items-center gap-2">
                             <Zap size={12} className="text-amber-500"/>
                             <span>Latency</span>
                         </div>
                            <span className="font-mono text-gray-900">{latency}</span>
                        </div>
                    
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-medium">
                                <span className="text-gray-500 flex items-center gap-1.5"><Layers size={12}/> Quota Usage</span>
                                <span className={isCritical ? "text-red-600" : "text-gray-700"}>{quota}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${
                                    isCritical ? "bg-red-500" : "bg-gradient-to-r from-green-500 to-green-400"
                                }`} 
                                style={{ width: `${Math.min(quota, 100)}%` }}
                            ></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 border-t border-gray-100 bg-gray-50/50">
                <button className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-gray-600 hover:bg-white hover:text-green-600 transition-colors border-r border-gray-100">
                    <Settings size={14} /> CONFIGURE
                </button>
                <button 
                  onClick={onDelete}
                  className="flex items-center justify-center gap-2 py-3 text-xs font-bold text-gray-600 hover:bg-white hover:text-red-600 transition-colors"
                >
                    <Trash2 size={14} /> DISCONNECT
                </button>
                </div>
            </div>
        )
    }

    // --- 2. Advanced Configuration View ---

    function AiConfigSettings() {
    const [activeConfigTab, setActiveConfigTab] = useState("general")
    const [apiKeyHidden, setApiKeyHidden] = useState(true)
    const [apiKey, setApiKey] = useState("")
    const [hfApiKey, setHfApiKey] = useState("")
    const [hfApiKeyHidden, setHfApiKeyHidden] = useState(true)
    const [groqApiKey, setGroqApiKey] = useState("")
    const [groqApiKeyHidden, setGroqApiKeyHidden] = useState(true)
    const [googleApiKey, setGoogleApiKey] = useState("")
    const [googleApiKeyHidden, setGoogleApiKeyHidden] = useState(true)
  const [testProvider, setTestProvider] = useState<"auto" | "openrouter" | "huggingface" | "github" | "groq" | "google">("auto")
    
    // Logic State
    const [systemPrompt, setSystemPrompt] = useState("")
    const [temperature, setTemperature] = useState(0.7)
    const [maxTokens, setMaxTokens] = useState(4096)
    const [topP, setTopP] = useState(1.0)
    
    const [configurations, setConfigurations] = useState<any[]>([])
    const [selectedUseCase, setSelectedUseCase] = useState<string>("AI_DOCTOR")
    const [enabledTools, setEnabledTools] = useState<string[]>([])
    const [customFunctions, setCustomFunctions] = useState<any[]>([])
    const [showCustomFunctionModal, setShowCustomFunctionModal] = useState(false)
    const [customFunctionJson, setCustomFunctionJson] = useState("")
    
    // --- VISUAL PROMPT BUILDER STATE ---
    const [promptMode, setPromptMode] = useState<"visual" | "raw">("visual")
  const [vpPersona, setVpPersona] = useState("SuperKillo Medical AI is a professional medical assistant designed to:\n- Analyze patient symptoms\n- Suggest possible illnesses\n- Recommend medicines strictly from the approved database\n- Provide safe and responsible medical guidance\n\nThe system must prioritize patient safety, clarity, and structured output compliance at all times.")
    const [vpStrictJson, setVpStrictJson] = useState(true)
  const [vpRules, setVpRules] = useState([
      "Always return ONLY valid JSON.",
      "Never return plain text outside JSON.",
      "Never include markdown formatting in responses.",
      "Never include explanations, commentary, or extra text outside the JSON object.",
      "Never wrap JSON inside code blocks.",
      "Never mix response formats.",
      "If required information is missing, make safe medical assumptions and clearly state uncertainty inside the response text.",
      "Medicine names must match exactly as stored in the approved database.",
      "Confidence values must be a number between 0 and 1."
  ])
  const [vpLanguages, setVpLanguages] = useState<PromptLanguage[]>([
      { code: "en", name: "English", flag: "🇬🇧" },
      { code: "ha", name: "Hausa", flag: "🇳🇬" },
      { code: "yo", name: "Yoruba", flag: "🇳🇬" },
      { code: "ps", name: "Pashto", flag: "🇦🇫" }
  ])
  const [vpSchemas, setVpSchemas] = useState<PromptSchema[]>([
      { 
          name: "Medicine Recommendation", 
          schema: `{\n  "english": "Main response in English",\n  "hausa": "Hausa translation",\n  "yoruba": "Yoruba translation",\n  "pashto": "Pashto translation",\n  "languages": [\n    {"code": "en", "name": "English", "flag": "🇬🇧"}\n  ],\n  "recommendations": [\n    {\n      "medicineName": "Exact database name",\n      "confidence": 0.0,\n      "reason": "Why this medicine is suitable",\n      "aiExplanation": "Detailed medical explanation",\n      "tabletUsage": {\n        "english": "Take 1 tablet twice daily...",\n        "hausa": "...",\n        "yoruba": "...",\n        "pashto": "..."\n      }\n    }\n  ],\n  "suggestedQuestions": [\n    {\n      "text": "Question text...",\n      "icon": "pulse",\n      "category": "symptom"\n    }\n  ]\n}`
      }
  ])
    const [newLang, setNewLang] = useState({ name: "", code: "", flag: "" })
    const [newRule, setNewRule] = useState("")

    // Terminal/Test State
    const [testPrompt, setTestPrompt] = useState("")
    const [testing, setTesting] = useState(false)
    const [terminalLines, setTerminalLines] = useState([
        { text: "System initialized. Environment: Production", type: "system" },
        { text: "Waiting for command input...", type: "wait" },
    ])
    const scrollRef = useRef<HTMLDivElement>(null)
    const [saving, setSaving] = useState(false)

  // Sync Visual Builder to System Prompt
  useEffect(() => {
      if (promptMode === "visual") {
        let compiled = "";
          
          compiled += `# Overview\n${vpPersona}\n\n`;

          if (vpStrictJson) {
              compiled += `CRITICAL JSON-ONLY RULE:\n- You MUST return ONLY valid JSON\n- NEVER include any text, explanations, or commentary BEFORE or AFTER the JSON\n- NEVER write "Based on..." or "Here are..." before the JSON\n- NEVER wrap JSON in \`\`\`json code blocks\n- Start your response directly with { and end with }\n\n`;
          }

          if (vpRules.length > 0) {
              compiled += `## Core Behavior Rules\n`;
              vpRules.forEach((r, i) => compiled += `${i + 1}. ${r}\n`);
            compiled += `\n`;
        }

          if (vpLanguages.length > 0) {
              compiled += `## Required Languages\nEvery user-facing response must include all ${vpLanguages.length} languages:\n`;
              vpLanguages.forEach(l => compiled += `- \`${l.name.toLowerCase()}\`\n`);
              
              compiled += `\n### Language Dropdown Format (REQUIRED)\nYou MUST include a "languages" array in EVERY response with language codes, flags, and native names:\n\`\`\`json\n{\n  "languages": [\n`;
              vpLanguages.forEach((l, i) => {
                  compiled += `    {\n      "code": "${l.code}",\n      "name": "${l.name}",\n      "flag": "${l.flag}"\n    }${i < vpLanguages.length - 1 ? ',' : ''}\n`;
              });
              compiled += `  ]\n}\n\`\`\`\n\n`;
          }

          if (vpSchemas.length > 0) {
              vpSchemas.forEach(s => {
                  compiled += `## ${s.name} Response Format\n\`\`\`json\n${s.schema}\n\`\`\`\n\n`;
              });
          }
        
        setSystemPrompt(compiled);
    }
  }, [vpPersona, vpStrictJson, vpRules, vpLanguages, vpSchemas, promptMode]);

    useEffect(() => {
        fetchConfigurations()
        const storedKey = localStorage.getItem("openrouter_api_key")
        const storedHfKey = localStorage.getItem("huggingface_api_key")
        const storedGroqKey = localStorage.getItem("groq_api_key")
        const storedGoogleKey = localStorage.getItem("google_ai_studio_api_key")
        if (storedKey) setApiKey(storedKey)
        if (storedHfKey) setHfApiKey(storedHfKey)
        if (storedGroqKey) setGroqApiKey(storedGroqKey)
        if (storedGoogleKey) setGoogleApiKey(storedGoogleKey)
    }, [])

    const fetchConfigurations = async () => {
        try {
        const response = await fetch("/api/admin/ai-config/config")
        const data = await response.json()
        if (data.configurations) {
            const activeConfigs = data.configurations.filter((c: any) => c.isActive)
            setConfigurations(activeConfigs)
            const configForUseCase = activeConfigs.find((c: any) => c.useCase === selectedUseCase) || activeConfigs[0]
            if (configForUseCase) loadConfig(configForUseCase)
        }
        } catch (error) {
        console.error("Failed to fetch configurations:", error)
        }
    }

    const loadConfig = (config: any) => {
    setSystemPrompt(config.systemPrompt || "")
        setTemperature(config.temperature ?? 0.7)
        setMaxTokens(config.maxTokens ?? 4096)
        setTopP(config.topP ?? 1.0)
        setSelectedUseCase(config.useCase || "AI_DOCTOR")
        setEnabledTools(config.enabledTools ? JSON.parse(JSON.stringify(config.enabledTools)) : [])
        setCustomFunctions(config.customFunctions ? JSON.parse(JSON.stringify(config.customFunctions)) : [])
    }

    const handleUseCaseChange = (newUseCase: string) => {
        setSelectedUseCase(newUseCase)
        const config = configurations.find((c: any) => c.useCase === newUseCase)
        if (config) {
        loadConfig(config)
        } else {
        setSystemPrompt("")
            setTemperature(0.7)
            setEnabledTools([])
            setCustomFunctions([])
        }
    }

    const handleSaveConfiguration = async () => {
        try {
        setSaving(true)
        const response = await fetch("/api/admin/ai-config/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            name: `${selectedUseCase} Configuration`,
            description: `Configuration for ${selectedUseCase}`,
            useCase: selectedUseCase,
          systemPrompt,
            enabledTools,
            customFunctions,
            temperature,
            maxTokens,
            topP,
            isActive: true,
            }),
        })

        if (response.ok) {
            setTerminalLines(prev => [...prev, { text: `✓ Configuration for ${selectedUseCase} saved successfully.`, type: "success" }])
            fetchConfigurations()
        } else {
            throw new Error("Failed to save")
        }
        } catch (error: any) {
        setTerminalLines(prev => [...prev, { text: `Error saving: ${error.message}`, type: "error" }])
        } finally {
        setSaving(false)
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100)
        }
    }

    const handleSaveApiKey = () => {
        if (!apiKey.trim()) return
        localStorage.setItem("openrouter_api_key", apiKey)
        setTerminalLines(prev => [...prev, { text: "OpenRouter API Key updated in local storage.", type: "success" }])
    }

    const handleSaveHfApiKey = () => {
        if (!hfApiKey.trim()) return
        localStorage.setItem("huggingface_api_key", hfApiKey)
        setTerminalLines(prev => [...prev, { text: "Hugging Face API Key updated in local storage.", type: "success" }])
    }

    const handleSaveGroqApiKey = () => {
        if (!groqApiKey.trim()) return
        localStorage.setItem("groq_api_key", groqApiKey)
        setTerminalLines(prev => [...prev, { text: "Groq API Key updated in local storage.", type: "success" }])
    }

    const handleSaveGoogleApiKey = () => {
        if (!googleApiKey.trim()) return
        localStorage.setItem("google_ai_studio_api_key", googleApiKey)
        setTerminalLines(prev => [...prev, { text: "Google AI Studio API Key updated in local storage.", type: "success" }])
    }

    const toggleTool = (toolName: string) => {
        setEnabledTools((prev) =>
        prev.includes(toolName)
            ? prev.filter((t) => t !== toolName)
            : [...prev, toolName]
        )
    }

    const handleTestRun = async () => {
        if (!testPrompt.trim()) return

        setTesting(true)
        const providerText =
          testProvider === "auto"
            ? "Auto (OpenRouter → GitHub → Hugging Face → Groq → Google AI Studio)"
            : testProvider === "openrouter"
            ? "OpenRouter"
            : testProvider === "huggingface"
            ? "Hugging Face"
            : testProvider === "github"
            ? "GitHub Models"
            : testProvider === "groq"
            ? "Groq"
            : "Google AI Studio"
        setTerminalLines(prev => [...prev, { text: `> ${testPrompt}`, type: "user" }, { text: `Testing with: ${providerText}...`, type: "system" }])

        try {
        const response = await fetch("/api/admin/ai-config/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
            useCase: selectedUseCase,
            testPrompt,
            category: "TEXT_TO_TEXT",
            provider: testProvider,
            }),
        })

        const data = await response.json()
        if (response.ok) {
            const modelInfo = data.result.modelName ? ` [${data.result.modelName}]` : ""
            setTerminalLines(prev => [...prev, { text: `✓ Response${modelInfo} (${data.result.latency}ms): ${data.result.content}`, type: "success" }])
        } else {
            throw new Error(data.error || "Test failed")
        }
        } catch (error: any) {
        setTerminalLines(prev => [...prev, { text: `✗ Test Failed: ${error.message}`, type: "error" }])
        } finally {
        setTesting(false)
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 100)
        }
    }

  const addLanguage = () => {
      if (!newLang.name || !newLang.code || !newLang.flag) return;
      setVpLanguages([...vpLanguages, newLang])
      setNewLang({ name: "", code: "", flag: "" })
  }

  const addRule = () => {
      if (!newRule.trim()) return;
      setVpRules([...vpRules, newRule.trim()]);
      setNewRule("");
    }

    return (
        <div className="animate-in slide-in-from-bottom-6 duration-700 min-h-[800px] flex flex-col gap-6">
        
        {/* GLOBAL CONFIG BAR */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-2 z-30">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="h-10 w-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Bot size={20} />
                </div>
                <div className="flex flex-col">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Editing Profile</label>
                    <div className="relative group">
                        <select 
                            value={selectedUseCase}
                            onChange={(e) => handleUseCaseChange(e.target.value)}
                            className="text-sm font-bold text-gray-900 bg-transparent border-none p-0 pr-6 focus:ring-0 cursor-pointer"
                        >
                            <option value="AI_DOCTOR">AI Doctor</option>
                            <option value="GENERAL_ANALYSIS">General Assistant</option>
                            <option value="ORDER_HISTORY">Order History</option>
                            <option value="AI_MECHANIC">AI Mechanic</option>
                            <option value="USER_ANALYTICS">User Analytics</option>
                            <option value="PRESCRIPTION_ANALYSIS">Prescription Analysis</option>
                            <option value="SMART_SHOP">Smart Shop</option>
                            
                            <option value="CUSTOM">Custom</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                <span className="text-xs text-gray-400 hidden sm:inline-block">Unsaved changes apply to {selectedUseCase}</span>
                <button 
                    onClick={handleSaveConfiguration}
                    disabled={saving}
                    className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-gray-200 transition-all active:scale-95 disabled:opacity-50 w-full sm:w-auto"
                >
                    <Save size={16}/>
                    {saving ? "Saving..." : "Save Configuration"}
                </button>
            </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Sidebar Navigation */}
            <div className="w-full lg:w-64 flex-shrink-0 space-y-6">
                <div className="flex flex-col gap-1">
                    <ConfigSidebarItem active={activeConfigTab === "general"} onClick={() => setActiveConfigTab("general")} icon={<Brain size={16}/>} label="System Prompt" />
                    <ConfigSidebarItem active={activeConfigTab === "params"} onClick={() => setActiveConfigTab("params")} icon={<Sliders size={16}/>} label="Hyperparameters" />
                    <ConfigSidebarItem active={activeConfigTab === "tools"} onClick={() => setActiveConfigTab("tools")} icon={<Database size={16}/>} label="Tools & Knowledge" />
                    <div className="my-2 border-t border-gray-200/50"></div>
                    <ConfigSidebarItem active={activeConfigTab === "api"} onClick={() => setActiveConfigTab("api")} icon={<Key size={16}/>} label="API Credentials" />
                </div>

                {/* Context Widget */}
                <div className="rounded-2xl bg-gradient-to-br from-green-900 to-slate-900 p-5 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 h-20 w-20 rounded-full bg-white/10 blur-xl"></div>
                    <Database className="relative z-10 mb-3 text-green-300" size={24} />
                    <h4 className="relative z-10 font-bold text-sm">Vector Store</h4>
                    <p className="relative z-10 text-xs text-green-200 mt-1 mb-3">Connect RAG knowledge base for context-aware responses.</p>
                    <button className="relative z-10 w-full py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-semibold transition-colors border border-white/10">Manage Index</button>
                </div>
            </div>

            {/* Main Configuration Area */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Center Column: Editor & Main Logic */}
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* 1. General Tab: Visual Prompt Builder & Code Editor */}
                    {activeConfigTab === "general" && (
                        <div className="space-y-4">
                            {/* Editor Toolbar */}
                            <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-50 rounded-xl text-green-600"><LayoutTemplate size={18}/></div>
                                    <div>
                                        <h2 className="text-sm font-bold text-gray-900">Prompt Designer</h2>
                                        <p className="text-[10px] text-gray-500 font-medium">Build structured AI instructions.</p>
                                    </div>
                                </div>
                                <div className="flex items-center bg-gray-100/80 p-1.5 rounded-xl border border-gray-200/60 shadow-inner w-full sm:w-auto">
                                    <button 
                                        onClick={() => setPromptMode('visual')} 
                                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${promptMode === 'visual' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <BrainCircuit size={14}/> Visual Builder
                                    </button>
                                    <button 
                                        onClick={() => setPromptMode('raw')} 
                                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${promptMode === 'raw' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <Code size={14}/> Raw Output
                                    </button>
                                </div>
                            </div>

                            {/* Visual Builder Mode */}
                            {promptMode === "visual" ? (
                                <div className="space-y-4 animate-in fade-in duration-300">
                                    
                                    {/* Block 1: Persona */}
                                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Type size={16} className="text-blue-500"/>
                                            <h3 className="text-sm font-bold text-gray-900">Context & Persona</h3>
                                        </div>
                                        <textarea 
                                            value={vpPersona}
                                        onChange={(e) => setVpPersona(e.target.value)}
                                            className="w-full h-32 resize-none p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all leading-relaxed"
                                            placeholder="Describe the AI's role, expertise, and primary objective..."
                                        />
                                    </div>

                                    {/* Block 2: JSON Enforcer */}
                                <div className={`rounded-2xl shadow-sm ring-1 p-5 flex items-center justify-between cursor-pointer transition-all ${vpStrictJson ? 'bg-amber-50/50 ring-amber-200' : 'bg-white ring-gray-200 hover:bg-gray-50'}`} onClick={() => setVpStrictJson(!vpStrictJson)}>
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-xl ${vpStrictJson ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}>
                                                <Shield size={18}/>
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-bold text-gray-900">Enforce Strict JSON Output</h3>
                                                <p className="text-xs text-gray-500 mt-0.5">Injects critical rules preventing markdown blocks and conversational text.</p>
                                            </div>
                                        </div>
                                        {vpStrictJson ? <ToggleRight size={28} className="text-amber-500"/> : <ToggleLeft size={28} className="text-gray-300"/>}
                                    </div>

                                    {/* Block 3: Language Matrix */}
                                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <Globe size={16} className="text-green-500"/>
                                            <h3 className="text-sm font-bold text-gray-900">Language Matrix</h3>
                                            <span className="ml-auto text-[10px] font-medium bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">Auto-generates JSON array format</span>
                                        </div>
                                        
                                        <div className="flex flex-wrap gap-2">
                                            {vpLanguages.map((lang, idx) => (
                                                <div key={idx} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-2 py-1.5 group hover:border-green-300 transition-colors">
                                                    <span className="text-sm">{lang.flag}</span>
                                                    <span className="text-xs font-bold text-gray-700">{lang.name}</span>
                                                    <span className="text-[10px] font-mono text-gray-400 bg-white border border-gray-100 px-1.5 py-0.5 rounded">{lang.code}</span>
                                                <button onClick={() => setVpLanguages(vpLanguages.filter((_, i) => i !== idx))} className="ml-1 text-gray-400 hover:text-red-500 p-0.5 rounded-md hover:bg-red-50">
                                                        <X size={14}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                                            <input 
                                                placeholder="🇳🇬" value={newLang.flag} onChange={(e)=>setNewLang({...newLang, flag: e.target.value})}
                                                className="w-12 text-center text-sm bg-gray-50 border-gray-200 rounded-lg focus:border-green-500 focus:ring-green-500/20"
                                                title="Emoji Flag"
                                            />
                                            <input 
                                                placeholder="Language (e.g. Hausa)" value={newLang.name} onChange={(e)=>setNewLang({...newLang, name: e.target.value})}
                                                className="flex-1 text-sm bg-gray-50 border-gray-200 rounded-lg focus:border-green-500 focus:ring-green-500/20"
                                            />
                                            <input 
                                                placeholder="Code (e.g. ha)" value={newLang.code} onChange={(e)=>setNewLang({...newLang, code: e.target.value})}
                                                className="w-24 text-sm bg-gray-50 border-gray-200 rounded-lg focus:border-green-500 focus:ring-green-500/20 font-mono"
                                            />
                                        <button onClick={addLanguage} disabled={!newLang.name || !newLang.code || !newLang.flag} className="bg-gray-900 text-white p-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors">
                                                <Plus size={18}/>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Block 4: Core Directives */}
                                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <List size={16} className="text-purple-500"/>
                                            <h3 className="text-sm font-bold text-gray-900">Core Directives</h3>
                                        </div>
                                        <div className="space-y-2">
                                            {vpRules.map((rule, idx) => (
                                                <div key={idx} className="flex items-start gap-3 bg-gray-50 border border-gray-100 p-3 rounded-xl group">
                                                    <span className="text-xs font-bold text-purple-600 bg-purple-100 w-5 h-5 flex items-center justify-center rounded-md shrink-0">{idx + 1}</span>
                                                    <p className="text-xs font-medium text-gray-700 flex-1 pt-0.5 leading-relaxed">{rule}</p>
                                                <button onClick={() => setVpRules(vpRules.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Trash2 size={14}/>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input 
                                            placeholder="Add a new behavioral rule..." value={newRule} onChange={(e)=>setNewRule(e.target.value)} onKeyDown={(e)=>e.key==='Enter' && addRule()}
                                                className="flex-1 text-sm bg-gray-50 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-purple-500/20"
                                            />
                                        <button onClick={addRule} disabled={!newRule.trim()} className="bg-purple-100 text-purple-700 px-4 rounded-xl text-xs font-bold hover:bg-purple-200 disabled:opacity-50 transition-colors">
                                                Add Rule
                                            </button>
                                        </div>
                                    </div>

                                    {/* Block 5: JSON Response Format */}
                                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <FileJson size={16} className="text-orange-500"/>
                                                <h3 className="text-sm font-bold text-gray-900">Output Formats</h3>
                                            </div>
                                        </div>
                                        
                                        {vpSchemas.map((schema, idx) => (
                                            <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
                                                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-white">
                                                    <input 
                                                        value={schema.name}
                                                        onChange={(e) => {
                                                            const newSchemas = [...vpSchemas];
                                                            newSchemas[idx].name = e.target.value;
                                                        setVpSchemas(newSchemas);
                                                        }}
                                                        className="font-bold text-sm text-gray-900 bg-transparent border-none focus:ring-0 p-0"
                                                        placeholder="Format Name (e.g. Medicine Recommendation)"
                                                    />
                                                <button onClick={() => setVpSchemas(vpSchemas.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                                                </div>
                                                <textarea 
                                                    value={schema.schema}
                                                    onChange={(e) => {
                                                        const newSchemas = [...vpSchemas];
                                                        newSchemas[idx].schema = e.target.value;
                                                    setVpSchemas(newSchemas);
                                                    }}
                                                    className="w-full h-64 p-4 font-mono text-[11px] leading-relaxed bg-transparent border-none resize-y focus:ring-0 text-gray-800"
                                                    placeholder="{ ... }"
                                                    spellCheck={false}
                                                />
                                            </div>
                                        ))}
                                    <button onClick={() => setVpSchemas([...vpSchemas, {name: "New Format", schema: "{}"}])} className="w-full py-3 border border-dashed border-gray-300 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-2">
                                            <Plus size={14}/> Add Custom JSON Schema
                                        </button>
                                    </div>

                                </div>
                            ) : (
                                /* RAW EDITOR MODE */
                                <div className="bg-[#1E1E1E] rounded-2xl shadow-sm ring-1 ring-gray-800 overflow-hidden flex flex-col h-[700px] animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-[#252526]">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-gray-800 rounded-md text-gray-400"><Code size={14}/></div>
                                        <span className="text-sm font-bold text-gray-200">Raw Markdown (Read-Only sync with Visual Builder)</span>
                                        </div>
                                    <span className="text-[10px] font-mono text-gray-500">Target: {selectedUseCase}</span>
                                    </div>

                                    <div className="flex-1 relative font-mono text-[13px] group">
                                        <div className="absolute inset-y-0 left-0 w-12 bg-[#1E1E1E] border-r border-gray-800 text-gray-600 flex flex-col items-center pt-4 select-none">
                                            {Array.from({length: 30}).map((_, i) => <span key={i} className="mb-[6px]">{i+1}</span>)}
                                        </div>
                                        <textarea 
                                            value={systemPrompt}
                                        readOnly
                                            className="w-full h-full resize-none border-none p-4 pl-16 focus:ring-0 bg-transparent text-gray-300 leading-relaxed custom-scrollbar"
                                            placeholder={`# ROLE\nYou are an AI assistant for ${selectedUseCase}...`}
                                            spellCheck={false}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. Tools Tab */}
                    {activeConfigTab === "tools" && (
                        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6 space-y-6">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="font-bold text-gray-900">Active Capabilities</h3>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div 
                                    onClick={() => toggleTool("web_search")}
                                    className={`border rounded-xl p-4 cursor-pointer transition-all ${enabledTools.includes("web_search") ? "border-green-500 bg-green-50/50" : "border-gray-200 hover:border-gray-300"}`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2 font-semibold text-sm">
                                            <Globe size={16} className="text-blue-500"/> Web Search
                                        </div>
                                        {enabledTools.includes("web_search") ? <ToggleRight className="text-green-600"/> : <ToggleLeft className="text-gray-300"/>}
                                    </div>
                                    <p className="text-xs text-gray-500">Access real-time internet data.</p>
                                </div>
                                <div 
                                    onClick={() => toggleTool("code_interpreter")}
                                    className={`border rounded-xl p-4 cursor-pointer transition-all ${enabledTools.includes("code_interpreter") ? "border-green-500 bg-green-50/50" : "border-gray-200 hover:border-gray-300"}`}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2 font-semibold text-sm">
                                            <Terminal size={16} className="text-purple-500"/> Code Interpreter
                                        </div>
                                        {enabledTools.includes("code_interpreter") ? <ToggleRight className="text-green-600"/> : <ToggleLeft className="text-gray-300"/>}
                                    </div>
                                    <p className="text-xs text-gray-500">Python sandbox for calculations.</p>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-900">Custom Functions</h3>
                                    <button onClick={() => setShowCustomFunctionModal(true)} className="text-xs font-bold text-green-600 hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                                        <Plus size={14}/> Add Schema
                                    </button>
                                </div>
                                {customFunctions.length === 0 ? (
                                    <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm">
                                        No custom functions defined for {selectedUseCase}.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {customFunctions.map((func:any, idx) => (
                                            <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <span className="font-mono text-xs font-bold text-gray-700">{func.function?.name}</span>
                                                <button onClick={() => setCustomFunctions(f => f.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                                                    <X size={14}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 3. Params Tab */}
                    {activeConfigTab === "params" && (
                        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6">
                            <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <Sliders size={18} className="text-gray-400"/> Model Parameters
                            </h3>
                            <div className="space-y-8 max-w-lg">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-600 uppercase">Temperature</label>
                                        <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded-md border border-green-100">{temperature}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="2" step="0.1"
                                        value={temperature}
                                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600 hover:accent-green-700" 
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400">
                                        <span>Precise (0.0)</span>
                                        <span>Creative (2.0)</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <label className="text-xs font-bold text-gray-600 uppercase">Top P</label>
                                        <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded-md border border-green-100">{topP}</span>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.1"
                                        value={topP}
                                        onChange={(e) => setTopP(parseFloat(e.target.value))}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600 hover:accent-green-700" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. API Tab */}
                    {activeConfigTab === "api" && (
                        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-6 space-y-6">
                            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Key size={18} className="text-gray-400"/> Provider Credentials
                            </h3>
                            
                            {/* OpenRouter */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Globe size={14} className="text-blue-500"/>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">OpenRouter API Key</label>
                                </div>
                                <div className="relative">
                                    <input 
                                        type={apiKeyHidden ? "password" : "text"}
                                        value={apiKey}
                                        onChange={(e) => setApiKey(e.target.value)}
                                        placeholder="sk-or-v1-..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-gray-600 focus:ring-green-500 focus:border-green-500"
                                    />
                                    <button 
                                        onClick={() => setApiKeyHidden(!apiKeyHidden)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {apiKeyHidden ? <Eye size={14}/> : <EyeOff size={14}/>}
                                    </button>
                                </div>
                                <button onClick={handleSaveApiKey} className="bg-green-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                                    Save OpenRouter Key
                                </button>
                            </div>

                            <div className="border-t border-gray-200"></div>

                            {/* Hugging Face */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Brain size={14} className="text-yellow-500"/>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Hugging Face API Key</label>
                                </div>
                                <div className="relative">
                                    <input 
                                        type={hfApiKeyHidden ? "password" : "text"}
                                        value={hfApiKey}
                                        onChange={(e) => setHfApiKey(e.target.value)}
                                        placeholder="hf_..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-gray-600 focus:ring-yellow-500 focus:border-yellow-500"
                                    />
                                    <button 
                                        onClick={() => setHfApiKeyHidden(!hfApiKeyHidden)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {hfApiKeyHidden ? <Eye size={14}/> : <EyeOff size={14}/>}
                                    </button>
                                </div>
                                <button onClick={handleSaveHfApiKey} className="bg-yellow-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors">
                                    Save Hugging Face Key
                                </button>
                            </div>

                            <div className="border-t border-gray-200"></div>

                            {/* Groq */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap size={14} className="text-fuchsia-500"/>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Groq API Key</label>
                                </div>
                                <div className="relative">
                                    <input 
                                        type={groqApiKeyHidden ? "password" : "text"}
                                        value={groqApiKey}
                                        onChange={(e) => setGroqApiKey(e.target.value)}
                                        placeholder="gsk_..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-gray-600 focus:ring-fuchsia-500 focus:border-fuchsia-500"
                                    />
                                    <button 
                                        onClick={() => setGroqApiKeyHidden(!groqApiKeyHidden)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {groqApiKeyHidden ? <Eye size={14}/> : <EyeOff size={14}/>}
                                    </button>
                                </div>
                                <button onClick={handleSaveGroqApiKey} className="bg-fuchsia-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-fuchsia-700 transition-colors">
                                    Save Groq Key
                                </button>
                            </div>

                            <div className="border-t border-gray-200"></div>

                            {/* Google AI Studio */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <Bot size={14} className="text-indigo-500"/>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Google AI Studio API Key</label>
                                </div>
                                <div className="relative">
                                    <input 
                                        type={googleApiKeyHidden ? "password" : "text"}
                                        value={googleApiKey}
                                        onChange={(e) => setGoogleApiKey(e.target.value)}
                                        placeholder="AIza..."
                                        className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <button 
                                        onClick={() => setGoogleApiKeyHidden(!googleApiKeyHidden)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {googleApiKeyHidden ? <Eye size={14}/> : <EyeOff size={14}/>}
                                    </button>
                                </div>
                                <button onClick={handleSaveGoogleApiKey} className="bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                                    Save Google AI Studio Key
                                </button>
                            </div>

                        <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-200">Note: API Keys are stored locally in this browser only. Auto testing follows your queue fallback order.</p>
                        </div>
                    )}

                {/* Test Console (Always Visible at bottom of center col) */}
                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-1">
                        <div className="flex items-center justify-between p-3 border-b border-gray-100">
                            <div className="flex items-center gap-2">
                                <Terminal size={16} className="text-gray-400"/>
                                <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Playground Console ({selectedUseCase})</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase text-xs">Provider:</label>
                                <select 
                                    value={testProvider}
                                    onChange={(e) => setTestProvider(e.target.value as "auto" | "openrouter" | "huggingface" | "github" | "groq" | "google")}
                                    className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:ring-green-500 focus:border-green-500"
                                >
                                    <option value="auto">Auto (OR → GH → HF → GQ → GG)</option>
                                    <option value="openrouter">OpenRouter Only</option>
                                    <option value="github">GitHub Models Only</option>
                                    <option value="huggingface">Hugging Face Only</option>
                                    <option value="groq">Groq Only</option>
                                    <option value="google">Google AI Studio Only</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-3">
                            <div className="flex gap-2">
                                <input 
                                    value={testPrompt}
                                    onChange={(e) => setTestPrompt(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleTestRun()}
                                    className="flex-1 bg-gray-50 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-green-500 focus:ring-4 focus:ring-green-500/10 transition-all"
                                    placeholder={`Test your ${selectedUseCase} config...`}
                                />
                                <button 
                                    onClick={handleTestRun}
                                    disabled={testing || !testPrompt}
                                    className="bg-green-600 hover:bg-green-700 text-white px-5 rounded-xl font-bold text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                                >
                                    {testing ? <div className="animate-spin h-4 w-4 border-2 border-white/30 border-t-white rounded-full"/> : <Play size={16} fill="currentColor"/>}
                                    Run
                                </button>
                            </div>
                        </div>
                    {/* Terminal Output */}
                        <div ref={scrollRef} className="bg-[#1E1E1E] m-1 rounded-xl p-4 font-mono text-xs text-gray-300 h-40 overflow-y-auto custom-scrollbar shadow-inner">
                            {terminalLines.map((line, i) => (
                                <div key={i} className={`mb-1.5 break-all ${line.type === 'user' ? 'text-white font-bold' : line.type === 'success' ? 'text-emerald-400' : line.type === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                                    {line.type === 'user' ? '> ' : ''}{line.text}
                                </div>
                            ))}
                            {testing && <div className="w-2 h-4 bg-green-500 animate-pulse inline-block align-middle ml-1"></div>}
                        </div>
                    </div>

                </div>

            {/* Right Column: Mini Controls (Quick Access) */}
                <div className="space-y-6">
                    
                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5">
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Sliders size={18} className="text-gray-400"/> Parameters Summary
                        </h3>
                        
                        <div className="space-y-8">
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-gray-600 uppercase">Temperature</label>
                                    <span className="bg-green-50 text-green-700 text-xs font-bold px-2 py-1 rounded-md border border-green-100">{temperature}</span>
                                </div>
                                <input 
                                    type="range" min="0" max="2" step="0.1"
                                    value={temperature}
                                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600 hover:accent-green-700" 
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-gray-600 uppercase">Max Tokens</label>
                                    <span className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-1 rounded-md border border-gray-200">{maxTokens}</span>
                                </div>
                                <input 
                                    type="range" min="256" max="8192" step="256"
                                    value={maxTokens}
                                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600" 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Lock size={16} className="text-gray-400"/> Key Status
                            </h3>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${apiKey ? "bg-emerald-500" : "bg-red-500"}`}></div>
                                <span className="text-gray-600">OpenRouter: {apiKey ? "Configured" : "Missing"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${hfApiKey ? "bg-yellow-500" : "bg-red-500"}`}></div>
                                <span className="text-gray-600">Hugging Face: {hfApiKey ? "Configured" : "Missing"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${groqApiKey ? "bg-fuchsia-500" : "bg-red-500"}`}></div>
                                <span className="text-gray-600">Groq: {groqApiKey ? "Configured" : "Missing"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                                <div className={`w-2 h-2 rounded-full ${googleApiKey ? "bg-indigo-500" : "bg-red-500"}`}></div>
                                <span className="text-gray-600">Google AI Studio: {googleApiKey ? "Configured" : "Missing"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>

        {/* Custom Function Modal */}
        {showCustomFunctionModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                <div className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-2xl">
                    <h3 className="font-bold text-gray-900 mb-2">Add Custom Function Schema</h3>
                    <p className="text-xs text-gray-500 mb-4">Define a function call schema (JSON) that the model can execute.</p>
                    <textarea 
                        value={customFunctionJson}
                        onChange={(e) => setCustomFunctionJson(e.target.value)}
                        className="w-full h-64 font-mono text-xs border border-gray-200 rounded-xl p-4 mb-4 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-green-500/20"
                        placeholder={`{ "type": "function", "function": { "name": "get_weather", ... } }`}
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setShowCustomFunctionModal(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button 
                            onClick={() => {
                                try {
                                    const parsed = JSON.parse(customFunctionJson)
                                    setCustomFunctions([...customFunctions, parsed])
                                    setCustomFunctionJson("")
                                    setShowCustomFunctionModal(false)
                                } catch(e) { alert("Invalid JSON") }
                            }} 
                            className="px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg"
                        >
                            Add Function
                        </button>
                    </div>
                </div>
            </div>
        )}

        </div>
    )
    }

// --- 3. OpenRouter Modal ---

    function OpenRouterModal({ onClose }: { onClose: () => void }) {
    const [search, setSearch] = useState("")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [models, setModels] = useState<OpenRouterModel[]>([])
    const [loading, setLoading] = useState(true)
    const [apiKey, setApiKey] = useState("")
    const [showKeyInput, setShowKeyInput] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const storedKey = localStorage.getItem("openrouter_api_key")
        if (storedKey) {
            setApiKey(storedKey)
            fetchModels(storedKey)
        } else {
            setShowKeyInput(true)
        }
    }, [])
    function formatPrice(value: string) {
      const num = parseFloat(value)
      return num > 0 ? `$${(num * 1_000_000).toFixed(2)}/M` : "Free"
    }

    const formatCostPer1M = (costString: string | undefined) => {
      const cost = parseFloat(costString || "0") * 1000000;
      if (cost === 0) return "Free";
      return "$" + cost.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  };

    const fetchModels = async (key: string) => {
        try {
            setLoading(true)
            const response = await fetch(`/api/admin/ai-config/models/openrouter?apiKey=${encodeURIComponent(key)}`)
            const data = await response.json()
            if (data.models) setModels(data.models)
        } catch (error) {
            console.error("Fetch failed", error)
        } finally {
            setLoading(false)
        }
    }

    const handleConnectModel = async () => {
        if (!selectedId) return
        const selectedModel = models.find(m => m.id === selectedId)
        if (!selectedModel) return

        setSaving(true)
        try {
            const modality = selectedModel.architecture?.modality || ""
            const category = modality.includes("image") ? "IMAGE_TO_TEXT" : "TEXT_TO_TEXT"
            
            const response = await fetch("/api/admin/ai-config/models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: selectedModel.name,
                    modelId: selectedModel.id,
                    provider: selectedModel.id.split("/")[0],
                    description: selectedModel.description,
                    category,
                    apiKey,
                    contextLength: selectedModel.context_length,
                    modality: selectedModel.architecture?.modality,
                    pricing: selectedModel.pricing,
                }),
            })
            if (response.ok) {
                window.location.reload()
                onClose()
            }
        } catch (error) {
            alert("Failed to connect model")
        } finally {
            setSaving(false)
        }
    }

    const filteredModels = models.filter(m => 
        m.name.toLowerCase().includes(search.toLowerCase()) || 
        m.id.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="flex h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 flex-col md:flex-row">
            
            {showKeyInput ? (
                 <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                     <Key size={48} className="text-gray-300"/>
                     <h3 className="text-xl font-bold text-gray-900">OpenRouter API Key Required</h3>
                     <input 
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="sk-or-v1-..."
                        className="w-full max-w-md border border-gray-200 rounded-lg p-3"
                     />
                     <button onClick={() => { localStorage.setItem("openrouter_api_key", apiKey); setShowKeyInput(false); fetchModels(apiKey); }} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold">Continue</button>
                 </div>
            ) : (
                <>
                {/* Left Panel: List */}
                <div className="w-full md:w-5/12 bg-gray-50/30 flex flex-col border-r border-gray-200/80 relative h-full">
    {/* Premium Sticky Header with Glassmorphism */}
    <div className="p-5 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
        <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-1">Select Model</h3>
        <p className="text-sm text-gray-500 mb-5 font-medium">Choose an AI model from the registry.</p>
        
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-green-600 transition-colors duration-300" />
            </div>
            <input 
                type="text" 
                placeholder="Search models..." 
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 shadow-sm focus:border-green-500 focus:ring-4 focus:ring-green-500/10 focus:outline-none transition-all duration-300"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
        </div>
    </div>

    {/* Scrollable Model List */}
    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gray-50/50">
        {loading ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-3">
                <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-gray-500 animate-pulse">Loading models...</span>
            </div>
        ) : filteredModels.map((m) => {
            const isSelected = selectedId === m.id;
            const provider = m.id.split('/')[0];
            const contextK = Math.round(m.context_length / 1024);

            return (
                <div 
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-300 group overflow-hidden ${
                        isSelected 
                        ? "bg-white ring-2 ring-green-600 shadow-lg shadow-green-600/10" 
                        : "bg-white border border-gray-200 shadow-sm hover:border-green-300 hover:shadow-md hover:shadow-green-500/5"
                    }`}
                >
                    {/* Active State Accent Bar */}
                    {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-600 rounded-l-2xl" />
                    )}

                    <div className="flex justify-between items-start mb-3">
                        <div className="pr-4">
                            {/* Provider & Modality Tag */}
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-gray-500">
                                    {provider}
                                </span>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${
                                    isSelected 
                                    ? "bg-green-50 text-green-700 border-green-200" 
                                    : "bg-gray-50 text-gray-600 border-gray-200"
                                }`}>
                                    {m.architecture.input_modalities.join(" / ")}
                                </span>
                            </div>
                            
                            {/* Model Name */}
                            <h4 className={`text-sm font-bold leading-tight ${isSelected ? "text-green-950" : "text-gray-900"}`}>
                                {m.name}
                            </h4>
                        </div>

                        {/* Context Length Badge */}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border flex-shrink-0 ${
                            isSelected ? "bg-green-50 border-green-100 text-green-700" : "bg-gray-50 border-gray-100 text-gray-600"
                        }`}>
                            <span className="block text-[10px] font-mono font-bold">{contextK}k</span>
                        </div>
                    </div>

                    {/* Highly polished Pricing Grid */}
                    <div className={`grid grid-cols-3 gap-2 pt-3 mt-1 border-t ${isSelected ? 'border-green-100' : 'border-gray-100'}`}>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Prompt</span>
                            <span className={`text-xs font-mono font-medium ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                                {formatPrice(m.pricing.prompt)}
                            </span>
                        </div>
                        
                        <div className="flex flex-col border-l border-gray-100 pl-2">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Completion</span>
                            <span className={`text-xs font-mono font-medium ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                                {formatPrice(m.pricing.completion)}
                            </span>
                        </div>
                        
                        <div className="flex flex-col border-l border-gray-100 pl-2">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Cache</span>
                            <span className={`text-xs font-mono font-medium ${isSelected ? 'text-green-700' : 'text-gray-700'}`}>
                                {formatPrice((m.pricing as any).input_cache_read || "0")}
                            </span>
                        </div>
                    </div>
                </div>
            )
        })}
    </div>
</div>

                {/* Right Panel: Details */}
                <div className="flex-1 bg-white flex flex-col relative h-full overflow-hidden">
            {/* Premium Floating Close Button */}
            <button 
                onClick={onClose} 
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 p-2.5 rounded-full transition-all duration-200 z-20 backdrop-blur-md bg-white/50"
            >
                <X size={20} strokeWidth={2.5}/>
            </button>
            
            {selectedId ? (
                <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-500 h-full">
                    
                    {/* --- Premium Header Section --- */}
                    <div className="px-8 pt-10 pb-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white relative">
                        <div className="flex items-start gap-5 relative z-10">
                            {/* Gradient Icon Box */}
                            <div className="h-16 w-16 flex-shrink-0 rounded-2xl bg-gradient-to-br from-green-500 via-green-400 to-green-500 p-[1px] shadow-lg shadow-green-500/20">
                                <div className="w-full h-full bg-white/10 rounded-[15px] flex items-center justify-center backdrop-blur-md text-white">
                                    <BrainCircuit size={32} strokeWidth={1.5} />
                                </div>
                            </div>
                            
                            <div className="flex-1 pt-1">
                                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-tight mb-2">
                                    {models.find(model => model.id === selectedId)?.name.split(': ').map((part, i, arr) => (
                                        <span key={i}>
                                            {part}{i < arr.length - 1 && <span className="text-gray-400 font-normal">: </span>}
                                        </span>
                                    ))}
                                </h2>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200/60 px-2.5 py-1 rounded-md shadow-sm">
                                        {models.find(model => model.id === selectedId)?.id}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* --- Scrollable Body Section --- */}
                    <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                        
                        {/* Quick Specs Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50/50 border border-green-100/50">
                                <div className="p-2 bg-green-100 text-green-600 rounded-lg"><Maximize size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Context Window</p>
                                    <p className="text-sm font-bold text-green-950">{Math.round((models.find(model => model.id === selectedId)?.context_length || 0) / 1024)}k Tokens</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50/50 border border-green-100/50">
                                <div className="p-2 bg-green-100 text-green-600 rounded-lg"><Layers size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Capabilities</p>
                                    <p className="text-sm font-bold text-green-950 capitalize">{models.find(model => model.id === selectedId)?.architecture?.input_modalities?.join(" & ") || "N/A"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50/50 border border-green-100/50">
                                <div className="p-2 bg-green-100 text-green-600 rounded-lg"><TerminalSquare size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Tokenizer</p>
                                    <p className="text-sm font-bold text-green-950">{((models.find(model => model.id === selectedId)?.architecture as any)?.tokenizer) || "Standard"}</p>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <MessageSquare size={16} className="text-gray-400"/> About this Model
                            </h3>
                            {/* whitespace-pre-line properly renders the \n\n from your JSON as paragraphs */}
                            <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                                {models.find(model => model.id === selectedId)?.description}
                            </p>
                        </div>

                        {/* Pricing Grid */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <Coins size={16} className="text-gray-400"/> Estimated Costs <span className="text-xs font-medium text-gray-400 font-normal">(per 1M tokens)</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm relative overflow-hidden group hover:border-green-300 transition-colors">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Zap size={48}/></div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Input (Prompt)</p>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-2xl font-black text-gray-900">{formatCostPer1M(models.find(model => model.id === selectedId)?.pricing.prompt)}</p>
                                        {parseFloat(models.find(model => model.id === selectedId)?.pricing.prompt || "0") > 0 && <span className="text-sm font-bold text-gray-400">/M</span>}
                                    </div>
                                    {models.find(model => model.id === selectedId)?.architecture?.input_modalities?.includes("image") && (
                                        <p className="text-[10px] font-medium text-gray-500 mt-2 flex items-center gap-1.5 bg-gray-50 inline-flex px-2 py-1 rounded-md">
                                            <ImageIcon size={12}/> Vision: {formatCostPer1M((models.find(model => model.id === selectedId)?.pricing as any)?.vision)}
                                        </p>
                                    )}
                                </div>

                                <div className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm relative overflow-hidden group hover:border-green-300 transition-colors">
                                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Cpu size={48}/></div>
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Output (Completion)</p>
                                    <div className="flex items-baseline gap-1">
                                        <p className="text-2xl font-black text-gray-900">{formatCostPer1M(models.find(model => model.id === selectedId)?.pricing.completion)}</p>
                                        {parseFloat(models.find(model => model.id === selectedId)?.pricing.completion || "0") > 0 && <span className="text-sm font-bold text-gray-400">/M</span>}
                                    </div>
                                    {parseFloat((models.find(model => model.id === selectedId)?.pricing as any)?.internal_reasoning || "0") > 0 && (
                                        <p className="text-[10px] font-medium text-gray-500 mt-2 flex items-center gap-1.5 bg-gray-50 inline-flex px-2 py-1 rounded-md">
                                            <BrainCircuit size={12}/> Reasoning: {formatCostPer1M((models.find(model => model.id === selectedId)?.pricing as any)?.internal_reasoning)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* --- Sticky Glassmorphism Footer --- */}
                    <div className="p-5 border-t border-gray-200/60 bg-white/80 backdrop-blur-xl flex justify-end gap-3 z-10">
                        <button 
                            onClick={onClose} 
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConnectModel}
                            disabled={saving}
                            className="relative overflow-hidden px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 group"
                        >
                            {/* Vibrant Button Gradient */}
                            <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-green-500 to-green-600 group-hover:scale-105 transition-transform duration-500"></div>
                            
                            <span className="relative flex items-center justify-center gap-2">
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Connecting...
                                    </>
                                ) : (
                                    <>Connect Model <Zap size={16} className="fill-white/20"/></>
                                )}
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                /* --- Beautiful Empty State --- */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50/30">
                    <div className="relative mb-6">
                          <div className="absolute inset-0 bg-green-500 blur-[40px] opacity-20 rounded-full"></div>
                        <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-white to-green-50 border border-green-100/50 flex items-center justify-center shadow-xl shadow-green-900/5">
                            <Server size={40} className="text-green-400" strokeWidth={1.5} />
                        </div>
                    </div>
                    <h3 className="text-xl font-extrabold text-gray-900 mb-2">No Model Selected</h3>
                    <p className="text-sm font-medium text-gray-500 max-w-[260px] leading-relaxed">
                        Browse the registry on the left and select an AI model to view its capabilities, pricing, and specs.
                    </p>
                </div>
            )}
        </div>
                </>
            )}
        </div>
      </div>
    )
}

// --- 4. Hugging Face Modal ---

type HuggingFaceModel = {
  id: string
  name: string
  description: string
  context_length: number
  architecture: {
    modality: string
    input_modalities: string[]
    output_modalities: string[]
    tokenizer?: string
    model_type?: string
  }
  pricing: {
    prompt: string
    completion: string
  }
    }

    function HuggingFaceModal({ onClose }: { onClose: () => void }) {
    const [search, setSearch] = useState("")
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [models, setModels] = useState<HuggingFaceModel[]>([])
    const [loading, setLoading] = useState(true)
    const [apiKey, setApiKey] = useState("")
    const [showKeyInput, setShowKeyInput] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        const storedKey = localStorage.getItem("huggingface_api_key")
        if (storedKey) {
            setApiKey(storedKey)
            fetchModels(storedKey)
        } else {
            setShowKeyInput(true)
        }
    }, [])

    const formatPrice = (value: string) => {
      const num = parseFloat(value)
      return num > 0 ? `$${(num * 1_000_000).toFixed(2)}/M` : "Free"
    }

    const formatCostPer1M = (costString: string | undefined) => {
      const cost = parseFloat(costString || "0") * 1000000;
      if (cost === 0) return "Free";
      return "$" + cost.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
    };

    const fetchModels = async (key: string) => {
        try {
            setLoading(true)
            const searchQuery = search.trim() || undefined
            const url = searchQuery 
              ? `/api/admin/ai-config/models/huggingface?apiKey=${encodeURIComponent(key)}&search=${encodeURIComponent(searchQuery)}`
              : `/api/admin/ai-config/models/huggingface?apiKey=${encodeURIComponent(key)}`
            const response = await fetch(url)
            const data = await response.json()
            if (data.models) setModels(data.models)
        } catch (error) {
            console.error("Fetch failed", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (apiKey && !showKeyInput) {
            fetchModels(apiKey)
        }
    }, [search])

    const handleConnectModel = async () => {
        if (!selectedId) return
        const selectedModel = models.find(m => m.id === selectedId)
        if (!selectedModel) return

        setSaving(true)
        try {
            const modality = selectedModel.architecture?.modality || ""
            const category = modality.includes("image") ? "IMAGE_TO_TEXT" : "TEXT_TO_TEXT"
            
            const response = await fetch("/api/admin/ai-config/models", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: selectedModel.name,
                    modelId: selectedModel.id,
                    provider: "HuggingFace",
                    description: selectedModel.description,
                    category,
                    apiKey,
                    contextLength: selectedModel.context_length,
                    modality: selectedModel.architecture?.modality,
                    pricing: selectedModel.pricing,
                }),
            })
            if (response.ok) {
                window.location.reload()
                onClose()
            }
        } catch (error) {
            alert("Failed to connect model")
        } finally {
            setSaving(false)
        }
    }

    const filteredModels = models.filter(m => 
        m.name.toLowerCase().includes(search.toLowerCase()) || 
        m.id.toLowerCase().includes(search.toLowerCase())
    )

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="flex h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 flex-col md:flex-row">
            
            {showKeyInput ? (
                 <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                     <Brain size={48} className="text-yellow-500"/>
                     <h3 className="text-xl font-bold text-gray-900">Hugging Face API Key Required</h3>
                     <p className="text-sm text-gray-500">Get your API key from <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-blue-600 hover:underline">Hugging Face Settings</a></p>
                     <input 
                        type="password" 
                        value={apiKey} 
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="hf_..."
                        className="w-full max-w-md border border-gray-200 rounded-lg p-3"
                     />
                     <button onClick={() => { localStorage.setItem("huggingface_api_key", apiKey); setShowKeyInput(false); fetchModels(apiKey); }} className="bg-yellow-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-yellow-700">Continue</button>
                 </div>
            ) : (
                <>
                {/* Left Panel: List */}
                <div className="w-full md:w-5/12 bg-gray-50/30 flex flex-col border-r border-gray-200/80 relative h-full">
    <div className="p-5 border-b border-gray-200/80 bg-white/80 backdrop-blur-xl sticky top-0 z-10">
        <h3 className="text-lg font-bold text-gray-900 tracking-tight mb-1">Select Model</h3>
        <p className="text-sm text-gray-500 mb-5 font-medium">Choose a Hugging Face model.</p>
        
        <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-yellow-600 transition-colors duration-300" />
            </div>
            <input 
                type="text" 
                placeholder="Search models..." 
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-medium text-gray-900 placeholder-gray-400 shadow-sm focus:border-yellow-500 focus:ring-4 focus:ring-yellow-500/10 focus:outline-none transition-all duration-300"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />
        </div>
    </div>

    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gray-50/50">
        {loading ? (
            <div className="flex flex-col items-center justify-center h-40 space-y-3">
                <div className="w-6 h-6 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-gray-500 animate-pulse">Loading models...</span>
            </div>
        ) : filteredModels.map((m) => {
            const isSelected = selectedId === m.id;
            const provider = m.id.split('/')[0];
            const contextK = Math.round(m.context_length / 1024);

            return (
                <div 
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-300 group overflow-hidden ${
                        isSelected 
                        ? "bg-white ring-2 ring-yellow-600 shadow-lg shadow-yellow-600/10" 
                        : "bg-white border border-gray-200 shadow-sm hover:border-yellow-300 hover:shadow-md hover:shadow-yellow-500/5"
                    }`}
                >
                    {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-600 rounded-l-2xl" />
                    )}

                    <div className="flex justify-between items-start mb-3">
                        <div className="pr-4">
                            <div className="flex items-center gap-2 mb-1.5">
                                <span className="text-[10px] font-bold tracking-wider uppercase text-gray-500">
                                    {provider}
                                </span>
                                <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${
                                    isSelected 
                                    ? "bg-yellow-50 text-yellow-700 border-yellow-200" 
                                    : "bg-gray-50 text-gray-600 border-gray-200"
                                }`}>
                                    
                                    {m.architecture.model_type ? `  ${m.architecture.model_type}` : ""}
                                </span>
                            </div>
                            
                            <h4 className={`text-sm font-bold leading-tight ${isSelected ? "text-yellow-950" : "text-gray-900"}`}>
                                {m.name}
                            </h4>
                        </div>

                        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border flex-shrink-0 ${
                            isSelected ? "bg-yellow-50 border-yellow-100 text-yellow-700" : "bg-gray-50 border-gray-100 text-gray-600"
                        }`}>
                            <span className="block text-[10px] font-mono font-bold">{contextK}k</span>
                        </div>
                    </div>

                    <div className={`grid grid-cols-2 gap-2 pt-3 mt-1 border-t ${isSelected ? 'border-yellow-100' : 'border-gray-100'}`}>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Prompt</span>
                            <span className={`text-xs font-mono font-medium ${isSelected ? 'text-yellow-700' : 'text-gray-700'}`}>
                                {formatPrice(m.pricing.prompt)}
                            </span>
                        </div>
                        
                        <div className="flex flex-col border-l border-gray-100 pl-2">
                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Completion</span>
                            <span className={`text-xs font-mono font-medium ${isSelected ? 'text-yellow-700' : 'text-gray-700'}`}>
                                {formatPrice(m.pricing.completion)}
                            </span>
                        </div>
                    </div>
                </div>
            )
        })}
    </div>
</div>

                {/* Right Panel: Details */}
                <div className="flex-1 bg-white flex flex-col relative h-full overflow-hidden">
            <button 
                onClick={onClose} 
                className="absolute top-5 right-5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 p-2.5 rounded-full transition-all duration-200 z-20 backdrop-blur-md bg-white/50"
            >
                <X size={20} strokeWidth={2.5}/>
            </button>
            
            {selectedId ? (
                <div className="flex-1 flex flex-col animate-in slide-in-from-right-8 duration-500 h-full">
                    <div className="px-8 pt-10 pb-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/50 to-white relative">
                        <div className="flex items-start gap-5 relative z-10">
                            <div className="h-16 w-16 flex-shrink-0 rounded-2xl bg-gradient-to-br from-yellow-500 via-yellow-400 to-yellow-500 p-[1px] shadow-lg shadow-yellow-500/20">
                                <div className="w-full h-full bg-white/10 rounded-[15px] flex items-center justify-center backdrop-blur-md text-white">
                                    <Brain size={32} strokeWidth={1.5} />
                                </div>
                            </div>
                            
                            <div className="flex-1 pt-1">
                                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight leading-tight mb-2">
                                    {models.find(model => model.id === selectedId)?.name}
                                </h2>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-[11px] font-medium text-gray-500 bg-gray-100 border border-gray-200/60 px-2.5 py-1 rounded-md shadow-sm">
                                        {models.find(model => model.id === selectedId)?.id}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div className="p-8 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-50/50 border border-yellow-100/50">
                                <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg"><Maximize size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Context Window</p>
                                    <p className="text-sm font-bold text-yellow-950">{Math.round((models.find(model => model.id === selectedId)?.context_length || 0) / 1024)}k Tokens</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-50/50 border border-yellow-100/50">
                                <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg"><Layers size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Capabilities</p>
                                    <p className="text-sm font-bold text-yellow-950 capitalize">{models.find(model => model.id === selectedId)?.architecture?.input_modalities?.join(" & ") || "N/A"}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-50/50 border border-yellow-100/50">
                                <div className="p-2 bg-yellow-100 text-yellow-600 rounded-lg"><TerminalSquare size={18} /></div>
                                <div>
                                    <p className="text-[10px] font-bold text-yellow-400 uppercase tracking-wider">Tokenizer</p>
                                    <p className="text-sm font-bold text-yellow-950">{models.find(model => model.id === selectedId)?.architecture?.tokenizer || "Standard"}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                                <MessageSquare size={16} className="text-gray-400"/> About this Model
                            </h3>
                            <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-line bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                                {models.find(model => model.id === selectedId)?.description}
                            </p>
                        </div>
                    </div>

                    <div className="p-5 border-t border-gray-200/60 bg-white/80 backdrop-blur-xl flex justify-end gap-3 z-10">
                        <button 
                            onClick={onClose} 
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConnectModel}
                            disabled={saving}
                            className="relative overflow-hidden px-8 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-yellow-500/25 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100 group"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 group-hover:scale-105 transition-transform duration-500"></div>
                            
                            <span className="relative flex items-center justify-center gap-2">
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Connecting...
                                    </>
                                ) : (
                                    <>Connect Model <Zap size={16} className="fill-white/20"/></>
                                )}
                            </span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50/30">
                    <div className="relative mb-6">
                          <div className="absolute inset-0 bg-yellow-500 blur-[40px] opacity-20 rounded-full"></div>
                        <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-white to-yellow-50 border border-yellow-100/50 flex items-center justify-center shadow-xl shadow-yellow-900/5">
                            <Brain size={40} className="text-yellow-400" strokeWidth={1.5} />
                        </div>
                    </div>
                    <h3 className="text-xl font-extrabold text-gray-900 mb-2">No Model Selected</h3>
                    <p className="text-sm font-medium text-gray-500 max-w-[260px] leading-relaxed">
                        Browse the registry on the left and select a Hugging Face model to view its capabilities and specs.
                    </p>
                </div>
            )}
        </div>
                </>
            )}
        </div>
      </div>
    )
}

// --- 5. GitHub Models Modal (catalog loader) ---

type GitHubCatalogModel = {
  id: string
  name: string
  description?: string
  context_window?: number
  capabilities?: {
    input_types?: string[]
    output_types?: string[]
  }
  pricing?: any
}

function GitHubModelsModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [githubModels, setGitHubModels] = useState<any[]>([])
  const [githubModelsLoading, setGitHubModelsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [githubCategory, setGithubCategory] = useState<"TEXT_TO_TEXT" | "IMAGE_TO_TEXT">("TEXT_TO_TEXT")

  useEffect(() => {
    const stored = localStorage.getItem("github_models_token")
    if (stored) {
      setAccessToken(stored)
      fetchCatalog(stored)
    } else {
      setShowTokenInput(true)
      setGitHubModelsLoading(false)
    }
  }, [])

  const fetchCatalog = async (token: string) => {
    
    try {
      setGitHubModelsLoading(true)
      const res = await fetch("/api/admin/ai-config/models/github?apiKey=" + token, {
      })
      
      const data = await res.json()
      
      setGitHubModels(data.models || [])
      
    } catch (error: any) {
      console.error("Error fetching GitHub models:", error)
      setGitHubModels([])
    }
    finally {
      setGitHubModelsLoading(false)
    }
  }

  const filteredGitHubModels = githubModels.filter((m) => {

    const q = search.toLowerCase()
    return (
      !q ||
      m.name.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q) ||
      (m.summary || "").toLowerCase().includes(q)
      || (m.limits.max_input_tokens || "").toLowerCase().includes(q)
      || (m.limits.max_output_tokens || "").toLowerCase().includes(q)
      || (m.supported_input_modalities || "").toLowerCase().includes(q)
      || (m.supported_output_modalities || "").toLowerCase().includes(q)
      || (m.tags || "").toLowerCase().includes(q)
    )
  })

  
  const handleConnect = async () => {
    if (!selectedId) return
    const model = githubModels.find((m) => m.id === selectedId)
    if (!model) return

    setSaving(true)
    try {
      const res = await fetch("/api/admin/ai-config/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: model.name,
          modelId: model.id,
          provider: "GitHub",
          description: model.description || "",
          category: githubCategory,
          apiKey: accessToken,
          contextLength: model.context_window || 0,
          modality: githubCategory === "IMAGE_TO_TEXT" ? "image" : "text",
          pricing: model.pricing || {},
        }),
      })
      if (res.ok) {
        window.location.reload()
        onClose()
      } else {
        console.error("Failed to save GitHub model", await res.text())
      }
    } finally {
      setSaving(false)
    }
  }


  
  
  if (showTokenInput) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl">
          <h3 className="text-lg font-bold text-gray-900 mb-2">GitHub Models Access Token</h3>
          <p className="text-xs text-gray-500 mb-4">
            Paste a GitHub access token with access to GitHub Models. It will be stored only in your
            browser localStorage.
          </p>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="ghp_..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              disabled={!accessToken}
              onClick={() => {
                localStorage.setItem("github_models_token", accessToken)
                setShowTokenInput(false)
                fetchCatalog(accessToken)
              }}
              className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    )
  }
console.log("GitHub Models", githubModels)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="flex h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 flex-col md:flex-row">
        {/* Left: list */}
        <div className="w-full md:w-5/12 bg-gray-50/40 border-r border-gray-200 flex flex-col">
          <div className="p-5 border-b border-gray-200 bg-white/80 backdrop-blur">
            <h3 className="text-lg font-bold text-gray-900 mb-1">GitHub Models Catalog</h3>
            <p className="text-xs text-gray-500 mb-3">Loaded from models.github.ai</p>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
  {githubModelsLoading ? (
    // Beautiful Loading State
    <div className="flex flex-col h-40 items-center justify-center space-y-3">
      <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
      <span className="text-sm font-medium text-emerald-600 animate-pulse">
        Loading models...
      </span>
    </div>
  ) : filteredGitHubModels.length === 0 ? (
    // Beautiful Empty State
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
      <svg className="w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <h3 className="text-sm font-medium text-gray-900">No models found</h3>
      <p className="text-xs text-gray-500 mt-1 max-w-xs">
        Check your token or try adjusting your search filters.
      </p>
    </div>
  ) : (
    filteredGitHubModels.map((m) => {
      const selected = selectedId === m.id;
      
      return (
        <button
          key={m.id}
          onClick={() => setSelectedId(m.id)}
          className={`group relative w-full text-left rounded-2xl transition-all duration-300 ease-out focus:outline-none ${
            selected
              ? "p-[1.5px] bg-gradient-to-r from-emerald-400 via-green-500 to-teal-500 shadow-lg shadow-emerald-500/20 scale-[1.01]"
              : "p-[1px] bg-gray-200 hover:bg-gradient-to-r hover:from-emerald-300 hover:to-teal-300 hover:shadow-md"
          }`}
        >
          {/* Inner Card (White background to make the outer div look like a border) */}
          <div className={`w-full h-full rounded-[15px] p-4 transition-colors ${
            selected ? "bg-gradient-to-br from-emerald-50/50 to-white" : "bg-white"
          }`}>
            
            {/* Header: Title and ID Pill */}
            <div className="flex justify-between items-start gap-4 mb-2">
              <div className={`font-bold text-base transition-colors ${selected ? "text-emerald-900" : "text-gray-900"}`}>
                {m.name}
              </div>
              <span className="shrink-0 text-[10px] font-mono px-2 py-1 bg-gray-50 text-gray-400 rounded-md border border-gray-100">
                {m.id}
              </span>
            </div>

            {/* Description */}
            {m.summary && (
              <div className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
                {m.summary}
              </div>
            )}

            {/* Tags Section */}
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {/* Token Limits (Blue) */}
              {m.limits?.max_input_tokens && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100/50">
                  In: {m.limits.max_input_tokens.toLocaleString()}
                </span>
              )}
              {m.limits?.max_output_tokens && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100/50">
                  Out: {m.limits.max_output_tokens.toLocaleString()}
                </span>
              )}

              {/* Modalities (Amber) */}
              {m.supported_input_modalities && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-100/50">
                  In: {Array.isArray(m.supported_input_modalities) ? m.supported_input_modalities.join('/') : m.supported_input_modalities}
                </span>
              )}
              {m.supported_output_modalities && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-100/50">
                  Out: {Array.isArray(m.supported_output_modalities) ? m.supported_output_modalities.join('/') : m.supported_output_modalities}
                </span>
              )}

              {/* Dynamic Model Tags (Emerald) */}
              {m.tags && Array.isArray(m.tags) ? (
                m.tags.map((tag, idx) => (
                  <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                    {tag}
                  </span>
                ))
              ) : m.tags ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                  {m.tags}
                </span>
              ) : null}
            </div>

            {/* Selected Indicator Checkmark (Optional but looks premium) */}
            {selected && (
              <div className="absolute top-4 right-4 translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-white rounded-full p-0.5 shadow-sm">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </div>
        </button>
      );
    })
  )}
</div>
        </div>

        {/* Right: details + actions */}
        <div className="flex-1 flex flex-col relative bg-white h-full overflow-hidden">
  {/* Close Button */}
  <button
    onClick={onClose}
    className="absolute top-4 right-4 p-2 rounded-full text-gray-400 bg-white hover:text-gray-800 hover:bg-gray-100 transition-colors z-10 shadow-sm border border-transparent hover:border-gray-200"
    aria-label="Close"
  >
    <X size={18} />
  </button>

  {selectedId ? (
    <>
      {(() => {
        const m = githubModels.find((mm) => mm.id === selectedId);
        if (!m) return null;

        return (
          <div className="flex-1 overflow-y-auto">
            <div className="p-8 mt-4 max-w-4xl mx-auto space-y-8">
              
              {/* Header Section */}
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight mb-3">
                  {m.name}
                </h2>
                <div className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-50 text-[11px] font-mono text-gray-500 border border-gray-200 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                  {m.id}
                </div>
              </div>

              {/* Description Section */}
              {m.summary && (
                <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-900 mb-2 uppercase tracking-wider flex items-center gap-2">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    About this model
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {m.summary}
                  </p>
                </div>
              )}

              {/* Specifications Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Token Limits Card */}
                <div className="p-5 rounded-2xl border border-blue-100 bg-blue-50/30">
                  <h4 className="text-xs font-bold text-blue-900 mb-4 uppercase tracking-wider">Context Window</h4>
                  <div className="space-y-3">
                    {m.limits?.max_input_tokens && (
                      <div>
                        <div className="text-[10px] text-blue-500 font-semibold mb-1 uppercase tracking-wide">Max Input</div>
                        <div className="font-mono text-sm text-blue-900 bg-blue-100/50 inline-block px-2.5 py-1 rounded-md">
                          {m.limits.max_input_tokens.toLocaleString()} tokens
                        </div>
                      </div>
                    )}
                    {m.limits?.max_output_tokens && (
                      <div>
                        <div className="text-[10px] text-blue-500 font-semibold mb-1 uppercase tracking-wide">Max Output</div>
                        <div className="font-mono text-sm text-blue-900 bg-blue-100/50 inline-block px-2.5 py-1 rounded-md">
                          {m.limits.max_output_tokens.toLocaleString()} tokens
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modalities Card */}
                <div className="p-5 rounded-2xl border border-amber-100 bg-amber-50/30">
                  <h4 className="text-xs font-bold text-amber-900 mb-4 uppercase tracking-wider">Supported Modalities</h4>
                  <div className="space-y-3">
                    {m.supported_input_modalities && (
                      <div>
                        <div className="text-[10px] text-amber-600 font-semibold mb-1 uppercase tracking-wide">Input</div>
                        <div className="text-sm text-amber-900 font-medium capitalize">
                          {Array.isArray(m.supported_input_modalities) ? m.supported_input_modalities.join(', ') : m.supported_input_modalities}
                        </div>
                      </div>
                    )}
                    {m.supported_output_modalities && (
                      <div>
                        <div className="text-[10px] text-amber-600 font-semibold mb-1 uppercase tracking-wide">Output</div>
                        <div className="text-sm text-amber-900 font-medium capitalize">
                          {Array.isArray(m.supported_output_modalities) ? m.supported_output_modalities.join(', ') : m.supported_output_modalities}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Tags Section */}
              {m.tags && (
                <div>
                  <h4 className="text-xs font-bold text-gray-900 mb-3 uppercase tracking-wider">Categorization Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {Array.isArray(m.tags) ? (
                      m.tags.map((tag, idx) => (
                        <span key={idx} className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
                        {m.tags}
                      </span>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        );
      })()}

       {/* Sticky Bottom Action Bar */}
       <div className="mt-auto p-5 border-t border-gray-100 flex items-center justify-between gap-4 bg-white/80 backdrop-blur-md z-10">
         {/* Category Selector */}
         <div className="flex items-center gap-2 text-xs text-gray-600">
           <span className="font-semibold uppercase tracking-wide">Category</span>
           <select
             value={githubCategory}
             onChange={(e) => setGithubCategory(e.target.value as "TEXT_TO_TEXT" | "IMAGE_TO_TEXT")}
             className="text-xs font-semibold bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
           >
             <option value="TEXT_TO_TEXT">Text → Text</option>
             <option value="IMAGE_TO_TEXT">Text → Image</option>
           </select>
         </div>

        <button
          onClick={onClose}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleConnect}
          disabled={saving}
          className="relative group px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 disabled:opacity-70 disabled:pointer-events-none disabled:active:scale-100 flex items-center justify-center min-w-[140px]"
        >
          {saving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Connecting...
            </>
          ) : (
            "Connect Model"
          )}
        </button>
      </div>
    </>
  ) : (
    /* Beautiful Empty State */
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50/50">
      <div className="w-20 h-20 mb-6 rounded-full bg-emerald-50 border-4 border-white shadow-sm flex items-center justify-center">
        <Server size={32} className="text-emerald-500" />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">No Model Selected</h3>
      <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
        Select a model from the GitHub catalog on the left to view its specifications and deploy it into your fleet.
      </p>
    </div>
  )}
</div>
      </div>
    </div>
  )
}

function ProviderManualModal({
  onClose,
  providerName,
  providerValue,
  keyStorageKey,
  defaultModelId,
}: {
  onClose: () => void
  providerName: string
  providerValue: string
  keyStorageKey: string
  defaultModelId: string
}) {
  const [name, setName] = useState(`${providerName} Model`)
  const [modelId, setModelId] = useState(defaultModelId)
  const [apiKey, setApiKey] = useState("")
  const [description, setDescription] = useState("")
  const [contextLength, setContextLength] = useState<number>(32768)
  const [category, setCategory] = useState<"TEXT_TO_TEXT" | "IMAGE_TO_TEXT">("TEXT_TO_TEXT")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(keyStorageKey)
    if (stored) setApiKey(stored)
  }, [keyStorageKey])

  const handleConnect = async () => {
    if (!modelId.trim() || !apiKey.trim()) return
    setSaving(true)
    try {
      localStorage.setItem(keyStorageKey, apiKey)
      const res = await fetch("/api/admin/ai-config/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || `${providerName} Model`,
          modelId: modelId.trim(),
          provider: providerValue,
          description: description.trim(),
          category,
          apiKey: apiKey.trim(),
          contextLength: Number.isFinite(contextLength) ? contextLength : 32768,
          modality: category === "IMAGE_TO_TEXT" ? "image" : "text",
          pricing: {},
        }),
      })
      if (res.ok) {
        window.location.reload()
        onClose()
      } else {
        const txt = await res.text()
        alert(`Failed to connect model: ${txt}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl p-6 max-w-xl w-full shadow-2xl ring-1 ring-black/5 space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Connect {providerName} Model</h3>
        <p className="text-xs text-gray-500">Enter model details and credentials. Credentials are stored in localStorage only.</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <input value={modelId} onChange={(e) => setModelId(e.target.value)} placeholder="Model ID (e.g. gemini-1.5-pro)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
        <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" type="password" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm h-20 resize-none" />
        <div className="grid grid-cols-2 gap-3">
          <input
            value={contextLength}
            onChange={(e) => setContextLength(parseInt(e.target.value || "32768"))}
            placeholder="Context length"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            type="number"
            min={1024}
          />
          <select value={category} onChange={(e) => setCategory(e.target.value as "TEXT_TO_TEXT" | "IMAGE_TO_TEXT")} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="TEXT_TO_TEXT">TEXT_TO_TEXT</option>
            <option value="IMAGE_TO_TEXT">IMAGE_TO_TEXT</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button disabled={saving || !modelId.trim() || !apiKey.trim()} onClick={handleConnect} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
            {saving ? "Connecting..." : "Connect Model"}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Helper Components ---

    function NavTab({ active, onClick, label, icon }: any) {
    return (
        <button
        onClick={onClick}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200 ${
            active
            ? "bg-white text-gray-900 shadow-sm ring-1 ring-black/5"
            : "text-gray-500 hover:bg-gray-200/50 hover:text-gray-900"
        }`}
        >
        <span className={active ? "text-green-600" : "text-gray-400"}>{icon}</span>
        {label}
        </button>
    )
    }

    function StatCard({ title, value, subValue, icon, color }: any) {
    const bgColors: any = { emerald: "bg-emerald-50", amber: "bg-amber-50", green: "bg-green-50", blue: "bg-blue-50" }
    const textColors: any = { emerald: "text-emerald-600", amber: "text-amber-600", green: "text-green-600", blue: "text-blue-600" }
  
    return (
        <div className="group relative overflow-hidden rounded-2xl bg-white p-5 shadow-[0_2px_10px_rgb(0,0,0,0.02)] ring-1 ring-gray-100 transition-all hover:-translate-y-1 hover:shadow-lg">
        <div className="flex justify-between items-start mb-4">
           <div className={`p-2.5 rounded-xl ${bgColors[color]} ${textColors[color]}`}>
               {icon}
           </div>
           {/* Mini Sparkline Simulation */}
            <div className="flex items-end gap-0.5 h-6">
                <div className={`w-1 bg-gray-100 rounded-t group-hover:${bgColors[color].replace('bg-', 'bg-')}-200 h-2`}></div>
                <div className={`w-1 bg-gray-100 rounded-t group-hover:${bgColors[color].replace('bg-', 'bg-')}-300 h-3`}></div>
                <div className={`w-1 bg-gray-200 rounded-t group-hover:${bgColors[color].replace('bg-', 'bg-')}-400 h-5`}></div>
                <div className={`w-1 ${textColors[color].replace('text-', 'bg-')} rounded-t h-4`}></div>
            </div>
        </div>
        <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>
                <span className="text-[10px] font-medium text-gray-400">{subValue}</span>
            </div>
        </div>
        </div>
    )
    }

    function StatusBadge({ status }: { status: string }) {
    const styles: any = {
        ONLINE: "bg-emerald-50 text-emerald-700 border-emerald-100",
        OFFLINE: "bg-gray-100 text-gray-500 border-gray-200",
        ISSUES: "bg-amber-50 text-amber-700 border-amber-100",
    }
    const style = styles[status] || styles.OFFLINE

    return (
        <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${style}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status === "ONLINE" ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`}></span>
        {status}
        </div>
    )
    }

    function ConfigSidebarItem({ active, onClick, icon, label }: any) {
        return (
            <button 
                onClick={onClick}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-2 ${
                active 
                ? "border-green-600 bg-green-50/50 text-green-900" 
                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
            >
                <span className={active ? "text-green-600" : "text-gray-400"}>{icon}</span>
                {label}
            </button>
        )
    }