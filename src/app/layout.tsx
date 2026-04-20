import type { Metadata, Viewport } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { CursorGlow } from "@/components/chrome/CursorGlow";
import { MobileNotice } from "@/components/chrome/MobileNotice";

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
        <div className="ap-desktop-only relative z-10 flex flex-1 flex-col">
          {children}
        </div>
        <MobileNotice />
      </body>
    </html>
  );
}
