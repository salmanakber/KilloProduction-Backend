"use client"

import { useState, useEffect } from "react"
// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
// Icons
import { Loader2, Save, Eye, EyeOff, Settings, CheckCircle2, Link as LinkIcon, Lock, Globe, Percent, Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Config {
  id?: string
  isEnabled: boolean
  minTransferAmount: number
  maxTransferAmount: number
  defaultCurrency: string
  supportedCurrencies: string[]
  transferFeePercentage: number
  transferFeeFixed: number
  exchangeRateProvider: string | null
  exchangeRateMargin: number
  stripePublishableKey?: string | null
  paystackPublicKey?: string | null
  hasExchangeRateApiKey?: boolean
  hasStripeConfig: boolean
  hasStripeWebhookSecret?: boolean
  hasPaystackConfig: boolean
  autoPayoutEnabled?: boolean
  autoPayoutDelayMinutes?: number
  withdrawalSmartAutoApprove?: boolean
  withdrawalSmartApproveDelayMinutes?: number
  withdrawalPaystackBufferNgn?: number
  withdrawalInstantMaxNgn?: number | null
}

export default function MoneyTransferConfig() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showStripeKeys, setShowStripeKeys] = useState(false)
  const [showPaystackKeys, setShowPaystackKeys] = useState(false)
  const [apiOrigin, setApiOrigin] = useState("")
  const { toast } = useToast()

  const stripeWebhookUrl = apiOrigin
    ? `${apiOrigin}/api/money-app-mobile/stripe/webhook`
    : "/api/money-app-mobile/stripe/webhook"

  // Form state
  const [formData, setFormData] = useState({
    stripeSecretKey: "",
    stripePublishableKey: "",
    stripeWebhookSecret: "",
    paystackSecretKey: "",
    paystackPublicKey: "",
    isEnabled: true,
    minTransferAmount: 1.0,
    maxTransferAmount: 10000.0,
    defaultCurrency: "USD",
    supportedCurrencies: ["USD", "NGN"],
    exchangeRateProvider: "",
    exchangeRateApiKey: "",
    exchangeRateMargin: 0.02,
    transferFeePercentage: 0.0,
    transferFeeFixed: 0.0,
    autoPayoutEnabled: false,
    autoPayoutDelayMinutes: 12,
    withdrawalSmartAutoApprove: false,
    withdrawalSmartApproveDelayMinutes: 15,
    withdrawalPaystackBufferNgn: 50_000,
    withdrawalInstantMaxNgn: "",
  })

  useEffect(() => {
    fetchConfig()
    if (typeof window !== "undefined") {
      setApiOrigin(window.location.origin)
    }
  }, [])

  const num = (v: unknown, fallback: number) => {
    if (typeof v === "number" && Number.isFinite(v)) return v
    const x = Number(v)
    return Number.isFinite(x) ? x : fallback
  }

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/money-app-admin/config")
      const data = await response.json()

      if (!response.ok || !data.success || !data.config) {
        toast({
          title: "Error",
          description: data.error || "Failed to load configuration",
          variant: "destructive",
        })
        return
      }

      const c = data.config
      setConfig(c)
      setFormData((prev) => ({
        ...prev,
        isEnabled: c.isEnabled,
        minTransferAmount: num(c.minTransferAmount, 1),
        maxTransferAmount: num(c.maxTransferAmount, 10000),
        defaultCurrency: c.defaultCurrency ?? "USD",
        supportedCurrencies: Array.isArray(c.supportedCurrencies)
          ? c.supportedCurrencies
          : ["USD", "NGN"],
        exchangeRateProvider: c.exchangeRateProvider || "",
        exchangeRateMargin: num(c.exchangeRateMargin, 0.02),
        transferFeePercentage: num(c.transferFeePercentage, 0),
        transferFeeFixed: num(c.transferFeeFixed, 0),
        stripePublishableKey: c.stripePublishableKey ?? "",
        paystackPublicKey: c.paystackPublicKey ?? "",
        autoPayoutEnabled: Boolean(c.autoPayoutEnabled),
        autoPayoutDelayMinutes: num(c.autoPayoutDelayMinutes, 12),
        withdrawalSmartAutoApprove: Boolean(c.withdrawalSmartAutoApprove),
        withdrawalSmartApproveDelayMinutes: num(c.withdrawalSmartApproveDelayMinutes, 15),
        withdrawalPaystackBufferNgn: num(c.withdrawalPaystackBufferNgn, 50_000),
        withdrawalInstantMaxNgn:
          c.withdrawalInstantMaxNgn != null && Number.isFinite(Number(c.withdrawalInstantMaxNgn))
            ? Number(c.withdrawalInstantMaxNgn)
            : "",
      }))
    } catch (error) {
      console.error("Failed to fetch config:", error)
      toast({
        title: "Error",
        description: "Failed to load configuration",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch("/api/admin/money-app-admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Configuration saved successfully",
        })
        fetchConfig()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save configuration",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading system configuration...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* GRADIENT HEADER */}
      <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-8 rounded-3xl shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between border border-[#0f766e]/20">
        {/* Subtle background flares */}
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-10 bottom-0 h-32 w-32 rounded-full bg-teal-400/10 blur-3xl"></div>
        
        <div className="relative z-10 flex items-center gap-5">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
            <Settings className="h-8 w-8 text-teal-300" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">System Configuration</h1>
            <p className="text-teal-100/80 mt-1.5 font-medium max-w-md">Configure payment gateways, limits, fees, and operational modules.</p>
          </div>
        </div>
        
        <div className="relative z-10 mt-6 md:mt-0">
          <Button 
            onClick={handleSave} 
            disabled={saving} 
            size="lg"
            className="bg-teal-500 hover:bg-teal-400 text-white shadow-lg hover:shadow-teal-500/25 border-none transition-all w-full md:w-auto h-12 rounded-xl text-base font-bold"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Saving Output...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm inline-block">
          <TabsList className="bg-transparent space-x-1 h-auto p-0">
            <TabsTrigger 
              value="general" 
              className="px-6 py-2.5 rounded-xl data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none data-[state=active]:font-bold text-slate-500 font-medium transition-all"
            >
              General Settings
            </TabsTrigger>
            <TabsTrigger 
              value="stripe"
              className="px-6 py-2.5 rounded-xl data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none data-[state=active]:font-bold text-slate-500 font-medium transition-all"
            >
              Stripe Config
            </TabsTrigger>
            <TabsTrigger 
              value="paystack"
              className="px-6 py-2.5 rounded-xl data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none data-[state=active]:font-bold text-slate-500 font-medium transition-all"
            >
              Paystack Config
            </TabsTrigger>
            <TabsTrigger 
              value="exchange"
              className="px-6 py-2.5 rounded-xl data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none data-[state=active]:font-bold text-slate-500 font-medium transition-all"
            >
              Exchange Rates
            </TabsTrigger>
          </TabsList>
        </div>

        {/* General Settings */}
        <TabsContent value="general" className="mt-0 outline-none">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
            <div className="border-b border-slate-100 pb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">General Properties</h3>
                <p className="text-sm text-slate-500 mt-1">Module activation, amounts, and fees.</p>
              </div>
            </div>

            <div className="space-y-8 max-w-4xl">
              {/* Toggle Row */}
              <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="space-y-0.5">
                  <Label htmlFor="enabled" className="text-base font-bold text-slate-900 cursor-pointer">Enable Money Transfer Module</Label>
                  <p className="text-sm text-slate-500">Allow users to send and receive funds on the platform.</p>
                </div>
                <Switch
                  id="enabled"
                  checked={formData.isEnabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isEnabled: checked })
                  }
                  className="data-[state=checked]:bg-teal-500"
                />
              </div>

              {/* Limits Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minAmount" className="text-sm font-bold text-slate-700">Minimum Transfer Amount</Label>
                  <Input
                    id="minAmount"
                    type="number"
                    value={formData.minTransferAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, minTransferAmount: parseFloat(e.target.value) })
                    }
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 bg-slate-50/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxAmount" className="text-sm font-bold text-slate-700">Maximum Transfer Amount</Label>
                  <Input
                    id="maxAmount"
                    type="number"
                    value={formData.maxTransferAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, maxTransferAmount: parseFloat(e.target.value) })
                    }
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 bg-slate-50/50"
                  />
                </div>
              </div>

              {/* Fees Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="feePercentage" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Percent className="h-4 w-4 text-teal-600" />
                    Transfer Fee Percentage (%)
                  </Label>
                  <Input
                    id="feePercentage"
                    type="number"
                    step="0.01"
                    value={formData.transferFeePercentage}
                    onChange={(e) =>
                      setFormData({ ...formData, transferFeePercentage: parseFloat(e.target.value) })
                    }
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 bg-slate-50/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feeFixed" className="text-sm font-bold text-slate-700">Fixed Transfer Fee</Label>
                  <Input
                    id="feeFixed"
                    type="number"
                    step="0.01"
                    value={formData.transferFeeFixed}
                    onChange={(e) =>
                      setFormData({ ...formData, transferFeeFixed: parseFloat(e.target.value) })
                    }
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-8 space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Wallet bank payouts</h4>
                  <p className="text-sm text-slate-500 mt-1">
                    When enabled, verified withdrawals are queued and sent automatically after a
                    short delay (worker). When disabled, admins approve each payout manually.
                  </p>
                </div>
                <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="autoPayout"
                      className="text-base font-bold text-slate-900 cursor-pointer"
                    >
                      Automatic bank payout
                    </Label>
                    <p className="text-sm text-slate-500">
                      Security checks and daily limits still apply before queueing.
                    </p>
                  </div>
                  <Switch
                    id="autoPayout"
                    checked={formData.autoPayoutEnabled}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, autoPayoutEnabled: checked })
                    }
                    className="data-[state=checked]:bg-teal-500"
                  />
                </div>
                <div className="space-y-2 max-w-xs">
                  <Label htmlFor="autoPayoutDelay" className="text-sm font-bold text-slate-700">
                    Delay before payout (minutes, 10–60)
                  </Label>
                  <Input
                    id="autoPayoutDelay"
                    type="number"
                    min={10}
                    max={60}
                    value={formData.autoPayoutDelayMinutes}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        autoPayoutDelayMinutes: Math.min(
                          60,
                          Math.max(10, parseInt(e.target.value, 10) || 12),
                        ),
                      })
                    }
                    disabled={!formData.autoPayoutEnabled}
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 bg-slate-50/50"
                  />
                </div>

                <div className="rounded-2xl border border-teal-100 bg-teal-50/40 p-5 space-y-4">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Smart auto-approval (worker)</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      For <strong>PENDING</strong> NGN withdrawals only: after the delay below, the worker runs
                      Paystack payout if balance minus buffer covers the amount. Non-NGN still needs a manual /
                      Stripe rail. Works alongside automatic bank payout above.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <Label htmlFor="smartAuto" className="text-sm font-bold text-slate-800">
                      Enable smart auto-approve
                    </Label>
                    <Switch
                      id="smartAuto"
                      checked={formData.withdrawalSmartAutoApprove}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, withdrawalSmartAutoApprove: checked })
                      }
                      className="data-[state=checked]:bg-teal-500"
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700">Smart delay (minutes, 1–120)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={120}
                        value={formData.withdrawalSmartApproveDelayMinutes}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            withdrawalSmartApproveDelayMinutes: Math.min(
                              120,
                              Math.max(1, parseInt(e.target.value, 10) || 15),
                            ),
                          })
                        }
                        disabled={!formData.withdrawalSmartAutoApprove}
                        className="h-11 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700">Paystack NGN buffer (₦)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={formData.withdrawalPaystackBufferNgn}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            withdrawalPaystackBufferNgn: Math.max(
                              0,
                              parseFloat(e.target.value) || 0,
                            ),
                          })
                        }
                        disabled={!formData.withdrawalSmartAutoApprove}
                        className="h-11 rounded-xl border-slate-200"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-bold text-slate-700">
                        Instant-ish max (₦, optional)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="e.g. 50000 — uses 1 min delay when auto payout on"
                        value={formData.withdrawalInstantMaxNgn === "" ? "" : formData.withdrawalInstantMaxNgn}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            withdrawalInstantMaxNgn: e.target.value === "" ? "" : parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-11 rounded-xl border-slate-200"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Stripe Configuration */}
        <TabsContent value="stripe" className="mt-0 outline-none">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
            <div className="border-b border-slate-100 pb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Stripe Integration</h3>
                <p className="text-sm text-slate-500 mt-1">Isolated Stripe keys strictly for money transfers.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-3xl">
              {config?.hasStripeConfig && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 shadow-sm">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">Stripe Configured</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">The system successfully detects valid Stripe credentials.</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="stripeSecret" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Secret Key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="stripeSecret"
                    type={showStripeKeys ? "text" : "password"}
                    value={formData.stripeSecretKey}
                    onChange={(e) =>
                      setFormData({ ...formData, stripeSecretKey: e.target.value })
                    }
                    placeholder="sk_test_..."
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    className="h-12 w-12 rounded-xl border-slate-200 text-slate-500 hover:text-teal-600 hover:bg-teal-50 shrink-0"
                    onClick={() => setShowStripeKeys(!showStripeKeys)}
                  >
                    {showStripeKeys ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="stripePublishable" className="text-sm font-bold text-slate-700">Publishable Key</Label>
                <Input
                  id="stripePublishable"
                  type="text"
                  value={formData.stripePublishableKey}
                  onChange={(e) =>
                    setFormData({ ...formData, stripePublishableKey: e.target.value })
                  }
                  placeholder="pk_test_..."
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono text-sm"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="stripeWebhook" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-slate-400" />
                  Webhook Secret
                  {config?.hasStripeWebhookSecret && (
                    <span className="text-xs font-semibold text-emerald-600">(saved)</span>
                  )}
                </Label>
                <Input
                  id="stripeWebhook"
                  type={showStripeKeys ? "text" : "password"}
                  value={formData.stripeWebhookSecret}
                  onChange={(e) =>
                    setFormData({ ...formData, stripeWebhookSecret: e.target.value })
                  }
                  placeholder="whsec_..."
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Paste the signing secret from Stripe after you create the endpoint below. Leave blank to keep the current secret.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                  <div className="space-y-3 text-sm text-slate-600">
                    <div>
                      <p className="font-bold text-slate-900">Stripe webhook setup (required for card payments)</p>
                      <p className="mt-1">
                        Register one endpoint in{" "}
                        <a
                          href="https://dashboard.stripe.com/webhooks"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-600 font-semibold hover:underline"
                        >
                          Stripe Dashboard → Developers → Webhooks
                        </a>
                        . Use your public API host — not localhost unless you use Stripe CLI forwarding.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Endpoint URL</p>
                      <code className="block text-xs font-mono bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-800 break-all">
                        POST {stripeWebhookUrl}
                      </code>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Events to subscribe</p>
                      <ul className="list-disc list-inside space-y-1 text-slate-600">
                        <li>
                          <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">payment_intent.succeeded</span>
                          {" "}— marks the transfer paid and triggers settlement / payout
                        </li>
                        <li>
                          <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">payment_intent.payment_failed</span>
                          {" "}— marks the transfer failed when card payment fails
                        </li>
                      </ul>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      After saving the endpoint, copy the <strong>Signing secret</strong> (<span className="font-mono">whsec_…</span>) into the field above.
                      NGN Paystack checkout does not use this webhook — it confirms via the app&apos;s verify API instead.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Paystack Configuration */}
        <TabsContent value="paystack" className="mt-0 outline-none">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
            <div className="border-b border-slate-100 pb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Paystack Integration</h3>
                <p className="text-sm text-slate-500 mt-1">Keys specifically isolated for processing NGN payouts.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-3xl">
              {config?.hasPaystackConfig && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 shadow-sm">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">Paystack Configured</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">The system successfully detects valid Paystack credentials.</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="paystackSecret" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Secret Key
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="paystackSecret"
                    type={showPaystackKeys ? "text" : "password"}
                    value={formData.paystackSecretKey}
                    onChange={(e) =>
                      setFormData({ ...formData, paystackSecretKey: e.target.value })
                    }
                    placeholder="sk_test_..."
                    className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    className="h-12 w-12 rounded-xl border-slate-200 text-slate-500 hover:text-teal-600 hover:bg-teal-50 shrink-0"
                    onClick={() => setShowPaystackKeys(!showPaystackKeys)}
                  >
                    {showPaystackKeys ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="paystackPublic" className="text-sm font-bold text-slate-700">Public Key</Label>
                <Input
                  id="paystackPublic"
                  type="text"
                  value={formData.paystackPublicKey}
                  onChange={(e) =>
                    setFormData({ ...formData, paystackPublicKey: e.target.value })
                  }
                  placeholder="pk_test_..."
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono text-sm"
                />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-teal-600 shrink-0 mt-0.5" />
                  <div className="space-y-3 text-sm text-slate-600">
                    <div>
                      <p className="font-bold text-slate-900">Paystack — no dashboard webhook required</p>
                      <p className="mt-1">
                        Money transfer NGN checkout is confirmed server-side when the mobile app calls{" "}
                        <span className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-slate-200">/api/money-app-mobile/send/confirm</span>
                        , which verifies the payment with Paystack&apos;s{" "}
                        <span className="font-mono text-xs">transaction/verify</span> API using your secret key.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">What the secret key is used for</p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Initialize Paystack checkout for send-money (NGN)</li>
                        <li>Verify customer payments after checkout</li>
                        <li>Create and verify NGN bank payouts / wallet withdrawals</li>
                        <li>Treasury balance checks in admin</li>
                      </ul>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      You only need the <strong>Secret key</strong> and <strong>Public key</strong> from{" "}
                      <a
                        href="https://dashboard.paystack.com/#/settings/developer"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 font-semibold hover:underline"
                      >
                        Paystack → Settings → API Keys
                      </a>
                      . Use test keys with test mode and live keys with live mode.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Exchange Rate Configuration */}
        <TabsContent value="exchange" className="mt-0 outline-none">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
            <div className="border-b border-slate-100 pb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Exchange Rates</h3>
                <p className="text-sm text-slate-500 mt-1">Configure live exchange rate APIs and margins.</p>
              </div>
            </div>

            <div className="space-y-6 max-w-3xl">
              {config?.hasExchangeRateApiKey && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 shadow-sm">
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-900">Exchange API key on file</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      The saved key is not shown for security. Enter a new key only if you want to replace it.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="exchangeProvider" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-slate-400" />
                  Provider URL
                </Label>
                <Input
                  id="exchangeProvider"
                  value={formData.exchangeRateProvider}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateProvider: e.target.value })
                  }
                  placeholder="exchangerate-api.com"
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="exchangeApiKey" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-400" />
                  API Key
                </Label>
                <Input
                  id="exchangeApiKey"
                  type="password"
                  value={formData.exchangeRateApiKey}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateApiKey: e.target.value })
                  }
                  placeholder="Your API key from exchangerate-api.com"
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 font-mono"
                />
                <p className="text-sm text-slate-500 font-medium">
                  Need a key? Get one free from{" "}
                  <a
                    href="https://www.exchangerate-api.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 hover:text-teal-700 font-bold hover:underline"
                  >
                    exchangerate-api.com
                  </a>
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <Label htmlFor="exchangeMargin" className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Percent className="h-4 w-4 text-slate-400" />
                  Exchange Rate Margin
                </Label>
                <Input
                  id="exchangeMargin"
                  type="number"
                  step="0.01"
                  value={formData.exchangeRateMargin}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateMargin: parseFloat(e.target.value) })
                  }
                  className="h-12 rounded-xl border-slate-200 focus-visible:ring-teal-500 w-full md:w-1/2"
                />
                <p className="text-sm text-slate-500 font-medium">
                  The additional margin added on top of the live rate (e.g., 2% = <span className="font-mono bg-slate-100 px-1 rounded">0.02</span>).
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}