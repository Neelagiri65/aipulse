import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CursorGlow } from "@/components/chrome/CursorGlow";
import { GlobalOverlays } from "@/components/chrome/GlobalOverlays";
import { ServiceWorkerRegister } from "@/components/chrome/ServiceWorkerRegister";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * `metadataBase` resolves all relative og/twitter image URLs into absolute
 * ones at build time. Without it, Next.js falls back to localhost in dev
 * and emits a warning in build. NEXT_PUBLIC_SITE_ORIGIN is set on Vercel
 * for prod (https://gawk.dev) and dev (http://localhost:3000); fall back
 * to gawk.dev to keep prod-shape unfurls in any preview that omits it.
 */
const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_ORIGIN?.replace(/\/$/, "") ?? "https://gawk.dev";

const SITE_DESCRIPTION =
  "Real-time observatory for the global AI ecosystem. Every number cites its public source.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "Gawk — live status & activity monitor for AI coding tools",
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Gawk",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: "Gawk",
    title: "Gawk — live status & activity monitor for AI coding tools",
    description: SITE_DESCRIPTION,
    url: SITE_ORIGIN,
    locale: "en_GB",
    // Absolute URL avoids the localhost fallback in dev and lets the
    // root opengraph-image.tsx still take over via Next's auto-injection
    // for routes that don't override it.
  },
  twitter: {
    card: "summary_large_image",
    title: "Gawk — live status & activity monitor for AI coding tools",
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#06080a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <div className="ap-stage-bg" aria-hidden />
        <CursorGlow />
        <div className="relative z-10 flex flex-1 flex-col">{children}</div>
        <GlobalOverlays />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
