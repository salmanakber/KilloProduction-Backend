"use client"

import { useEffect, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

export type AdminBookingLocationEvent = {
  bookingId: string
  riderId?: string
  lat: number
  lng: number
  heading?: number | null
  timestamp?: string
}

export type AdminBookingStatusEvent = {
  bookingId: string
  bookingType?: string
  status?: string
  bookingNumber?: string
  riderId?: string
  latitude?: number
  longitude?: number
  timestamp?: string
}

export type AdminSosAlertEvent = {
  bookingId: string
  bookingNumber?: string
  sosId: string
  latitude?: number
  longitude?: number
  timestamp?: string
}

type Handlers = {
  onLocation?: (data: AdminBookingLocationEvent) => void
  onStatus?: (data: AdminBookingStatusEvent) => void
  onSos?: (data: AdminSosAlertEvent) => void
}

export function useAdminBookingsMonitorSocket(
  enabled: boolean,
  handlers: Handlers
) {
  const [connected, setConnected] = useState(false)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return

    const socket: Socket = io(window.location.origin, {
      path: "/api/socketio",
      transports: ["websocket"],
      withCredentials: true,
    })

    socket.on("connect", () => {
      setConnected(true)
      socket.emit("join_admin_bookings_monitor", {}, (ack: { ok?: boolean }) => {
        if (!ack?.ok) setConnected(false)
      })
    })

    socket.on("disconnect", () => setConnected(false))

    socket.on("admin_booking_location", (data: AdminBookingLocationEvent) => {
      if (data?.bookingId && Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
        handlersRef.current.onLocation?.(data)
      }
    })

    socket.on("admin_booking_status_update", (data: AdminBookingStatusEvent) => {
      if (data?.bookingId) handlersRef.current.onStatus?.(data)
    })

    socket.on("admin_sos_alert", (data: AdminSosAlertEvent) => {
      if (data?.bookingId) handlersRef.current.onSos?.(data)
    })

    return () => {
      socket.emit("leave_admin_bookings_monitor")
      socket.disconnect()
      setConnected(false)
    }
  }, [enabled])

  return { socketConnected: connected }
}
