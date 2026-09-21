"use client"

import * as React from "react"

import { fitFontSize } from "@/lib/fit-text"
import { cn } from "@/lib/utils"

/**
 * One line of text that shrinks its font (from `max` down to `min` px) to fit
 * the width it is given, and truncates with an ellipsis only past `min`.
 * Refits when the box resizes or the text changes.
 */
function FitText({
  children,
  max = 12,
  min = 9,
  className,
}: {
  children: React.ReactNode
  max?: number
  min?: number
  className?: string
}) {
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      // Measure at full size, then settle on the size that fits.
      el.style.fontSize = `${max}px`
      el.style.fontSize = `${fitFontSize(el.clientWidth, el.scrollWidth, max, min)}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    document.fonts?.ready.then(fit)
    return () => observer.disconnect()
  }, [children, max, min])

  return (
    <span
      ref={ref}
      data-slot="fit-text"
      className={cn(
        "block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap",
        className
      )}
      style={{ fontSize: max }}
    >
      {children}
    </span>
  )
}

export { FitText }
