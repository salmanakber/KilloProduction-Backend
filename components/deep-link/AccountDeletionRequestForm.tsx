"use client"

import { useState } from "react"

type Props = {
  supportEmail: string
  retentionDays: number
}

export default function AccountDeletionRequestForm({ supportEmail, retentionDays }: Props) {
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [fullName, setFullName] = useState("")
  const [reason, setReason] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ reference: string; message: string } | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim() && !phone.trim()) {
      setError("Please enter the email or phone number on your Kilo account.")
      return
    }
    if (!confirm) {
      setError("Please confirm you want to request permanent account deletion.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/account-deletion/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          fullName: fullName.trim() || undefined,
          reason: reason.trim() || undefined,
          confirm: true,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || "Could not submit deletion request")
      }
      setDone({
        reference: data.reference || data.id || "submitted",
        message:
          data.message ||
          `Your deletion request was received. Personal data is typically purged within ${retentionDays} days after confirmation.`,
      })
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again or email support.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 space-y-3">
        <h2 className="text-lg font-bold text-emerald-200">Request received</h2>
        <p className="text-sm text-slate-200 leading-relaxed">{done.message}</p>
        <p className="text-xs text-slate-400">
          Reference: <span className="font-mono text-emerald-300">{done.reference}</span>
        </p>
        <p className="text-sm text-slate-300 leading-relaxed">
          If an account matches the details you provided, our team will verify and process deletion.
          You may also cancel a scheduled deletion by signing into the app before the purge date.
        </p>
        <p className="text-xs text-slate-500">
          Questions?{" "}
          <a href={`mailto:${supportEmail}`} className="text-emerald-300 underline">
            {supportEmail}
          </a>
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 space-y-5">
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-white">Request deletion on the web (no login)</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Google Play and App Store users can request account deletion here without opening the app.
          Enter the email and/or phone number used for your Kilo account. Our team will verify and
          process the request.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="del-name" className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Full name (optional)
          </label>
          <input
            id="del-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            placeholder="Name on the account"
            autoComplete="name"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="del-email" className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Account email
            </label>
            <input
              id="del-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="del-phone" className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Account phone
            </label>
            <input
              id="del-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              placeholder="+234…"
              autoComplete="tel"
            />
          </div>
        </div>
        <p className="text-[11px] text-slate-500">Provide at least one of email or phone.</p>

        <div className="space-y-1.5">
          <label htmlFor="del-reason" className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Reason (optional)
          </label>
          <textarea
            id="del-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
            placeholder="Tell us why you’re leaving (optional)"
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-500"
          />
          <span className="text-sm text-slate-300 leading-relaxed">
            I request permanent deletion of my Kilo account and associated personal data. I understand
            this cannot be undone after the {retentionDays}-day processing / retention window.
          </span>
        </label>

        {error ? (
          <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-rose-600 hover:bg-rose-500 transition-colors text-white font-bold py-3.5 px-4 disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit account deletion request"}
        </button>
      </form>
    </section>
  )
}
