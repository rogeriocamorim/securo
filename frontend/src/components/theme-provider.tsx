import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ReactNode } from 'react'

// next-themes renders an inline <script> to stop a theme flash during server
// rendering. This app only renders on the client, where that script never
// runs, and React 19.3 logs an error for it. A non-JavaScript type marks it
// as a data block, which React leaves alone.
const THEME_SCRIPT_PROPS = { type: 'application/json' }

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      scriptProps={THEME_SCRIPT_PROPS}
    >
      {children}
    </NextThemesProvider>
  )
}
