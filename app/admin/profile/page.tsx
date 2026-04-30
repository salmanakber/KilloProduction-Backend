"use client"

import { useEffect, useState } from "react"

export default function AdminProfilePage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    imageData: "",
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/profile")
      const data = await res.json()
      if (res.ok) {
        setForm((prev) => ({
          ...prev,
          name: data.name || "",
          email: data.email || "",
        }))
      }
    }
    void load()
  }, [])

  const onFileChange = async (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      setForm((prev) => ({ ...prev, imageData: result }))
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    setSaving(true)
    setMessage("")
    const res = await fetch("/api/admin/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setMessage(data.error || "Could not save profile")
      return
    }
    setMessage("Profile updated successfully")
    setForm((prev) => ({ ...prev, currentPassword: "", newPassword: "", imageData: "" }))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Profile Settings</h1>
        <p className="text-sm text-gray-600 mt-1">Update profile image, name, email, and password.</p>
      </div>

      <div className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Name</label>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            className="w-full border rounded-lg px-3 py-2 mt-1"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Profile Image</label>
          <input type="file" accept="image/*" className="block mt-1" onChange={(e) => void onFileChange(e.target.files?.[0] || null)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 mt-1"
              value={form.currentPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 mt-1"
              value={form.newPassword}
              onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
        {message && <p className="text-sm text-gray-700">{message}</p>}
      </div>
    </div>
  )
}
