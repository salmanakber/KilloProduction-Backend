"use client"

import { useEffect, useState } from "react"
import { 
  Loader2, 
  Zap, 
  ShieldCheck, 
  Settings2, 
  Percent, 
  Save, 
  Server, 
  ToggleRight,
  ShieldAlert
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

export default function VtpassAdminPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    apiKey: "",
    secretKey: "",
    sandbox: true,
    isEnabled: false,
    airtimeCommissionPct: 2,
    dataCommissionPct: 2,
    billsCommissionPct: 3,
  })

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/money-app-admin/vtpass-config")
      const json = await res.json()
      if (json.success) {
        setForm((f) => ({
          ...f,
          sandbox: json.config.sandbox,
          isEnabled: json.config.isEnabled,
          airtimeCommissionPct: json.config.airtimeCommissionPct,
          dataCommissionPct: json.config.dataCommissionPct,
          billsCommissionPct: json.config.billsCommissionPct,
        }))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/money-app-admin/vtpass-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: "Configuration Saved", description: "VTpass integration settings updated successfully." })
      setForm((f) => ({ ...f, apiKey: "", secretKey: "" }))
      load()
    } catch (e: any) {
      toast({ title: "Failed to Save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Gateway Config...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500">
      
      {/* HEADER CARD */}
      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex gap-4 items-center">
          <div className="h-14 w-14 bg-teal-50 rounded-2xl flex items-center justify-center border border-teal-100 shrink-0">
            <Zap className="h-8 w-8 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">VTpass Integration</h1>
            <p className="text-sm text-slate-500 font-medium max-w-sm leading-tight">
              Manage airtime, data, and utility bill rails for the Nigerian network.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge className={`px-4 py-1 rounded-full font-bold border-none ${form.isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
            {form.isEnabled ? 'GATEWAY ACTIVE' : 'GATEWAY DISABLED'}
          </Badge>
          <Badge variant="outline" className={`font-mono text-[10px] ${form.sandbox ? 'border-amber-200 text-amber-600' : 'border-teal-200 text-teal-600'}`}>
            {form.sandbox ? 'SANDBOX ENVIRONMENT' : 'PRODUCTION ENVIRONMENT'}
          </Badge>
        </div>
      </div>

      {/* SETTINGS FORM */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
          <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Environment Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="p-8 space-y-8">
          
          {/* TOGGLES */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Integration Status</Label>
                <p className="text-[10px] text-slate-500 font-medium">Toggle airtime/data services</p>
              </div>
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => setForm({ ...form, isEnabled: v })}
                className="data-[state=checked]:bg-teal-600"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Sandbox Mode</Label>
                <p className="text-[10px] text-slate-500 font-medium">Use test credentials and API</p>
              </div>
              <Switch 
                checked={form.sandbox} 
                onCheckedChange={(v) => setForm({ ...form, sandbox: v })} 
                className="data-[state=checked]:bg-amber-500"
              />
            </div>
          </div>

          <Separator className="bg-slate-100" />

          {/* CREDENTIALS */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">API Credentials</h3>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 ml-1">VTPASS PUBLIC KEY</Label>
                <Input
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="••••••••••••••••••••••••"
                  className="rounded-xl border-slate-200 h-11 font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 ml-1">VTPASS SECRET KEY</Label>
                <Input
                  type="password"
                  value={form.secretKey}
                  onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                  placeholder="••••••••••••••••••••••••"
                  className="rounded-xl border-slate-200 h-11 font-mono text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 p-3 bg-teal-50 rounded-xl border border-teal-100">
              <ShieldAlert className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-teal-800 leading-tight">
                Keys are masked for security. Leave blank when saving to maintain current production keys. 
                Commission is added automatically to customer wallet debits.
              </p>
            </div>
          </div>

          <Separator className="bg-slate-100" />

          {/* COMMISSIONS */}
          <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <Percent className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Revenue & Markup Logic</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Airtime Markup</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.airtimeCommissionPct}
                    onChange={(e) => setForm({ ...form, airtimeCommissionPct: Number(e.target.value) })}
                    className="border-none p-0 text-xl font-black focus-visible:ring-0 h-auto"
                  />
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 font-black text-teal-600">%</span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Data Markup</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.dataCommissionPct}
                    onChange={(e) => setForm({ ...form, dataCommissionPct: Number(e.target.value) })}
                    className="border-none p-0 text-xl font-black focus-visible:ring-0 h-auto"
                  />
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 font-black text-teal-600">%</span>
                </div>
              </div>

              <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-2 focus-within:ring-2 focus-within:ring-teal-500/20 transition-all">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Bills/Utility</Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.billsCommissionPct}
                    onChange={(e) => setForm({ ...form, billsCommissionPct: Number(e.target.value) })}
                    className="border-none p-0 text-xl font-black focus-visible:ring-0 h-auto"
                  />
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 font-black text-teal-600">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <Button 
              onClick={save} 
              disabled={saving} 
              className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl shadow-lg shadow-teal-100 text-lg font-black gap-3 transition-all"
            >
              {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
              Commit Configuration Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* FOOTER HINT */}
      <div className="flex items-center justify-center gap-2 text-slate-400 text-[11px] font-bold uppercase tracking-tighter">
        <Server className="h-3 w-3" />
        Balances appear automatically on the treasury ledger upon activation.
      </div>
    </div>
  )
}