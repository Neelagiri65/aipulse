/**
 * SocialLinks — the "gawk.dev elsewhere" icon row, shared by every footer a
 * visitor sees (PrivacyFooter on static pages, the mobile dashboard footer,
 * lab and report pages). Same pattern as nativerse-ventures.com and
 * mcp.gawk.dev (`.foot-social`), drawn in gawk.dev's own tokens.
 *
 * Icons are Simple Icons (CC0) shipped as static files in `public/social/`
 * and painted through a CSS mask, so each is one colour: muted ink at rest,
 * the `--link` accent on hover / focus-visible. Styles live in globals.css
 * under `.ap-social`.
 *
 * `rel="noopener me"`: `me` asserts these profiles belong to the same owner
 * as this site (rel-me verification); the referrer is deliberately kept.
 */

export type SocialLink = {
  /** Icon file stem under /public/social/. */
  icon: string;
  label: string;
  href: string;
};

export const SOCIAL_LINKS: readonly SocialLink[] = [
  { icon: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/company/nativerse-ventures" },
  { icon: "youtube", label: "YouTube", href: "https://www.youtube.com/@GawkDev" },
  { icon: "github", label: "GitHub", href: "https://github.com/Neelagiri65/aipulse" },
  { icon: "devdotto", label: "DEV Community", href: "https://dev.to/neelagiri65" },
  { icon: "substack", label: "Substack", href: "https://srinathns.substack.com" },
  { icon: "medium", label: "Medium", href: "https://medium.com/@srinathprasanna" },
];

export function SocialLinks({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="gawk.dev elsewhere"
      className={`ap-social ${className}`.trim()}
      data-testid="social-links"
    >
      {SOCIAL_LINKS.map((s) => (
        <a
          key={s.icon}
          href={s.href}
          target="_blank"
          rel="noopener me"
          aria-label={`gawk.dev on ${s.label}`}
          title={s.label}
        >
          <span
            className="ap-social__ico"
            aria-hidden="true"
            style={{ "--m": `url(/social/${s.icon}.svg)` } as React.CSSProperties}
          />
        </a>
      ))}
    </nav>
  );
}
