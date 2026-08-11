import AccountDeletionPageClient from "@/components/deep-link/AccountDeletionPageClient"
import AccountDeletionRequestForm from "@/components/deep-link/AccountDeletionRequestForm"
import { getAccountDeletionPolicy } from "@/lib/account-deletion-policy"

export const metadata = {
  title: "Delete your Kilo account",
  description:
    "Request account and data deletion for Kilo without logging in, or delete from the Kilo app. Learn what is removed and retention timing.",
}

export default function AccountDeletionPage() {
  const policy = getAccountDeletionPolicy()

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-2xl mx-auto p-6 space-y-8">
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-bold">
            {policy.appName} · Account &amp; data deletion
          </p>
          <h1 className="text-3xl font-bold">Delete your account</h1>
          <p className="text-sm text-slate-300 leading-relaxed">{policy.summary}</p>
        </header>

        {/* Public Play Store path — no login required */}
        <AccountDeletionRequestForm
          supportEmail={policy.supportEmail}
          retentionDays={policy.retentionDays}
        />

        <AccountDeletionPageClient appName={policy.appName} />

        <section className="space-y-3">
          <h2 className="text-lg font-bold">How to delete in the app</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-slate-300">
            {policy.steps.map((step) => (
              <li key={step} className="leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">What happens after your request is confirmed</h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-slate-300">
            <li>Your account is disabled and you are signed out of active sessions.</li>
            <li>
              Personal data is scheduled for permanent secure purge after{" "}
              <strong className="text-white">{policy.retentionDays} days</strong>.
            </li>
            <li>
              If you requested deletion in the app, you can cancel by signing in again before the
              purge date (from Account).
            </li>
          </ul>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5 space-y-2">
            <h3 className="font-semibold text-emerald-300">Data that is deleted</h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1.5">
              {policy.dataDeleted.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5 space-y-2">
            <h3 className="font-semibold text-amber-300">Data that may be retained</h3>
            <ul className="list-disc list-inside text-sm text-slate-300 space-y-1.5">
              {policy.dataRetained.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 space-y-2">
          <h3 className="font-semibold text-amber-200">{policy.alternativeOption.title}</h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            {policy.alternativeOption.description}
          </p>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5 space-y-2 text-sm text-slate-300">
          <h3 className="font-semibold text-white">Need help?</h3>
          <p>
            Email{" "}
            <a
              href={`mailto:${policy.supportEmail}`}
              className="text-emerald-300 hover:text-emerald-200 underline"
            >
              {policy.supportEmail}
            </a>{" "}
            if you need assistance with account removal.
          </p>
          <p className="text-xs text-slate-500 pt-2">
            Public page URL (use in Play Console):{" "}
            <a href={policy.webUrl} className="text-emerald-400/80 hover:text-emerald-300 underline break-all">
              {policy.webUrl}
            </a>
          </p>
        </section>
      </div>
    </main>
  )
}
