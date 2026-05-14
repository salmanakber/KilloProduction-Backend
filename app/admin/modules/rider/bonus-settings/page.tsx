"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { 
  ChevronLeft, 
  Info, 
  RefreshCw, 
  Save, 
  SlidersHorizontal,
  Zap,
  Target,
  DollarSign,
  Activity,
  AlertCircle
} from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type BonusForm = {
  riderPeakBonusDemandThreshold: number
  riderPeakBonusWindowMinutes: number
  riderPeakBonusMinTargetRides: number
  riderPeakBonusMaxTargetRides: number
  riderPeakBonusTargetBase: number
  riderPeakBonusTargetPeakScale: number
  riderPeakBonusBonusProfitShare: number
  riderPeakBonusCommissionPeakFactor: number
  riderPeakBonusBaselineUtilPerHour: number
  riderPeakBonusExpectedUtilPerHour: number
  riderBonusAiEnabled: boolean
}

const DEFAULTS: BonusForm = {
  riderPeakBonusDemandThreshold: 1.2,
  riderPeakBonusWindowMinutes: 90,
  riderPeakBonusMinTargetRides: 2,
  riderPeakBonusMaxTargetRides: 12,
  riderPeakBonusTargetBase: 2,
  riderPeakBonusTargetPeakScale: 2,
  riderPeakBonusBonusProfitShare: 0.7,
  riderPeakBonusCommissionPeakFactor: 25,
  riderPeakBonusBaselineUtilPerHour: 0.35,
  riderPeakBonusExpectedUtilPerHour: 0.9,
  riderBonusAiEnabled: false,
}

function SettingField({
  label,
  hint,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string
  hint: string
  value: number
  onChange: (val: string) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2 block flex items-center gap-1.5">
        {label}
      </label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none shadow-sm transition-all"
      />
      <p className="text-[11px] text-slate-500 mt-2 font-medium leading-relaxed">
        {hint}
      </p>
    </div>
  )
}

export default function RiderBonusSettingsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BonusForm>(DEFAULTS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/modules/rider/bonus-settings")
      if (!res.ok) throw new Error("Failed to load")
      const j = await res.json()
      const s = j.settings ?? {}
      
      setForm({
        riderPeakBonusDemandThreshold: Number(s.riderPeakBonusDemandThreshold ?? DEFAULTS.riderPeakBonusDemandThreshold),
        riderPeakBonusWindowMinutes: Number(s.riderPeakBonusWindowMinutes ?? DEFAULTS.riderPeakBonusWindowMinutes),
        riderPeakBonusMinTargetRides: Number(s.riderPeakBonusMinTargetRides ?? DEFAULTS.riderPeakBonusMinTargetRides),
        riderPeakBonusMaxTargetRides: Number(s.riderPeakBonusMaxTargetRides ?? DEFAULTS.riderPeakBonusMaxTargetRides),
        riderPeakBonusTargetBase: Number(s.riderPeakBonusTargetBase ?? DEFAULTS.riderPeakBonusTargetBase),
        riderPeakBonusTargetPeakScale: Number(s.riderPeakBonusTargetPeakScale ?? DEFAULTS.riderPeakBonusTargetPeakScale),
        riderPeakBonusBonusProfitShare: Number(s.riderPeakBonusBonusProfitShare ?? DEFAULTS.riderPeakBonusBonusProfitShare),
        riderPeakBonusCommissionPeakFactor: Number(
          s.riderPeakBonusCommissionPeakFactor ?? DEFAULTS.riderPeakBonusCommissionPeakFactor
        ),
        riderPeakBonusBaselineUtilPerHour: Number(
          s.riderPeakBonusBaselineUtilPerHour ?? DEFAULTS.riderPeakBonusBaselineUtilPerHour
        ),
        riderPeakBonusExpectedUtilPerHour: Number(
          s.riderPeakBonusExpectedUtilPerHour ?? DEFAULTS.riderPeakBonusExpectedUtilPerHour
        ),
        riderBonusAiEnabled: Boolean(s.riderBonusAiEnabled ?? DEFAULTS.riderBonusAiEnabled),
      })
    } catch {
      toast({ title: "Error", description: "Could not load bonus settings.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/modules/rider/bonus-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error("save")
      toast({ title: "Saved", description: "Peak bonus settings updated. Workers pick them up within about a minute." })
      void load()
    } catch {
      toast({ title: "Error", description: "Save failed.", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const setNum = (key: keyof BonusForm, v: string) => {
    const n = parseFloat(v)
    setForm((f) => ({ ...f, [key]: Number.isFinite(n) ? n : f[key] }))
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 pt-6">
        <div className="flex items-start gap-4">
          <Link href="/admin/modules/rider" className="mt-1.5 p-2 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
              <SlidersHorizontal className="h-8 w-8 text-amber-500" />
              Peak Bonus Settings
            </h1>
            <p className="text-slate-500 mt-1 max-w-2xl text-sm font-medium">
              Controls how often challenges spawn, ride requirements, and the scale of the generated bonus pool.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => void load()} 
            disabled={loading}
            className="p-2.5 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("h-5 w-5 text-slate-600", loading && "animate-spin")} />
          </button>
          <button 
            onClick={() => void save()} 
            disabled={saving || loading}
            className={cn("px-5 py-2.5 rounded-xl font-bold flex items-center gap-2", gradientBtnClass, (saving || loading) && "opacity-70 pointer-events-none")}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mx-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-4 text-amber-900 shadow-sm">
         <AlertCircle className="h-6 w-6 shrink-0 text-amber-600 mt-0.5" />
         <div>
            <p className="font-bold text-sm uppercase tracking-widest text-amber-700">How The Engine Works</p>
            <ul className="mt-2 list-inside list-disc space-y-1.5 text-xs font-medium opacity-90">
              <li>
                <strong>Demand ratio</strong> = open requests ÷ online riders. If this exceeds your <strong>demand threshold</strong>, a challenge window triggers.
              </li>
              <li>
                <strong>Target rides</strong> = round(base + ratio × scale), strictly clamped between min and max boundaries.
              </li>
              <li>
                To prevent high targets for low payouts: lower <strong>max target rides</strong> or raise the <strong>bonus profit share</strong> factor.
              </li>
            </ul>
            <p className="mt-3 text-[10px] text-amber-700 font-bold uppercase tracking-wide opacity-70">
              See <code className="bg-amber-200/50 px-1.5 py-0.5 rounded ml-1 lowercase text-amber-900">lib/rider-bonus-engine.ts</code> for full mechanics.
            </p>
         </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="px-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          
          {/* Panel 1: Core Triggers */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
               <div className="h-9 w-9 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
                  <Zap className="h-5 w-5" />
               </div>
               <div>
                  <h3 className="text-base font-bold text-slate-900">Core Activation</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Thresholds & Durations</p>
               </div>
            </div>
            <div className="p-6 grid gap-6">
               <SettingField
                  label="Demand Threshold"
                  hint="Minimum open-jobs ÷ online-riders ratio before a new challenge can be created. Higher = stricter, fewer windows (default 1.2)."
                  value={form.riderPeakBonusDemandThreshold}
                  onChange={(v) => setNum("riderPeakBonusDemandThreshold", v)}
                  step={0.05}
               />
               <SettingField
                  label="Window Length (Minutes)"
                  hint="How long each peak challenge stays open once created (default 90)."
                  value={form.riderPeakBonusWindowMinutes}
                  onChange={(v) => setNum("riderPeakBonusWindowMinutes", v)}
                  step={5}
               />
            </div>
          </div>

          {/* Panel 2: Ride Targets */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
               <div className="h-9 w-9 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                  <Target className="h-5 w-5" />
               </div>
               <div>
                  <h3 className="text-base font-bold text-slate-900">Dynamic Targets</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Scaling & Constraints</p>
               </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
               <SettingField
                  label="Min Target Rides"
                  hint="Lower bound on required rides for the bonus (default 2)."
                  value={form.riderPeakBonusMinTargetRides}
                  onChange={(v) => setNum("riderPeakBonusMinTargetRides", v)}
                  step={1}
               />
               <SettingField
                  label="Max Target Rides"
                  hint="Upper cap on required rides (default 12)."
                  value={form.riderPeakBonusMaxTargetRides}
                  onChange={(v) => setNum("riderPeakBonusMaxTargetRides", v)}
                  step={1}
               />
               <SettingField
                  label="Target Base"
                  hint="Constant term before scaling by demand ratio (default 2)."
                  value={form.riderPeakBonusTargetBase}
                  onChange={(v) => setNum("riderPeakBonusTargetBase", v)}
                  step={0.5}
               />
               <SettingField
                  label="Target Peak Scale"
                  hint="Multiplier on demand ratio in target formula (default 2)."
                  value={form.riderPeakBonusTargetPeakScale}
                  onChange={(v) => setNum("riderPeakBonusTargetPeakScale", v)}
                  step={0.25}
               />
            </div>
          </div>

          {/* Panel 3: Financials */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
               <div className="h-9 w-9 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <DollarSign className="h-5 w-5" />
               </div>
               <div>
                  <h3 className="text-base font-bold text-slate-900">Financial Bounds</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Payout & Commissions</p>
               </div>
            </div>
            <div className="p-6 grid gap-6">
               <SettingField
                  label="Bonus Profit Share (0–1)"
                  hint="Fraction of (estimated incremental rides × average commission) used as bonus cap (default 0.7). Increase to pay more for the same workload."
                  value={form.riderPeakBonusBonusProfitShare}
                  onChange={(v) => setNum("riderPeakBonusBonusProfitShare", v)}
                  step={0.05}
                  min={0.05}
                  max={1}
               />
               <SettingField
                  label="Commission Discount Factor"
                  hint="Discount % uses min(50, round((ratio − 1) × this factor)) (default 25). Higher = steeper discounts during spikes."
                  value={form.riderPeakBonusCommissionPeakFactor}
                  onChange={(v) => setNum("riderPeakBonusCommissionPeakFactor", v)}
                  step={1}
               />
            </div>
          </div>

          {/* Panel 4: Analytics & AI */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
               <div className="h-9 w-9 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                  <Activity className="h-5 w-5" />
               </div>
               <div>
                  <h3 className="text-base font-bold text-slate-900">Analytics & Automation</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Models & Micro-tuning</p>
               </div>
            </div>
            <div className="p-6 grid gap-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                  <SettingField
                     label="Baseline Util / Hr"
                     hint="Model assumption for standard completions per hour (default 0.35)."
                     value={form.riderPeakBonusBaselineUtilPerHour}
                     onChange={(v) => setNum("riderPeakBonusBaselineUtilPerHour", v)}
                     step={0.05}
                  />
                  <SettingField
                     label="Expected Util / Hr"
                     hint="Higher expected completion rate with bonus pressure (default 0.9)."
                     value={form.riderPeakBonusExpectedUtilPerHour}
                     onChange={(v) => setNum("riderPeakBonusExpectedUtilPerHour", v)}
                     step={0.05}
                  />
               </div>

               {/* AI Toggle */}
               <div className="mt-2 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                       <Zap className="h-4 w-4 text-purple-500" /> AI Micro-Tuning
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed max-w-sm">
                      When enabled, the model may safely nudge targets and discounts within your set min/max bounds.
                    </p>
                  </div>
                  <Switch
                    checked={form.riderBonusAiEnabled}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, riderBonusAiEnabled: v }))}
                    className="data-[state=checked]:bg-emerald-500"
                  />
               </div>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}