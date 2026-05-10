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
const CROSSFADE_FRAMES = 12;

const C = {
  bg: "#080c14",
  bgCard: "rgba(17, 24, 39, 0.85)",
  bgCardSolid: "#111827",
  accent: "#14b8a6",
  accentGlow: "rgba(20, 184, 166, 0.2)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#475569",
  orange: "#ff6600",
  green: "#22c55e",
  red: "#ef4444",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  pink: "#ec4899",
  amber: "#f59e0b",
  cyan: "#06b6d4",
  border: "rgba(30, 41, 59, 0.6)",
  borderAccent: "rgba(20, 184, 166, 0.3)",
  gridLine: "rgba(20, 184, 166, 0.04)",
};

// --- Terminal grid background ---

function TerminalGrid() {
  const frame = useCurrentFrame();
  const scanY = interpolate(frame % 180, [0, 180], [-5, 105]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Grid lines */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(${C.gridLine} 1px, transparent 1px),
          linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        opacity: 0.8,
      }} />
      {/* Scanline */}
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: `${scanY}%`, height: 2,
        background: `linear-gradient(90deg, transparent, rgba(20,184,166,0.08), transparent)`,
      }} />
      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
      }} />
    </AbsoluteFill>
  );
}

// --- Scene wrapper with crossfade ---

function SceneWrap({ children, durationInFrames }: { children: React.ReactNode; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - CROSSFADE_FRAMES, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ background: C.bg }} />
      <TerminalGrid />
      {children}
    </AbsoluteFill>
  );
}

// --- Animations ---

function useCountUp(target: number, dur = 35, delay = 0): number {
  const frame = useCurrentFrame();
  return Math.round(interpolate(frame - delay, [0, dur], [0, target], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  }));
}

function FadeSlideIn({ children, delay = 0, direction = "up" }: {
  children: React.ReactNode; delay?: number; direction?: "up" | "left" | "right";
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  const off = (1 - p) * 24;
  const transforms: Record<string, string> = {
    up: `translateY(${off}px)`, left: `translateX(${off}px)`, right: `translateX(${-off}px)`,
  };
  return <div style={{ opacity: p, transform: transforms[direction] }}>{children}</div>;
}

function ScaleIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 100 } });
  const o = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ transform: `scale(${s})`, opacity: o }}>{children}</div>;
}

function GlowLine({ delay = 0, color = C.accent }: { delay?: number; color?: string }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 30], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ width: `${w}%`, height: 1, background: `linear-gradient(90deg, transparent, ${color}, transparent)`, margin: "12px auto 0" }} />;
}

function SourceTag({ text, delay = 40 }: { text: string; delay?: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame - delay, [0, 12], [0, 0.45], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", bottom: 24, right: 36, fontSize: 12, color: C.textDim, opacity: o, letterSpacing: 1.5, fontFamily: "monospace" }}>{text}</div>;
}

function SectionHeader({ text, color = C.accent, delay = 0 }: { text: string; color?: string; delay?: number }) {
  return (
    <FadeSlideIn delay={delay}>
      <div style={{ fontSize: 13, color, letterSpacing: 7, textTransform: "uppercase", fontWeight: 500, marginBottom: 24 }}>
        {text}
      </div>
    </FadeSlideIn>
  );
}

// --- Ken Burns ---

function KenBurns({ src, zoomEnd = 1.12, panX = 15, panY = -8 }: {
  src: string; zoomEnd?: number; panX?: number; panY?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const zoom = spring({ frame, fps, from: 1, to: zoomEnd, config: { stiffness: 25, damping: 20 } })
    + noise2D("kz", frame * 0.1, 0) * 0.004;
  const x = spring({ frame: Math.max(0, frame - 12), fps, from: 0, to: panX, config: { stiffness: 22, damping: 22 } })
    + noise2D("kx", frame * 0.07, 0) * 0.8;
  const y = interpolate(frame, [0, 400], [0, panY], { extrapolateRight: "clamp" })
    + noise2D("ky", frame * 0.06, 0) * 0.6;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom}) translate(${x}px, ${y}px)`, transformOrigin: "center" }} />
    </AbsoluteFill>
  );
}

// --- Scenes ---

function HeroScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const hasMap = __HAS_SCREENSHOTS__;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {hasMap && (
        <AbsoluteFill style={{ opacity: 0.35 }}>
          <KenBurns src={staticFile("video-screenshots/map-global.png")} zoomEnd={1.08} panX={10} panY={-5} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <FadeSlideIn>
          <div style={{ fontSize: 14, color: C.accent, letterSpacing: 10, textTransform: "uppercase", fontWeight: 400, fontFamily: "monospace" }}>GAWK · DAILY BRIEF</div>
        </FadeSlideIn>
        <FadeSlideIn delay={8}><GlowLine /></FadeSlideIn>
        <FadeSlideIn delay={14}>
          <div style={{ fontSize: 48, fontWeight: 700, color: C.text, textAlign: "center", lineHeight: 1.2, marginTop: 24 }}>
            AI Ecosystem Intelligence
          </div>
        </FadeSlideIn>
        <FadeSlideIn delay={22}>
          <div style={{ fontSize: 26, color: C.textMuted, marginTop: 10, fontFamily: "monospace" }}>{formatDate(d.date)}</div>
        </FadeSlideIn>
        <FadeSlideIn delay={34}>
          <div style={{ display: "flex", gap: 56, marginTop: 48 }}>
            <CountStat label="SOURCES" value={d.ecosystemStats.sources} delay={36} />
            <CountStat label="CRONS" value={d.ecosystemStats.crons} delay={40} />
            <CountStat label="AI LABS" value={d.ecosystemStats.labs} delay={44} />
          </div>
        </FadeSlideIn>
      </AbsoluteFill>
      <SourceTag text="gawk.dev" delay={50} />
    </SceneWrap>
  );
}

function CountStat({ label, value, delay }: { label: string; value: number; delay: number }) {
  const c = useCountUp(value, 22, delay);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 38, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>{c}</div>
      <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 3 }}>{label}</div>
    </div>
  );
}

function MapScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const hasMap = __HAS_SCREENSHOTS__;
  if (!hasMap && !d.topRegion) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="Awaiting regional data" /></SceneWrap>;

  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {hasMap ? (
        <>
          <KenBurns src={staticFile("video-screenshots/map-global.png")} zoomEnd={1.25} panX={30} panY={-15} />
          <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(8,12,20,0.9) 0%, transparent 40%, transparent 70%, rgba(8,12,20,0.7) 100%)" }} />
        </>
      ) : (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 30% 50%, rgba(20,184,166,0.06) 0%, ${C.bg} 60%)` }} />
      )}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "0 60px 60px" }}>
        <SectionHeader text="GLOBAL ACTIVITY · 24H" delay={6} />
        {d.topRegion && (
          <FadeSlideIn delay={14}>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <div style={{ background: C.bgCard, backdropFilter: "blur(12px)", border: `1px solid ${C.borderAccent}`, borderRadius: 14, padding: "22px 32px", display: "flex", alignItems: "baseline", gap: 16 }}>
                <div style={{ fontSize: 42, fontWeight: 700, color: C.text }}>{d.topRegion.country}</div>
                <div style={{ fontSize: 32, fontWeight: 600, color: C.green }}>↑{Math.round(d.topRegion.deltaPct)}%</div>
              </div>
              {d.mostActiveCity && (
                <div style={{ background: C.bgCard, backdropFilter: "blur(12px)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 24px" }}>
                  <div style={{ fontSize: 12, color: C.textDim, letterSpacing: 2, textTransform: "uppercase" }}>MOST ACTIVE</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: C.text, marginTop: 4 }}>{d.mostActiveCity.city} · {d.mostActiveCity.count}</div>
                </div>
              )}
            </div>
          </FadeSlideIn>
        )}
      </AbsoluteFill>
      <SourceTag text="SRC: GITHUB EVENTS API" />
    </SceneWrap>
  );
}

function ToolsScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const allOk = d.toolHealth.degraded === 0;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="TOOL HEALTH STATUS" />
        <FadeSlideIn delay={6}>
          <div style={{ fontSize: 56, fontWeight: 700, color: allOk ? C.green : C.amber, fontFamily: "monospace", marginBottom: 32 }}>
            {d.toolHealth.operational}/{d.toolHealth.total}
            <span style={{ fontSize: 20, color: C.textMuted, marginLeft: 12, fontWeight: 400 }}>OPERATIONAL</span>
          </div>
        </FadeSlideIn>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {d.toolHealth.tools.map((t, i) => {
            const ok = t.status === "operational";
            return (
              <FadeSlideIn key={t.name} delay={14 + i * 6} direction="left">
                <div style={{
                  background: C.bgCard, border: `1px solid ${ok ? C.border : C.red}`,
                  borderLeft: `3px solid ${ok ? C.green : C.red}`,
                  borderRadius: 10, padding: "16px 22px", minWidth: 180,
                }}>
                  <div style={{ fontSize: 10, color: ok ? C.green : C.red, fontWeight: 600, textTransform: "uppercase", letterSpacing: 2, fontFamily: "monospace" }}>
                    ● {t.status}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: C.text, marginTop: 4 }}>{t.name}</div>
                </div>
              </FadeSlideIn>
            );
          })}
        </div>
      </AbsoluteFill>
      <SourceTag text="SRC: ANTHROPIC · OPENAI · GITHUB STATUS" />
    </SceneWrap>
  );
}

function ModelsScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="MODEL RANKINGS · OPENROUTER" />
        {d.topModels.map((m, i) => {
          const isTop = i === 0;
          return (
            <FadeSlideIn key={m.name} delay={8 + i * 8} direction="left">
              <div style={{
                display: "flex", alignItems: "center", gap: 16,
                background: isTop ? "rgba(20,184,166,0.06)" : C.bgCard,
                border: `1px solid ${isTop ? C.borderAccent : C.border}`,
                borderRadius: 10, padding: "16px 24px", marginBottom: 8,
              }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: isTop ? C.accent : C.textDim, width: 44, textAlign: "center", fontFamily: "monospace" }}>
                  {m.rank}
                </div>
                <div style={{ width: 2, height: 28, background: isTop ? C.accent : C.border, borderRadius: 1 }} />
                <div style={{ flex: 1, fontSize: 20, fontWeight: 600, color: C.text }}>{m.name}</div>
                <ModelDelta current={m.rank} previous={m.previousRank} />
              </div>
            </FadeSlideIn>
          );
        })}
      </AbsoluteFill>
      <SourceTag text={`SRC: OPENROUTER${d.modelsFetchedAt ? " · " + new Date(d.modelsFetchedAt).toISOString().slice(0, 16) + "Z" : ""}`} />
    </SceneWrap>
  );
}

function ModelDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return <div style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: "rgba(20,184,166,0.15)", borderRadius: 4, padding: "2px 8px", fontFamily: "monospace" }}>NEW</div>;
  const delta = previous - current;
  if (delta === 0) return <div style={{ fontSize: 16, color: C.textDim, fontFamily: "monospace" }}>—</div>;
  return <div style={{ fontSize: 18, fontWeight: 700, color: delta > 0 ? C.green : C.red, fontFamily: "monospace" }}>{delta > 0 ? "↑" : "↓"}{Math.abs(delta)}</div>;
}

function SdkScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  if (d.sdkMovers.length === 0) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No SDK data" /></SceneWrap>;
  const maxAbs = Math.max(...d.sdkMovers.map((s) => Math.abs(s.diffPct)), 1);
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="SDK ADOPTION · TOP MOVERS" color={C.blue} />
        {d.sdkMovers.map((s, i) => {
          const isUp = s.diffPct > 0;
          const barPct = (Math.abs(s.diffPct) / maxAbs) * 100;
          return (
            <FadeSlideIn key={s.name} delay={8 + i * 10} direction="left">
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{s.name}</span>
                    <span style={{ fontSize: 13, color: C.textDim, marginLeft: 10 }}>{s.registry}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: isUp ? C.green : C.red, fontFamily: "monospace" }}>
                    {isUp ? "+" : ""}{s.diffPct}%
                  </div>
                </div>
                <AnimatedBar pct={barPct} delay={12 + i * 10} color={isUp ? C.green : C.red} />
              </div>
            </FadeSlideIn>
          );
        })}
      </AbsoluteFill>
      <SourceTag text="SRC: PYPI · NPM · CRATES.IO · DOCKER HUB" />
    </SceneWrap>
  );
}

function AnimatedBar({ pct, delay, color }: { pct: number; delay: number; color: string }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 25], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(30,41,59,0.4)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: 3, boxShadow: `0 0 8px ${color}44` }} />
    </div>
  );
}

function AgentsScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  if (d.topAgents.length === 0) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No agent data" /></SceneWrap>;
  const maxDl = d.topAgents[0]?.weeklyDownloads ?? 1;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="AGENT FRAMEWORKS · WEEKLY" color={C.purple} />
        {d.topAgents.map((a, i) => {
          const barPct = (a.weeklyDownloads / maxDl) * 100;
          return (
            <FadeSlideIn key={a.name} delay={8 + i * 10} direction="left">
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: C.textDim, fontFamily: "monospace" }}>{i + 1}</span>
                    <span style={{ fontSize: 22, fontWeight: 600, color: C.text }}>{a.name}</span>
                  </div>
                  <div style={{ fontSize: 20, color: C.textMuted, fontFamily: "monospace" }}>{fmtNum(a.weeklyDownloads)}/wk</div>
                </div>
                <AnimatedBar pct={barPct} delay={12 + i * 10} color={C.purple} />
              </div>
            </FadeSlideIn>
          );
        })}
      </AbsoluteFill>
      <SourceTag text="SRC: PYPI · NPM WEEKLY DOWNLOADS" />
    </SceneWrap>
  );
}

function LabsScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  if (d.topLabs.length === 0) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No lab data" /></SceneWrap>;
  const maxEv = d.topLabs[0]?.eventCount ?? 1;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="AI LAB ACTIVITY · 24H" color={C.pink} />
        {d.topLabs.map((l, i) => {
          const barPct = (l.eventCount / maxEv) * 100;
          const count = useCountUp(l.eventCount, 28, 14 + i * 8);
          return (
            <FadeSlideIn key={l.name} delay={8 + i * 10} direction="left">
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 600, color: C.text }}>{l.name}</span>
                  <div style={{ fontFamily: "monospace" }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: C.accent }}>{count}</span>
                    <span style={{ fontSize: 14, color: C.textDim, marginLeft: 6 }}>events</span>
                    <span style={{ fontSize: 14, color: C.textDim, marginLeft: 12 }}>{l.repoCount} repos</span>
                  </div>
                </div>
                <AnimatedBar pct={barPct} delay={14 + i * 10} color={i === 0 ? C.accent : C.blue} />
              </div>
            </FadeSlideIn>
          );
        })}
      </AbsoluteFill>
      <SourceTag text="SRC: GITHUB EVENTS API" />
    </SceneWrap>
  );
}

function ReposScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  if (d.topRepos.length === 0) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No repo data" /></SceneWrap>;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="TOP REPOS · 24H" color={C.cyan} />
        {d.topRepos.map((r, i) => (
          <FadeSlideIn key={`${r.owner}/${r.name}`} delay={8 + i * 10} direction="left">
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              background: C.bgCard, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: "16px 24px", marginBottom: 10,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.textDim, width: 32, fontFamily: "monospace" }}>{i + 1}</div>
              <div style={{ width: 2, height: 24, background: C.border, borderRadius: 1 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.text }}>{r.owner}<span style={{ color: C.textDim }}>/</span>{r.name}</div>
              </div>
              <div style={{ fontSize: 18, color: C.accent, fontWeight: 600, fontFamily: "monospace" }}>{r.eventCount} events</div>
            </div>
          </FadeSlideIn>
        ))}
      </AbsoluteFill>
      <SourceTag text="SRC: GITHUB EVENTS API" />
    </SceneWrap>
  );
}

function HNScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  if (!d.hnTopStory) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No significant HN activity" /></SceneWrap>;
  const pts = useCountUp(d.hnTopStory.points, 28, 16);
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <SectionHeader text="TOP ON HACKER NEWS" color={C.orange} />
        <ScaleIn delay={8}>
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.orange}`,
            borderRadius: 14, padding: "36px 44px", maxWidth: 1000, textAlign: "center",
          }}>
            <div style={{ fontSize: 32, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d.hnTopStory.title}</div>
            <div style={{ fontSize: 28, color: C.orange, marginTop: 16, fontWeight: 700, fontFamily: "monospace" }}>{pts} pts</div>
          </div>
        </ScaleIn>
      </AbsoluteFill>
      <SourceTag text="SRC: HACKER NEWS · ALGOLIA API" />
    </SceneWrap>
  );
}

function OutroScene({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const hasMap = __HAS_SCREENSHOTS__;
  const pulse = interpolate(Math.sin(frame / 8), [-1, 1], [0.97, 1.03]);
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {hasMap && (
        <AbsoluteFill style={{ opacity: 0.15 }}>
          <KenBurns src={staticFile("video-screenshots/map-zoom.png")} zoomEnd={1.06} panX={-8} panY={4} />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <ScaleIn>
          <div style={{ fontSize: 64, fontWeight: 700, color: C.accent, transform: `scale(${pulse})`, fontFamily: "monospace" }}>gawk.dev</div>
        </ScaleIn>
        <FadeSlideIn delay={12}>
          <div style={{ fontSize: 22, color: C.textMuted, marginTop: 16 }}>Real-time AI ecosystem intelligence</div>
        </FadeSlideIn>
        <FadeSlideIn delay={24}>
          <GlowLine delay={24} />
        </FadeSlideIn>
        <FadeSlideIn delay={30}>
          <div style={{
            marginTop: 28, background: `linear-gradient(135deg, ${C.accent}, #0d9488)`, color: "#fff",
            fontSize: 16, fontWeight: 600, padding: "12px 36px", borderRadius: 8,
            boxShadow: `0 0 24px ${C.accentGlow}`, letterSpacing: 1,
          }}>
            SUBSCRIBE → DAILY DIGEST
          </div>
        </FadeSlideIn>
      </AbsoluteFill>
      <SourceTag text="gawk.dev/subscribe" delay={30} />
    </SceneWrap>
  );
}

function EmptyScene({ text }: { text: string }) {
  return <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
    <div style={{ fontSize: 24, color: C.textDim }}>{text}</div>
  </AbsoluteFill>;
}

// --- Main ---

export const DailyBrief: React.FC = () => {
  const data = __VIDEO_DATA__;
  let offset = 0;
  const seqs: { id: string; from: number; dur: number }[] = [];
  for (const sc of data.scenes) {
    const dur = sc.durationInSeconds * FPS;
    seqs.push({ id: sc.id, from: offset, dur });
    offset += dur;
  }

  const components: Record<string, React.FC<{ durationInFrames: number }>> = {
    hero: HeroScene, region: MapScene, tools: ToolsScene, models: ModelsScene,
    sdk: SdkScene, agents: AgentsScene, labs: LabsScene, repos: ReposScene,
    feed: FeedScene, hn: HNScene, outro: OutroScene,
  };

  return (
    <AbsoluteFill style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif", background: C.bg }}>
      {seqs.map((s) => {
        const Comp = components[s.id];
        if (!Comp) return null;
        return <Sequence key={s.id} from={s.from} durationInFrames={s.dur}><Comp durationInFrames={s.dur} /></Sequence>;
      })}
      {__HAS_AUDIO__ && <Audio src={staticFile("video-narration.mp3")} />}
    </AbsoluteFill>
  );
};

function FeedScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const cards = d.topCards.slice(0, 3);
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", padding: "56px 72px" }}>
        <SectionHeader text="TOP SIGNALS" />
        {cards.map((c, i) => (
          <FadeSlideIn key={c.headline} delay={8 + i * 12} direction="left">
            <div style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cardColor(c.type)}`,
              borderRadius: 10, padding: "18px 24px", marginBottom: 10,
              display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{c.headline}</div>
                {c.detail && <div style={{ fontSize: 14, color: C.textMuted, marginTop: 3 }}>{c.detail}</div>}
              </div>
              <div style={{ background: cardColor(c.type), borderRadius: 4, padding: "3px 8px", fontSize: 9, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                {c.type.replace(/_/g, " ")}
              </div>
            </div>
          </FadeSlideIn>
        ))}
      </AbsoluteFill>
      <SourceTag text="SRC: GAWK FEED · RANKED BY SEVERITY" />
    </SceneWrap>
  );
}

function cardColor(t: string): string {
  const m: Record<string, string> = { TOOL_ALERT: C.red, MODEL_MOVER: C.purple, NEW_RELEASE: C.green, SDK_TREND: C.blue, NEWS: C.amber, RESEARCH: C.cyan, LAB_HIGHLIGHT: C.pink };
  return m[t] ?? C.accent;
}
function fmtNum(n: number): string { return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n); }
function formatDate(iso: string): string { const d = new Date(iso + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); }
