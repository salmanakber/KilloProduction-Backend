"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Save, Plus, Trash2, Settings, AlertCircle, CheckCircle, Send, Users } from "lucide-react"

// Simple separator component
const Separator = () => <hr className="border-t border-gray-200 my-4" />

// Simple switch component
const Switch = ({ checked, onCheckedChange, ...props }: any) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={(e) => onCheckedChange?.(e.target.checked)}
    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
    {...props}
  />
)

interface FirebaseConfig {
  id: string
  projectId: string
  projectName: string
  apiKey: string
  authDomain: string
  storageBucket: string
  messagingSenderId: string
  appId: string
  measurementId?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function FirebaseConfigPage() {
  const [configs, setConfigs] = useState<FirebaseConfig[]>([])
  const [activeConfig, setActiveConfig] = useState<FirebaseConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingConfig, setEditingConfig] = useState<FirebaseConfig | null>(null)
  const [showTestForm, setShowTestForm] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<any>(null)
  
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    projectId: "",
    projectName: "",
    apiKey: "",
    authDomain: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: "",
    isActive: false
  })

  const [testFormData, setTestFormData] = useState({
    title: "Test Notification",
    message: "This is a test push notification from the admin panel",
    testType: "all_users"
  })

  useEffect(() => {
    fetchConfigs()
  }, [])

  const fetchConfigs = async () => {
    try {
      const response = await fetch("/api/admin/firebase-config")
      const data = await response.json()
      
      if (response.ok) {
        setActiveConfig(data.config)
        setConfigs(data.config ? [data.config] : [])
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to fetch Firebase configuration",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch Firebase configuration",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const url = editingConfig 
        ? `/api/admin/firebase-config` 
        : "/api/admin/firebase-config"
      
      const method = editingConfig ? "PUT" : "POST"
      const body = editingConfig 
        ? { ...formData, id: editingConfig.id }
        : formData

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Success",
          description: editingConfig 
            ? "Firebase configuration updated successfully" 
            : "Firebase configuration created successfully"
        })
        
        setShowForm(false)
        setEditingConfig(null)
        resetForm()
        fetchConfigs()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to save configuration",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save configuration",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this configuration?")) {
      return
    }

    try {
      const response = await fetch(`/api/admin/firebase-config?id=${id}`, {
        method: "DELETE"
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Firebase configuration deleted successfully"
        })
        fetchConfigs()
      } else {
        const data = await response.json()
        toast({
          title: "Error",
          description: data.error || "Failed to delete configuration",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete configuration",
        variant: "destructive"
      })
    }
  }

  const resetForm = () => {
    setFormData({
      projectId: "",
      projectName: "",
      apiKey: "",
      authDomain: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
      measurementId: "",
      isActive: false
    })
  }

  const editConfig = (config: FirebaseConfig) => {
    setEditingConfig(config)
    setFormData({
      projectId: config.projectId,
      projectName: config.projectName,
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      storageBucket: config.storageBucket,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
      measurementId: config.measurementId || "",
      isActive: config.isActive
    })
    setShowForm(true)
  }

  const handleTestNotification = async (e: React.FormEvent) => {
    e.preventDefault()
    setTesting(true)

    try {
      const response = await fetch("/api/admin/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testFormData)
      })

      const data = await response.json()

      if (response.ok) {
        setTestResults(data)
        toast({
          title: "Success",
          description: `Test notifications sent! ${data.totalSent} successful, ${data.totalFailed} failed`
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send test notifications",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send test notifications",
        variant: "destructive"
      })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Firebase Configuration</h1>
          <p className="text-muted-foreground">
            Manage Firebase project settings for push notifications
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowTestForm(true)}>
            <Send className="h-4 w-4 mr-2" />
            Test Notifications
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Configuration
          </Button>
        </div>
      </div>

      {/* Current Configuration */}
      {activeConfig && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Active Configuration
                </CardTitle>
                <CardDescription>
                  Currently active Firebase project for push notifications
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default" className="bg-green-100 text-green-800">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editConfig(activeConfig)}
                >
                  Edit
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Project Name</Label>
                <p className="text-lg font-semibold">{activeConfig.projectName}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Project ID</Label>
                <p className="text-sm font-mono bg-muted p-2 rounded">{activeConfig.projectId}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Auth Domain</Label>
                <p className="text-sm">{activeConfig.authDomain}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Storage Bucket</Label>
                <p className="text-sm">{activeConfig.storageBucket}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">Messaging Sender ID</Label>
                <p className="text-sm font-mono">{activeConfig.messagingSenderId}</p>
              </div>
              <div>
                <Label className="text-sm font-medium text-muted-foreground">App ID</Label>
                <p className="text-sm font-mono">{activeConfig.appId}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Configuration Alert */}
      {!activeConfig && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No active Firebase configuration found. Add a configuration to enable push notifications.
          </AlertDescription>
        </Alert>
      )}

      {/* Configuration Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingConfig ? "Edit Configuration" : "Add New Configuration"}
            </CardTitle>
            <CardDescription>
              Enter your Firebase project configuration details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projectName">Project Name *</Label>
                  <Input
                    id="projectName"
                    value={formData.projectName}
                    onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                    placeholder="My Firebase Project"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="projectId">Project ID *</Label>
                  <Input
                    id="projectId"
                    value={formData.projectId}
                    onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                    placeholder="my-project-123"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key *</Label>
                <Input
                  id="apiKey"
                  value={formData.apiKey}
                  onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="authDomain">Auth Domain *</Label>
                  <Input
                    id="authDomain"
                    value={formData.authDomain}
                    onChange={(e) => setFormData({ ...formData, authDomain: e.target.value })}
                    placeholder="my-project.firebaseapp.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageBucket">Storage Bucket *</Label>
                  <Input
                    id="storageBucket"
                    value={formData.storageBucket}
                    onChange={(e) => setFormData({ ...formData, storageBucket: e.target.value })}
                    placeholder="my-project.appspot.com"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="messagingSenderId">Messaging Sender ID *</Label>
                  <Input
                    id="messagingSenderId"
                    value={formData.messagingSenderId}
                    onChange={(e) => setFormData({ ...formData, messagingSenderId: e.target.value })}
                    placeholder="123456789"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="appId">App ID *</Label>
                  <Input
                    id="appId"
                    value={formData.appId}
                    onChange={(e) => setFormData({ ...formData, appId: e.target.value })}
                    placeholder="1:123456789:web:abc123"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="measurementId">Measurement ID (Optional)</Label>
                <Input
                  id="measurementId"
                  value={formData.measurementId}
                  onChange={(e) => setFormData({ ...formData, measurementId: e.target.value })}
                  placeholder="G-XXXXXXXXXX"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="isActive">Set as active configuration</Label>
              </div>

              <Separator />

              <div className="flex items-center justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingConfig(null)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  {editingConfig ? "Update" : "Create"} Configuration
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

             {/* Test Notification Form */}
       {showTestForm && (
         <Card>
           <CardHeader>
             <CardTitle className="flex items-center gap-2">
               <Send className="h-5 w-5" />
               Test Push Notifications
             </CardTitle>
             <CardDescription>
               Send test push notifications to verify Firebase configuration
             </CardDescription>
           </CardHeader>
           <CardContent>
             <form onSubmit={handleTestNotification} className="space-y-6">
               <div className="space-y-2">
                 <Label htmlFor="testTitle">Notification Title *</Label>
                 <Input
                   id="testTitle"
                   value={testFormData.title}
                   onChange={(e) => setTestFormData({ ...testFormData, title: e.target.value })}
                   placeholder="Test Notification"
                   required
                 />
               </div>

               <div className="space-y-2">
                 <Label htmlFor="testMessage">Notification Message *</Label>
                 <Textarea
                   id="testMessage"
                   value={testFormData.message}
                   onChange={(e) => setTestFormData({ ...testFormData, message: e.target.value })}
                   placeholder="This is a test push notification from the admin panel"
                   required
                   rows={3}
                 />
               </div>

               <div className="space-y-2">
                 <Label>Test Type</Label>
                 <div className="flex items-center space-x-4">
                   <div className="flex items-center space-x-2">
                     <input
                       type="radio"
                       id="all_users"
                       name="testType"
                       value="all_users"
                       checked={testFormData.testType === "all_users"}
                       onChange={(e) => setTestFormData({ ...testFormData, testType: e.target.value })}
                     />
                     <Label htmlFor="all_users">All Users (Max 10)</Label>
                   </div>
                 </div>
               </div>

               <Separator />

               <div className="flex items-center justify-end space-x-2">
                 <Button
                   type="button"
                   variant="outline"
                   onClick={() => {
                     setShowTestForm(false)
                     setTestResults(null)
                   }}
                 >
                   Cancel
                 </Button>
                 <Button type="submit" disabled={testing}>
                   {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                   <Send className="h-4 w-4 mr-2" />
                   Send Test Notification
                 </Button>
               </div>
             </form>

             {/* Test Results */}
             {testResults && (
               <div className="mt-6 p-4 bg-muted rounded-lg">
                 <h4 className="font-semibold mb-2">Test Results</h4>
                 <div className="space-y-2 text-sm">
                   <p>Total Sent: {testResults.totalSent}</p>
                   <p>Total Failed: {testResults.totalFailed}</p>
                   {testResults.results && testResults.results.length > 0 && (
                     <div className="mt-4">
                       <h5 className="font-medium mb-2">Details:</h5>
                       <div className="space-y-1">
                         {testResults.results.map((result: any, index: number) => (
                           <div key={index} className="flex items-center gap-2">
                             <span className={result.success ? "text-green-600" : "text-red-600"}>
                               {result.success ? "✓" : "✗"}
                             </span>
                             <span>{result.userName || result.userId}</span>
                             {!result.success && (
                               <span className="text-red-600 text-xs">({result.error})</span>
                             )}
                           </div>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
               </div>
             )}
           </CardContent>
         </Card>
       )}

       {/* Configuration History */}
       {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Configuration History</CardTitle>
            <CardDescription>
              Previous Firebase configurations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{config.projectName}</h3>
                      {config.isActive && (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          Active
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Project ID: {config.projectId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Updated: {new Date(config.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => editConfig(config)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
