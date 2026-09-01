"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

/**
 * App-wide theme context. `next-themes` writes the chosen scheme to a `class`
 * on <html> (`.dark` / nothing), and defaults to following the OS until the
 * member picks Light or Dark under Settings → View.
 */
export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
