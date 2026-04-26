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

export const metadata: Metadata = {
  title: "AI Pulse — live status & activity monitor for AI coding tools",
  description:
    "Real-time status pages for Anthropic, OpenAI, GitHub Copilot, plus a globe of public AI-coding events from the GitHub Events API. Every number cites its source. MVP scope: 3 tools + 1 activity feed.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AI Pulse",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
