// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "My App",
  description: "A modern Next.js 13+ app",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
<html lang="en">
  <head />
  <body>{children}</body>
</html>
  )
}
