import type { Metadata } from "next";
import { PreferencesClient } from "@/components/consent/PreferencesClient";
import { PrivacyFooter } from "@/components/consent/PrivacyFooter";

export const metadata: Metadata = {
  title: "Consent preferences — Gawk",
  description: "Change what Gawk is allowed to remember about you.",
};

export default function PreferencesPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-sm leading-relaxed text-foreground">
      <h1 className="mb-2 font-mono text-2xl tracking-tight">Consent</h1>
      <p className="mb-6 text-muted-foreground">
        Change what Gawk is allowed to remember about you, or delete
        your consent record entirely.
      </p>
      <PreferencesClient />
      <PrivacyFooter />
    </main>
  );
}
