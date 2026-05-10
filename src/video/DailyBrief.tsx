import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from "remotion";
import { noise2D } from "@remotion/noise";
import type { VideoData } from "./types";

declare const __VIDEO_DATA__: VideoData;
declare const __HAS_AUDIO__: boolean;
declare const __HAS_SCREENSHOTS__: boolean;

const FPS = 30;

const C = {
  bg: "#0a0e1a",
  bgCard: "#111827",
  bgCardHover: "#1e293b",
  accent: "#14b8a6",
  accentGlow: "rgba(20, 184, 166, 0.15)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  orange: "#ff6600",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  pink: "#ec4899",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  border: "#1e293b",
  borderAccent: "rgba(20, 184, 166, 0.3)",
};

// --- Animations ---

function useCountUp(target: number, dur = 40, delay = 0): number {
  const frame = useCurrentFrame();
  return Math.round(
    interpolate(frame - delay, [0, dur], [0, target], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })
  );
}

function FadeSlideIn({
  children,
  delay = 0,
  direction = "up",
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const off = interpolate(p, [0, 1], [30, 0]);
  const t: Record<string, string> = {
    up: `translateY(${off}px)`,
    down: `translateY(${-off}px)`,
    left: `translateX(${off}px)`,
    right: `translateX(${-off}px)`,
  };
  return <div style={{ opacity: p, transform: t[direction] }}>{children}</div>;
}

function ScaleIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, stiffness: 120 } });
  const o = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ transform: `scale(${s})`, opacity: o }}>{children}</div>;
}

function SourceFooter({ source, delay = 50 }: { source: string; delay?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 15], [0, 0.5], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", bottom: 28, right: 40, fontSize: 14, color: C.textDim, opacity: o, letterSpacing: 1 }}>
      {source}
    </div>
  );
}

function GlowBar() {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [0, 35], [0, 100], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ width: `${w}%`, height: 2, background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`, marginTop: 16, borderRadius: 2 }} />;
}

function SectionLabel({ text, color = C.accent }: { text: string; color?: string }) {
  return (
    <FadeSlideIn>
      <div style={{ fontSize: 16, color, letterSpacing: 6, textTransform: "uppercase", fontWeight: 500, marginBottom: 28 }}>
        {text}
      </div>
    </FadeSlideIn>
  );
}

function KenBurns({ src, zoomStart = 1, zoomEnd = 1.12, panX = 15, panY = -8 }: {
  src: string; zoomStart?: number; zoomEnd?: number; panX?: number; panY?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = spring({ frame, fps, from: zoomStart, to: zoomEnd, config: { stiffness: 30, damping: 20 } })
    + noise2D("kz", frame * 0.1, 0) * 0.005;
  const x = spring({ frame: Math.max(0, frame - 15), fps, from: 0, to: panX, config: { stiffness: 25, damping: 22 } })
    + noise2D("kx", frame * 0.08, 0) * 1;
  const y = noise2D("ky", frame * 0.07, 0) * 0.8 + interpolate(frame, [0, 300], [0, panY], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom}) translate(${x}px, ${y}px)`, transformOrigin: "center center" }} />
    </AbsoluteFill>
  );
}

// --- Scenes ---

function HeroScene() {
  const d = __VIDEO_DATA__;
  const s = d.ecosystemStats;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 30%, #1e1b4b 0%, ${C.bg} 70%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
      <FadeSlideIn><div style={{ fontSize: 18, color: C.accent, letterSpacing: 8, textTransform: "uppercase", fontWeight: 500 }}>GAWK DAILY BRIEF</div></FadeSlideIn>
      <FadeSlideIn delay={8}><GlowBar /></FadeSlideIn>
      <FadeSlideIn delay={14}><div style={{ fontSize: 52, fontWeight: 700, color: C.text, textAlign: "center", lineHeight: 1.3, marginTop: 28 }}>AI Ecosystem Daily Brief</div></FadeSlideIn>
      <FadeSlideIn delay={22}><div style={{ fontSize: 30, color: C.textMuted, marginTop: 12 }}>{formatDate(d.date)}</div></FadeSlideIn>
      <FadeSlideIn delay={32}>
        <div style={{ display: "flex", gap: 44, marginTop: 44 }}>
          <HeroStat label="Data Sources" value={s.sources} delay={34} />
          <HeroStat label="Live Crons" value={s.crons} delay={38} />
          <HeroStat label="AI Labs" value={s.labs} delay={42} />
        </div>
      </FadeSlideIn>
      <SourceFooter source="gawk.dev" delay={50} />
    </AbsoluteFill>
  );
}

function HeroStat({ label, value, delay }: { label: string; value: number; delay: number }) {
  const c = useCountUp(value, 25, delay);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 40, fontWeight: 700, color: C.accent }}>{c}</div>
      <div style={{ fontSize: 14, color: C.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function MapScene() {
  if (!__HAS_SCREENSHOTS__) {
    const d = __VIDEO_DATA__;
    if (!d.topRegion) return <EmptyScene text="No regional data" />;
    const pct = useCountUp(Math.round(d.topRegion.deltaPct), 30, 12);
    return (
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 50%, rgba(20,184,166,0.08) 0%, ${C.bg} 60%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <SectionLabel text="FASTEST GROWING REGION · 24H" />
        <ScaleIn delay={6}><div style={{ fontSize: 68, fontWeight: 700, color: C.text }}>{d.topRegion.country}</div></ScaleIn>
        <FadeSlideIn delay={16}><div style={{ fontSize: 48, fontWeight: 600, color: C.green, marginTop: 12 }}>↑ {pct}%</div></FadeSlideIn>
        {d.mostActiveCity && <FadeSlideIn delay={26}><div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 30px", marginTop: 32, fontSize: 22, color: C.textMuted }}>Most active: {d.mostActiveCity.city} · <span style={{ color: C.text, fontWeight: 600 }}>{d.mostActiveCity.count}</span> events</div></FadeSlideIn>}
        <SourceFooter source="Source: GitHub Events API · 24h" />
      </AbsoluteFill>
    );
  }
  const d = __VIDEO_DATA__;
  return (
    <AbsoluteFill>
      <KenBurns src={staticFile("video-screenshots/map-global.png")} zoomEnd={1.15} panX={20} panY={-10} />
      <div style={{ position: "absolute", top: 40, left: 48 }}>
        <FadeSlideIn><div style={{ fontSize: 16, color: C.accent, letterSpacing: 6, textTransform: "uppercase", background: "rgba(0,0,0,0.7)", padding: "8px 16px", borderRadius: 8 }}>GLOBAL ACTIVITY · 24H</div></FadeSlideIn>
      </div>
      {d.topRegion && (
        <div style={{ position: "absolute", bottom: 60, left: 48 }}>
          <FadeSlideIn delay={15}>
            <div style={{ background: "rgba(0,0,0,0.8)", border: `1px solid ${C.borderAccent}`, borderRadius: 14, padding: "20px 28px" }}>
              <div style={{ fontSize: 14, color: C.accent, letterSpacing: 4, textTransform: "uppercase" }}>FASTEST GROWING</div>
              <div style={{ fontSize: 36, fontWeight: 700, color: C.text, marginTop: 6 }}>{d.topRegion.country} <span style={{ color: C.green }}>↑{Math.round(d.topRegion.deltaPct)}%</span></div>
            </div>
          </FadeSlideIn>
        </div>
      )}
      <SourceFooter source="Source: GitHub Events API" />
    </AbsoluteFill>
  );
}

function ToolsScene() {
  const d = __VIDEO_DATA__;
  const allOk = d.toolHealth.degraded === 0;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="TOOL HEALTH" />
      <FadeSlideIn delay={6}>
        <div style={{ fontSize: 42, fontWeight: 700, color: allOk ? C.green : C.amber, marginBottom: 28 }}>
          {d.toolHealth.operational}/{d.toolHealth.total} Operational
        </div>
      </FadeSlideIn>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {d.toolHealth.tools.map((t, i) => (
          <FadeSlideIn key={t.name} delay={12 + i * 8} direction="left">
            <div style={{ background: C.bgCard, border: `1px solid ${t.status === "operational" ? C.border : C.red}`, borderRadius: 12, padding: "18px 24px", minWidth: 200 }}>
              <div style={{ fontSize: 10, color: t.status === "operational" ? C.green : C.red, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2 }}>{t.status}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.text, marginTop: 4 }}>{t.name}</div>
            </div>
          </FadeSlideIn>
        ))}
      </div>
      <SourceFooter source="Source: Anthropic · OpenAI · GitHub status pages" />
    </AbsoluteFill>
  );
}

function ModelsScene() {
  const d = __VIDEO_DATA__;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="MODEL RANKINGS · OPENROUTER" />
      {d.topModels.map((m, i) => (
        <FadeSlideIn key={m.name} delay={8 + i * 10} direction="left">
          <div style={{ display: "flex", alignItems: "center", gap: 18, background: i === 0 ? C.bgCardHover : C.bgCard, border: `1px solid ${i === 0 ? C.borderAccent : C.border}`, borderRadius: 12, padding: "18px 28px", marginBottom: 10 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: i === 0 ? C.accent : C.textDim, width: 48, textAlign: "center" }}>#{m.rank}</div>
            <div style={{ flex: 1, fontSize: 22, fontWeight: 600, color: C.text }}>{m.name}</div>
            <ModelDelta current={m.rank} previous={m.previousRank} />
          </div>
        </FadeSlideIn>
      ))}
      <SourceFooter source={`Source: OpenRouter${d.modelsFetchedAt ? ` · ${new Date(d.modelsFetchedAt).toISOString().slice(0, 16)}Z` : ""}`} />
    </AbsoluteFill>
  );
}

function ModelDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <div style={{ fontSize: 14, fontWeight: 600, color: C.textDim, background: "rgba(100,116,139,0.2)", borderRadius: 6, padding: "3px 10px" }}>NEW</div>;
  const delta = previous - current;
  if (delta === 0) return <div style={{ fontSize: 18, color: C.textDim }}>—</div>;
  return <div style={{ fontSize: 20, fontWeight: 600, color: delta > 0 ? C.green : C.red }}>{delta > 0 ? "↑" : "↓"} {Math.abs(delta)}</div>;
}

function SdkScene() {
  const d = __VIDEO_DATA__;
  if (d.sdkMovers.length === 0) return <EmptyScene text="No SDK data" />;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="SDK ADOPTION · TOP MOVERS" color={C.blue} />
      {d.sdkMovers.map((s, i) => {
        const isUp = s.diffPct > 0;
        return (
          <FadeSlideIn key={s.name} delay={8 + i * 12} direction="left">
            <div style={{ display: "flex", alignItems: "center", gap: 20, background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${isUp ? C.green : C.red}`, borderRadius: 12, padding: "20px 28px", marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 14, color: C.textDim, marginTop: 2 }}>{s.registry}</div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: isUp ? C.green : C.red }}>{isUp ? "↑" : "↓"} {Math.abs(s.diffPct)}%</div>
            </div>
          </FadeSlideIn>
        );
      })}
      <SourceFooter source="Source: PyPI · npm · crates.io · Docker Hub" />
    </AbsoluteFill>
  );
}

function AgentsScene() {
  const d = __VIDEO_DATA__;
  if (d.topAgents.length === 0) return <EmptyScene text="No agent data" />;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="AGENT FRAMEWORKS" color={C.purple} />
      {d.topAgents.map((a, i) => (
        <FadeSlideIn key={a.name} delay={8 + i * 10} direction="left">
          <div style={{ display: "flex", alignItems: "center", gap: 20, background: i === 0 ? C.bgCardHover : C.bgCard, border: `1px solid ${i === 0 ? C.borderAccent : C.border}`, borderRadius: 12, padding: "20px 28px", marginBottom: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: i === 0 ? C.accent : C.textDim, width: 36 }}>#{i + 1}</div>
            <div style={{ flex: 1, fontSize: 22, fontWeight: 600, color: C.text }}>{a.name}</div>
            <div style={{ fontSize: 20, color: C.textMuted }}>{formatNum(a.weeklyDownloads)}/wk</div>
          </div>
        </FadeSlideIn>
      ))}
      <SourceFooter source="Source: PyPI · npm weekly downloads" />
    </AbsoluteFill>
  );
}

function LabsScene() {
  const d = __VIDEO_DATA__;
  if (d.topLabs.length === 0) return <EmptyScene text="No lab data" />;
  const maxEvents = d.topLabs[0]?.eventCount ?? 1;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="LAB ACTIVITY · 24H" color={C.pink} />
      {d.topLabs.map((l, i) => {
        const barW = interpolate(l.eventCount, [0, maxEvents], [20, 100]);
        return (
          <FadeSlideIn key={l.name} delay={8 + i * 10} direction="left">
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{l.name}</div>
                <div style={{ fontSize: 20, color: C.textMuted }}>{l.eventCount} events · {l.repoCount} repos</div>
              </div>
              <BarFill pct={barW} delay={12 + i * 10} color={i === 0 ? C.accent : C.blue} />
            </div>
          </FadeSlideIn>
        );
      })}
      <SourceFooter source="Source: GitHub Events API" />
    </AbsoluteFill>
  );
}

function BarFill({ pct, delay, color }: { pct: number; delay: number; color: string }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 30], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ width: "100%", height: 8, background: C.bgCard, borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 4 }} />
    </div>
  );
}

function ReposScene() {
  const d = __VIDEO_DATA__;
  if (d.topRepos.length === 0) return <EmptyScene text="No repo data" />;
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="TOP GITHUB REPOS · 24H" color={C.cyan} />
      {d.topRepos.map((r, i) => (
        <FadeSlideIn key={`${r.owner}/${r.name}`} delay={8 + i * 12} direction="left">
          <div style={{ display: "flex", alignItems: "center", gap: 18, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 28px", marginBottom: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.textDim, width: 36 }}>#{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{r.owner}/{r.name}</div>
              {r.language && <div style={{ fontSize: 14, color: C.textDim, marginTop: 2 }}>{r.language}</div>}
            </div>
            <div style={{ fontSize: 20, color: C.accent, fontWeight: 600 }}>{r.eventCount} events</div>
          </div>
        </FadeSlideIn>
      ))}
      <SourceFooter source="Source: GitHub Events API" />
    </AbsoluteFill>
  );
}

function FeedScene() {
  const d = __VIDEO_DATA__;
  const cards = d.topCards.slice(0, 3);
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", flexDirection: "column", padding: "60px 80px" }}>
      <SectionLabel text="TOP SIGNALS" />
      {cards.map((c, i) => (
        <FadeSlideIn key={c.headline} delay={8 + i * 14} direction="left">
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `4px solid ${cardColor(c.type)}`, borderRadius: 12, padding: "22px 28px", marginBottom: 14, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{c.headline}</div>
              {c.detail && <div style={{ fontSize: 16, color: C.textMuted, marginTop: 4 }}>{c.detail}</div>}
            </div>
            <div style={{ background: cardColor(c.type), borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>{c.type.replace(/_/g, " ")}</div>
          </div>
        </FadeSlideIn>
      ))}
      <SourceFooter source="Source: Gawk Feed · ranked by severity" />
    </AbsoluteFill>
  );
}

function HNScene() {
  const d = __VIDEO_DATA__;
  if (!d.hnTopStory) return <EmptyScene text="No significant HN activity today" />;
  const pts = useCountUp(d.hnTopStory.points, 30, 18);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 60%, rgba(255,102,0,0.06) 0%, ${C.bg} 60%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
      <SectionLabel text="TOP ON HACKER NEWS" color={C.orange} />
      <ScaleIn delay={8}>
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderTop: `3px solid ${C.orange}`, borderRadius: 16, padding: "36px 44px", maxWidth: 1100, textAlign: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d.hnTopStory.title}</div>
          <div style={{ fontSize: 28, color: C.orange, marginTop: 16, fontWeight: 700 }}>{pts} points</div>
        </div>
      </ScaleIn>
      <SourceFooter source="Source: Hacker News · Algolia API" />
    </AbsoluteFill>
  );
}

function OutroScene() {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame / 10), [-1, 1], [0.96, 1.04]);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 40%, #1e1b4b 0%, ${C.bg} 70%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <ScaleIn>
        <div style={{ fontSize: 68, fontWeight: 700, color: C.accent, transform: `scale(${pulse})` }}>gawk.dev</div>
      </ScaleIn>
      <FadeSlideIn delay={12}><div style={{ fontSize: 26, color: C.text, marginTop: 20 }}>Track the AI ecosystem in real time</div></FadeSlideIn>
      <FadeSlideIn delay={24}>
        <div style={{ marginTop: 32, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, color: "#fff", fontSize: 18, fontWeight: 600, padding: "12px 40px", borderRadius: 10, boxShadow: `0 0 30px ${C.accentGlow}` }}>
          Subscribe for the daily digest →
        </div>
      </FadeSlideIn>
    </AbsoluteFill>
  );
}

function EmptyScene({ text }: { text: string }) {
  return <AbsoluteFill style={{ background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ fontSize: 28, color: C.textMuted }}>{text}</div></AbsoluteFill>;
}

// --- Main composition ---

export const DailyBrief: React.FC = () => {
  const data = __VIDEO_DATA__;
  let frameOffset = 0;
  const seqs: { id: string; from: number; duration: number }[] = [];
  for (const sc of data.scenes) {
    const dur = sc.durationInSeconds * FPS;
    seqs.push({ id: sc.id, from: frameOffset, duration: dur });
    frameOffset += dur;
  }

  const components: Record<string, React.FC> = {
    hero: HeroScene,
    region: MapScene,
    tools: ToolsScene,
    models: ModelsScene,
    sdk: SdkScene,
    agents: AgentsScene,
    labs: LabsScene,
    repos: ReposScene,
    feed: FeedScene,
    hn: HNScene,
    outro: OutroScene,
  };

  return (
    <AbsoluteFill style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {seqs.map((s) => {
        const Comp = components[s.id];
        if (!Comp) return null;
        return <Sequence key={s.id} from={s.from} durationInFrames={s.duration}><Comp /></Sequence>;
      })}
      {__HAS_AUDIO__ && <Audio src={staticFile("video-narration.mp3")} />}
    </AbsoluteFill>
  );
};

function cardColor(type: string): string {
  const m: Record<string, string> = { TOOL_ALERT: C.red, MODEL_MOVER: C.purple, NEW_RELEASE: C.green, SDK_TREND: C.blue, NEWS: C.amber, RESEARCH: C.cyan, LAB_HIGHLIGHT: C.pink };
  return m[type] ?? C.accent;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
