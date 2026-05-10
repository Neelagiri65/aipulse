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
  Video,
} from "remotion";
import { noise2D } from "@remotion/noise";
import type { VideoData, ModelEntry } from "./types";

declare const __VIDEO_DATA__: VideoData;
declare const __HAS_AUDIO__: boolean;
declare const __HAS_SCREENSHOTS__: boolean;
declare const __HAS_MAP_VIDEO__: boolean;

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
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(${C.gridLine} 1px, transparent 1px),
          linear-gradient(90deg, ${C.gridLine} 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
        opacity: 0.8,
      }} />
      <div style={{
        position: "absolute", left: 0, right: 0,
        top: `${scanY}%`, height: 2,
        background: `linear-gradient(90deg, transparent, rgba(20,184,166,0.08), transparent)`,
      }} />
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

function AnimatedBar({ pct, delay, color }: { pct: number; delay: number; color: string }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 25], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ width: "100%", height: 6, background: "rgba(30,41,59,0.4)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${w}%`, height: "100%", background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: 3, boxShadow: `0 0 8px ${color}44` }} />
    </div>
  );
}

// ===================== SCENES =====================

// --- Scene 1: Title card (8s) ---

function HeroScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const hasMap = __HAS_SCREENSHOTS__;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {hasMap && (
        <AbsoluteFill style={{ opacity: 0.25 }}>
          <Img src={staticFile("video-screenshots/map-global.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

// --- Scene 2: Map walkthrough (Playwright video embed, ~27s) ---

function MapWalkthroughScene({ durationInFrames }: { durationInFrames: number }) {
  const hasVideo = __HAS_MAP_VIDEO__;
  const hasMap = __HAS_SCREENSHOTS__;

  if (hasVideo) {
    return (
      <AbsoluteFill>
        <Video src={staticFile("video-map-walkthrough.webm")} />
      </AbsoluteFill>
    );
  }

  // Fallback: static map screenshot if no recording
  if (hasMap) {
    return (
      <SceneWrap durationInFrames={durationInFrames}>
        <Img src={staticFile("video-screenshots/map-global.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(8,12,20,0.8) 0%, transparent 30%)" }} />
        <AbsoluteFill style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 60 }}>
          <FadeSlideIn delay={4}>
            <div style={{ fontSize: 20, color: C.textMuted, fontFamily: "monospace" }}>
              Live map walkthrough · gawk.dev
            </div>
          </FadeSlideIn>
        </AbsoluteFill>
      </SceneWrap>
    );
  }

  return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="Map recording not available" /></SceneWrap>;
}

// --- Scene 3: Top Signals (15s) ---

function SignalsScene({ durationInFrames }: { durationInFrames: number }) {
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
      <SourceTag text="SRC: GAWK FEED · RANKED BY IMPACT" />
    </SceneWrap>
  );
}

// --- Scene 4: Model Leaderboard (15s) ---

function ModelsScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      <AbsoluteFill style={{ display: "flex", flexDirection: "row", padding: "48px 60px", gap: 40 }}>
        {/* Left: Top 5 rankings with pricing */}
        <div style={{ flex: 1 }}>
          <SectionHeader text="MODEL RANKINGS · OPENROUTER" />
          {d.topModels.map((m, i) => {
            const isTop = i === 0;
            return (
              <FadeSlideIn key={m.name} delay={6 + i * 6} direction="left">
                <div style={{
                  display: "flex", alignItems: "center", gap: 14,
                  background: isTop ? "rgba(20,184,166,0.06)" : C.bgCard,
                  border: `1px solid ${isTop ? C.borderAccent : C.border}`,
                  borderRadius: 10, padding: "12px 20px", marginBottom: 6,
                }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: isTop ? C.accent : C.textDim, width: 36, textAlign: "center", fontFamily: "monospace" }}>
                    {m.rank}
                  </div>
                  <div style={{ width: 2, height: 24, background: isTop ? C.accent : C.border, borderRadius: 1 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, color: C.text }}>{m.shortName}</div>
                    {m.promptPrice !== null && (
                      <div style={{ fontSize: 11, color: C.textDim, fontFamily: "monospace", marginTop: 2 }}>
                        ${m.promptPrice}/M in · ${m.completionPrice}/M out
                      </div>
                    )}
                  </div>
                  <ModelDelta current={m.rank} previous={m.previousRank} />
                </div>
              </FadeSlideIn>
            );
          })}
        </div>

        {/* Right: Biggest movers */}
        {d.biggestMovers.length > 0 && (
          <div style={{ width: 420 }}>
            <SectionHeader text="BIGGEST MOVERS" color={C.amber} delay={10} />
            {d.biggestMovers.map((m, i) => {
              const delta = (m.previousRank ?? m.rank) - m.rank;
              const isUp = delta > 0;
              return (
                <FadeSlideIn key={m.name} delay={16 + i * 8} direction="left">
                  <div style={{
                    background: C.bgCard, border: `1px solid ${isUp ? C.green : C.red}30`,
                    borderLeft: `3px solid ${isUp ? C.green : C.red}`,
                    borderRadius: 10, padding: "14px 20px", marginBottom: 8,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{m.shortName}</div>
                        <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
                          #{m.previousRank} → #{m.rank}
                        </div>
                      </div>
                      <div style={{
                        fontSize: 28, fontWeight: 700, color: isUp ? C.green : C.red, fontFamily: "monospace",
                      }}>
                        {isUp ? "↑" : "↓"}{Math.abs(delta)}
                      </div>
                    </div>
                  </div>
                </FadeSlideIn>
              );
            })}
          </div>
        )}
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

// --- Scene 5: HN + Regional Wire (15s) ---

function HnWireScene({ durationInFrames }: { durationInFrames: number }) {
  const d = __VIDEO_DATA__;
  const hasMap = __HAS_SCREENSHOTS__;

  if (!d.hnTopStory) return <SceneWrap durationInFrames={durationInFrames}><EmptyScene text="No significant HN activity" /></SceneWrap>;

  const pts = useCountUp(d.hnTopStory.points, 28, 16);

  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {/* Map background */}
      {hasMap && (
        <AbsoluteFill style={{ opacity: 0.15 }}>
          <Img src={staticFile("video-screenshots/map-global.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <SectionHeader text="HACKER NEWS + WIRE" color={C.orange} />

        {/* HN story */}
        <ScaleIn delay={8}>
          <div style={{
            background: C.bgCard, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.orange}`,
            borderRadius: 14, padding: "32px 40px", maxWidth: 900, textAlign: "center", marginBottom: 24,
          }}>
            <div style={{ fontSize: 28, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d.hnTopStory.title}</div>
            <div style={{ fontSize: 24, color: C.orange, marginTop: 12, fontWeight: 700, fontFamily: "monospace" }}>{pts} pts</div>
          </div>
        </ScaleIn>

        {/* Regional wire highlights */}
        {d.topCards.filter(c => c.type === "NEWS" || c.type === "RESEARCH").slice(0, 2).map((c, i) => (
          <FadeSlideIn key={c.headline} delay={28 + i * 10} direction="left">
            <div style={{
              background: C.bgCard, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cardColor(c.type)}`,
              borderRadius: 8, padding: "12px 20px", maxWidth: 900, width: "100%", marginBottom: 6,
            }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: C.text }}>{c.headline}</div>
              {c.detail && <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{c.detail}</div>}
            </div>
          </FadeSlideIn>
        ))}
      </AbsoluteFill>
      <SourceTag text="SRC: HACKER NEWS · REGIONAL WIRE" />
    </SceneWrap>
  );
}

// --- Scene 6: Outro CTA (10s) ---

function OutroScene({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const hasMap = __HAS_SCREENSHOTS__;
  const pulse = interpolate(Math.sin(frame / 8), [-1, 1], [0.97, 1.03]);
  return (
    <SceneWrap durationInFrames={durationInFrames}>
      {hasMap && (
        <AbsoluteFill style={{ opacity: 0.15 }}>
          <Img src={staticFile("video-screenshots/map-global.png")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
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

// --- Main Composition ---

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
    hero: HeroScene,
    "map-walkthrough": MapWalkthroughScene,
    signals: SignalsScene,
    models: ModelsScene,
    "hn-wire": HnWireScene,
    outro: OutroScene,
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

function cardColor(t: string): string {
  const m: Record<string, string> = { TOOL_ALERT: C.red, MODEL_MOVER: C.purple, NEW_RELEASE: C.green, SDK_TREND: C.blue, NEWS: C.amber, RESEARCH: C.cyan, LAB_HIGHLIGHT: C.pink };
  return m[t] ?? C.accent;
}
function formatDate(iso: string): string { const d = new Date(iso + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); }
