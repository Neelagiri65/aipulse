# Brand video stings

Optional cinematic intro/outro for the daily video. `composite.ts` looks
for these exact files and concatenates them around the day's video when
present; **absence is the supported default** (plain video, byte-identical
to the pre-sting pipeline). A sting concat failure is fail-open — the
plain video ships.

Expected files (all four optional, per-format):

- `intro-sting-landscape.mp4` / `outro-sting-landscape.mp4` — 1920×1080
- `intro-sting-vertical.mp4` / `outro-sting-vertical.mp4` — 1080×1920

Contract for generated assets (enforced at generation time, not runtime):
~3s duration, h264, 30fps, **silent AAC track baked in** (ffmpeg
`anullsrc`), `+faststart`. Provenance: generated once via the founder's
Higgsfield account (Option A, `docs/research-higgsfield-video-2026-07-05.md`
in the vault) — no runtime dependency on any generation API, ever.
