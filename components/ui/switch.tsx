"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      // Enhanced track animations & inner depth
      "transition-colors duration-200 ease-in-out shadow-inner",
      // Improved focus rings that match the emerald theme
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
      // Disabled states
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Crisp colors matching your dashboard (Emerald for Active, Slate for Inactive) + Hover states
      "data-[state=checked]:bg-emerald-500",
      "data-[state=unchecked]:bg-slate-200 hover:data-[state=unchecked]:bg-slate-300",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white ring-0",
        // Premium thumb styling: custom soft drop-shadow + subtle border so it "pops" out of the track
        "shadow-[0_1px_2px_rgba(0,0,0,0.1),_0_1px_1px_rgba(0,0,0,0.06)] border border-black/5",
        // Snappier, smoother slide animation
        "transition-transform duration-200 ease-in-out",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }