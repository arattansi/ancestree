"use client"

import * as React from "react"

import { fitFontSize } from "@/lib/fit-text"
import { cn } from "@/lib/utils"

type Fit = { max: number; min: number; width: number }

// Every FitText on the page shares one ResizeObserver, and a batch of them
// is fitted together: every font size written, then every width read, then
// every size settled, so a batch costs one layout rather than one per line
// (Step 87.7, audit C7). Its first report of a line, before that line is
// painted, is the line's first fit.
const fits = new Map<HTMLElement, Fit>()
let observer: ResizeObserver | null = null
let awaitingFonts = false

function fitAll(els: HTMLElement[]) {
  const batch = els.filter((el) => fits.has(el))
  // Measure at full size, then settle on the size that fits.
  for (const el of batch) el.style.fontSize = `${fits.get(el)!.max}px`
  const sizes = batch.map((el) => {
    const { max, min } = fits.get(el)!
    return fitFontSize(el.clientWidth, el.scrollWidth, max, min)
  })
  batch.forEach((el, i) => {
    el.style.fontSize = `${sizes[i]}px`
  })
  // A web font still on its way changes every width: fit them all again
  // once it lands, and only then.
  if (!awaitingFonts && document.fonts?.status === "loading") {
    awaitingFonts = true
    void document.fonts.ready.then(() => {
      awaitingFonts = false
      fitAll([...fits.keys()])
    })
  }
}

function onResize(entries: ResizeObserverEntry[]) {
  const resized: HTMLElement[] = []
  for (const entry of entries) {
    const el = entry.target as HTMLElement
    const fit = fits.get(el)
    // A new font size can change the line's height, never its width.
    const width = Math.round(entry.contentRect.width)
    if (!fit || fit.width === width) continue
    fit.width = width
    resized.push(el)
  }
  if (resized.length > 0) fitAll(resized)
}

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
    // Watched afresh for each text, so the observer's first report of it
    // (before it is painted) fits it.
    fits.set(el, { max, min, width: -1 })
    observer ??= new ResizeObserver(onResize)
    observer.observe(el)
    return () => {
      observer?.unobserve(el)
      fits.delete(el)
    }
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
