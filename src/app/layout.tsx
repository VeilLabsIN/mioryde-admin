import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Poppins } from "next/font/google";
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
      <body className={`${poppins.variable} ${jetbrains.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
