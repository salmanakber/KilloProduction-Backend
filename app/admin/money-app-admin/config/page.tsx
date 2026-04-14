"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Save, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Config {
  id: string
  isEnabled: boolean
  minTransferAmount: number
  maxTransferAmount: number
  defaultCurrency: string
  supportedCurrencies: string[]
  transferFeePercentage: number
  transferFeeFixed: number
  exchangeRateProvider: string | null
  exchangeRateMargin: number
  hasStripeConfig: boolean
  hasPaystackConfig: boolean
}

export default function MoneyTransferConfig() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showStripeKeys, setShowStripeKeys] = useState(false)
  const [showPaystackKeys, setShowPaystackKeys] = useState(false)
  const { toast } = useToast()

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
  })

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/money-app-admin/config")
      const data = await response.json()
      
      if (data.success && data.config) {
        setConfig(data.config)
        setFormData((prev) => ({
          ...prev,
          isEnabled: data.config.isEnabled,
          minTransferAmount: data.config.minTransferAmount,
          maxTransferAmount: data.config.maxTransferAmount,
          defaultCurrency: data.config.defaultCurrency,
          supportedCurrencies: data.config.supportedCurrencies,
          exchangeRateProvider: data.config.exchangeRateProvider || "",
          exchangeRateMargin: data.config.exchangeRateMargin,
          transferFeePercentage: data.config.transferFeePercentage,
          transferFeeFixed: data.config.transferFeeFixed,
        }))
      }
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Money Transfer Configuration</h1>
        <p className="text-gray-600 mt-1">Configure payment gateways and module settings</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">General Settings</TabsTrigger>
          <TabsTrigger value="stripe">Stripe Configuration</TabsTrigger>
          <TabsTrigger value="paystack">Paystack Configuration</TabsTrigger>
          <TabsTrigger value="exchange">Exchange Rates</TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Module activation and transfer limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enabled">Enable Money Transfer Module</Label>
                <Switch
                  id="enabled"
                  checked={formData.isEnabled}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isEnabled: checked })
                  }
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="minAmount">Minimum Transfer Amount</Label>
                  <Input
                    id="minAmount"
                    type="number"
                    value={formData.minTransferAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, minTransferAmount: parseFloat(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="maxAmount">Maximum Transfer Amount</Label>
                  <Input
                    id="maxAmount"
                    type="number"
                    value={formData.maxTransferAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, maxTransferAmount: parseFloat(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="feePercentage">Transfer Fee Percentage (%)</Label>
                  <Input
                    id="feePercentage"
                    type="number"
                    step="0.01"
                    value={formData.transferFeePercentage}
                    onChange={(e) =>
                      setFormData({ ...formData, transferFeePercentage: parseFloat(e.target.value) })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="feeFixed">Fixed Transfer Fee</Label>
                  <Input
                    id="feeFixed"
                    type="number"
                    step="0.01"
                    value={formData.transferFeeFixed}
                    onChange={(e) =>
                      setFormData({ ...formData, transferFeeFixed: parseFloat(e.target.value) })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stripe Configuration */}
        <TabsContent value="stripe">
          <Card>
            <CardHeader>
              <CardTitle>Stripe Configuration</CardTitle>
              <CardDescription>
                Separate Stripe keys for money transfer (isolated from marketplace)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="stripeSecret">Stripe Secret Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="stripeSecret"
                    type={showStripeKeys ? "text" : "password"}
                    value={formData.stripeSecretKey}
                    onChange={(e) =>
                      setFormData({ ...formData, stripeSecretKey: e.target.value })
                    }
                    placeholder="sk_test_..."
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowStripeKeys(!showStripeKeys)}
                  >
                    {showStripeKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="stripePublishable">Stripe Publishable Key</Label>
                <Input
                  id="stripePublishable"
                  type="text"
                  value={formData.stripePublishableKey}
                  onChange={(e) =>
                    setFormData({ ...formData, stripePublishableKey: e.target.value })
                  }
                  placeholder="pk_test_..."
                />
              </div>

              <div>
                <Label htmlFor="stripeWebhook">Stripe Webhook Secret</Label>
                <Input
                  id="stripeWebhook"
                  type={showStripeKeys ? "text" : "password"}
                  value={formData.stripeWebhookSecret}
                  onChange={(e) =>
                    setFormData({ ...formData, stripeWebhookSecret: e.target.value })
                  }
                  placeholder="whsec_..."
                />
              </div>

              {config?.hasStripeConfig && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">✓ Stripe configuration is active</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Paystack Configuration */}
        <TabsContent value="paystack">
          <Card>
            <CardHeader>
              <CardTitle>Paystack Configuration</CardTitle>
              <CardDescription>
                Separate Paystack keys for NGN payouts (isolated from marketplace)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="paystackSecret">Paystack Secret Key</Label>
                <div className="flex gap-2">
                  <Input
                    id="paystackSecret"
                    type={showPaystackKeys ? "text" : "password"}
                    value={formData.paystackSecretKey}
                    onChange={(e) =>
                      setFormData({ ...formData, paystackSecretKey: e.target.value })
                    }
                    placeholder="sk_test_..."
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowPaystackKeys(!showPaystackKeys)}
                  >
                    {showPaystackKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="paystackPublic">Paystack Public Key</Label>
                <Input
                  id="paystackPublic"
                  type="text"
                  value={formData.paystackPublicKey}
                  onChange={(e) =>
                    setFormData({ ...formData, paystackPublicKey: e.target.value })
                  }
                  placeholder="pk_test_..."
                />
              </div>

              {config?.hasPaystackConfig && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm text-green-800">✓ Paystack configuration is active</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exchange Rate Configuration */}
        <TabsContent value="exchange">
          <Card>
            <CardHeader>
              <CardTitle>Exchange Rate Configuration</CardTitle>
              <CardDescription>Configure exchange rate provider and API key</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="exchangeProvider">Exchange Rate Provider</Label>
                <Input
                  id="exchangeProvider"
                  value={formData.exchangeRateProvider}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateProvider: e.target.value })
                  }
                  placeholder="exchangerate-api.com"
                />
              </div>

              <div>
                <Label htmlFor="exchangeApiKey">Exchange Rate API Key</Label>
                <Input
                  id="exchangeApiKey"
                  type="password"
                  value={formData.exchangeRateApiKey}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateApiKey: e.target.value })
                  }
                  placeholder="Your API key from exchangerate-api.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your free API key from{" "}
                  <a
                    href="https://www.exchangerate-api.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    exchangerate-api.com
                  </a>
                </p>
              </div>

              <div>
                <Label htmlFor="exchangeMargin">Exchange Rate Margin (%)</Label>
                <Input
                  id="exchangeMargin"
                  type="number"
                  step="0.01"
                  value={formData.exchangeRateMargin}
                  onChange={(e) =>
                    setFormData({ ...formData, exchangeRateMargin: parseFloat(e.target.value) })
                  }
                />
                <p className="text-xs text-gray-500 mt-1">
                  Additional margin to add to exchange rate (e.g., 2% = 0.02)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
