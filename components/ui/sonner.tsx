"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Below `sm` toasts come in at the top, under the header: at the bottom they
// covered the canvas's pill, minimized card and zoom buttons, and the foot
// of the details sheet, where its last buttons sit (Step 70, audit B5).
const NARROW = "(width < 40rem)"

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(NARROW)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const narrow = React.useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(NARROW).matches,
    () => false
  )

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={narrow ? "top-center" : "bottom-right"}
      // An error is red and a success green, not the same card with a
      // different 16px icon; each can be closed.
      richColors
      closeButton
      // The toaster's own region; "Notifications" is the header's bell.
      containerAriaLabel="Messages"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      // Sonner's own 24px / 16px, plus: under the header at the top; above
      // a form's floating buttons where they make a bar along the bottom of
      // the screen (Step 59); left of a details sheet docked on the right
      // (`--docked-sheet-width`, globals.css).
      offset={{
        top: "calc(var(--site-header-height, 3.5rem) + 12px)",
        bottom: "calc(24px + var(--floating-actions-height, 0px))",
        right: "calc(24px + var(--docked-sheet-width, 0px))",
      }}
      mobileOffset={{
        top: "calc(var(--site-header-height, 3.5rem) + 8px)",
        bottom: "calc(16px + var(--floating-actions-height, 0px))",
      }}
      {...props}
    />
  )
}

export { Toaster }
