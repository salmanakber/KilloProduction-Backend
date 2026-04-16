import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"

export default async function Home() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: 1 } })

  if (settings?.maintenanceMode) {
    const message =
      settings.maintenanceMessage?.trim() ||
      "We are performing system maintenance. Please try again later."

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 px-6">
        <div className="max-w-md w-full rounded-2xl bg-white shadow-lg border border-slate-200 p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Under maintenance</h1>
          <p className="mt-4 text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>
      </div>
    )
  }

  redirect("/admin")
}
