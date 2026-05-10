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
import type { VideoData } from "./types";

declare const __VIDEO_DATA__: VideoData;
declare const __HAS_AUDIO__: boolean;
declare const __HAS_SCREENSHOTS__: boolean;
declare const __HAS_MAP_VIDEO__: boolean;

const FPS = 30;
const CROSSFADE_FRAMES = 12;

const C = {
  bg: "#080c14",
  accent: "#14b8a6",
  accentGlow: "rgba(20, 184, 166, 0.2)",
  text: "#f1f5f9",
  textMuted: "#94a3b8",
  textDim: "#475569",
  gridLine: "rgba(20, 184, 166, 0.04)",
};

// --- Minimal helpers ---

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
        backgroundSize: "60px 60px", opacity: 0.8,
      }} />
      <div style={{
        position: "absolute", left: 0, right: 0, top: `${scanY}%`, height: 2,
        background: `linear-gradient(90deg, transparent, rgba(20,184,166,0.08), transparent)`,
      }} />
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)",
      }} />
    </AbsoluteFill>
  );
}

function SceneWrap({ children, durationInFrames }: { children: React.ReactNode; durationInFrames: number }) {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - CROSSFADE_FRAMES, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ background: C.bg }} />
      {children}
    </AbsoluteFill>
  );
}

function FadeSlideIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 18], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>{children}</div>;
}

function ScaleIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, stiffness: 100 } });
  const o = interpolate(frame - delay, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ transform: `scale(${s})`, opacity: o }}>{children}</div>;
}

function GlowLine({ delay = 0 }: { delay?: number }) {
  const frame = useCurrentFrame();
  const w = interpolate(frame - delay, [0, 30], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ width: `${w}%`, height: 1, background: `linear-gradient(90deg, transparent, ${C.accent}, transparent)`, margin: "12px auto 0" }} />;
}

function useCountUp(target: number, dur = 35, delay = 0): number {
  const frame = useCurrentFrame();
  return Math.round(interpolate(frame - delay, [0, dur], [0, target], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic),
  }));
}

// ===================== SCENES =====================

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
            {[
              { label: "SOURCES", value: d.ecosystemStats.sources, d: 36 },
              { label: "CRONS", value: d.ecosystemStats.crons, d: 40 },
              { label: "AI LABS", value: d.ecosystemStats.labs, d: 44 },
            ].map((s) => {
              const c = useCountUp(s.value, 22, s.d);
              return (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 38, fontWeight: 700, color: C.accent, fontFamily: "monospace" }}>{c}</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 4, letterSpacing: 3 }}>{s.label}</div>
                </div>
              );
            })}
          </div>
        </FadeSlideIn>
      </AbsoluteFill>
      <div style={{ position: "absolute", bottom: 24, right: 36, fontSize: 12, color: C.textDim, opacity: 0.45, letterSpacing: 1.5, fontFamily: "monospace" }}>gawk.dev</div>
    </SceneWrap>
  );
}

function WalkthroughScene({ durationInFrames }: { durationInFrames: number }) {
  const hasVideo = __HAS_MAP_VIDEO__;
  if (hasVideo) {
    return (
      <AbsoluteFill>
        <Video src={staticFile("video-map-walkthrough.webm")} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: 24, color: C.textDim }}>Walkthrough recording not available</div>
    </AbsoluteFill>
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
    </SceneWrap>
  );
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
    walkthrough: WalkthroughScene,
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

function formatDate(iso: string): string { const d = new Date(iso + "T00:00:00Z"); return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }); }
