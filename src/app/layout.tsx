import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Poppins, Space_Grotesk } from "next/font/google";
import { NightModeArrival } from "@/components/NightModeArrival";
import { ThemeProvider } from "@/components/ThemeProvider";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

/**
 * WUDA's own voice.
 *
 * Loaded here rather than on the WUDA route because next/font must be called
 * at module scope in a layout or page, and defining it in the root keeps all
 * three families in one place where the pairing can be judged.
 *
 * It is deliberately the only face in the panel that is not Poppins or
 * JetBrains. WUDA is the one surface that is not a table of the company's own
 * records — it is something you talk to — and giving it a typeface of its own
 * is what stops it reading as just another operations page. Space Grotesk is
 * close enough in proportion to Poppins to sit beside it without a seam, and
 * odd enough in its details to be recognisably not it.
 *
 * Scoped by the `font-wuda` utility, so nothing outside that page changes.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  // Named for the family, not for the role. globals.css then maps it to
  // --font-wuda inside `@theme inline`, exactly as --font-poppins maps to
  // --font-sans. Defining the role name here instead would collide with the
  // theme layer and resolve to nothing.
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  // A template so each segment supplies only its own name and every tab still
  // says which product it belongs to — "Payouts · Mioryde", not "Payouts".
  title: {
    default: "Mioryde Operations",
    template: "%s · Mioryde",
  },
  description: "Internal operations panel for Mioryde.",
  // An internal tool has no business being indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Both, so the browser paints native UI (scrollbars, form controls) to match
  // whichever theme is active rather than flashing the wrong one.
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Blocking and inline, before any paint. It sets data-theme from
          localStorage so a tokyo user never sees a light flash while React
          hydrates. suppressHydrationWarning above is required because this
          mutates <html> before React sees it.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body
        className={`${poppins.variable} ${jetbrains.variable} ${spaceGrotesk.variable}`}
      >
        <ThemeProvider>
          {children}
          {/* Outside the panel shell on purpose: the flourish should play over
              the sign-in page too, and it must survive a route change part-way
              through its two seconds. */}
          <NightModeArrival />
        </ThemeProvider>
      </body>
    </html>
  );
}
