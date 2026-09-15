/**
 * .github/workflows/heartbeat.yml is a bash loop that ticks the live ingests
 * every 5 minutes and, since PR #146, dispatches its own successor five
 * minutes before its window ends. Nothing else exercises that script: the
 * only live proof was a 2-minute branch chain, and the scheduled trigger
 * path (no inputs → loop_minutes empty) was never run. This test runs the
 * real `run:` block under bash with `curl`, `gh` and `sleep` stubbed and the
 * clock (`SECONDS`) advanced by the stubbed sleep, so a 175-minute window
 * simulates in milliseconds.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github/workflows/heartbeat.yml"),
  "utf8",
);

/** The `run: |` block of the single step, dedented. Fails loudly if the
 * workflow's shape changes so the test cannot silently run nothing. */
function extractRunBlock(): string {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => /^\s+run: \|\s*$/.test(l));
  if (start < 0) throw new Error("heartbeat.yml: no `run: |` block found");
  const indent = lines[start].search(/\S/) + 2;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    if (line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  if (body.length < 20) throw new Error("heartbeat.yml: run block too short");
  return body.join("\n");
}

type Sim = {
  status: number;
  /** minute-of-run at which each `gh workflow run` happened, with its args */
  dispatches: { minute: number; args: string }[];
  /** minute-of-run of every globe-ingest tick */
  ticks: number[];
  stdout: string;
};

function simulate(env: Record<string, string | undefined>, ghExit = 0): Sim {
  const dir = mkdtempSync(join(tmpdir(), "heartbeat-sim-"));
  const script = join(dir, "hb.sh");
  const ghLog = join(dir, "gh.log");
  const tickLog = join(dir, "tick.log");
  writeFileSync(script, extractRunBlock());
  const harness = `
    curl() {
      case "$*" in *"/api/ingest"*) echo "$((SECONDS/60))" >> "$TICK_LOG" ;; esac
      echo 200
    }
    gh() { echo "$((SECONDS/60)) $*" >> "$GH_LOG"; return ${ghExit}; }
    sleep() { SECONDS=$((SECONDS + $1)); }
    SECONDS=0
    source "${script}"
  `;
  const simEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    INGEST_URL: "https://example.test/api/ingest",
    INGEST_SECRET: "s",
    GITHUB_REF_NAME: "main",
    GH_LOG: ghLog,
    TICK_LOG: tickLog,
    ...env,
  };
  let status = 0;
  let stdout = "";
  try {
    stdout = execFileSync("bash", ["-c", harness], {
      env: simEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { status: number; stdout: string };
    status = err.status;
    stdout = err.stdout ?? "";
  }
  const read = (p: string) => {
    try {
      return readFileSync(p, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      return [];
    }
  };
  return {
    status,
    stdout,
    dispatches: read(ghLog).map((l) => {
      const [m, ...rest] = l.split(" ");
      return { minute: Number(m), args: rest.join(" ") };
    }),
    ticks: read(tickLog).map(Number),
  };
}

describe("heartbeat.yml hands over to its successor", () => {
  it("declares the chain's preconditions in the workflow file", () => {
    expect(WORKFLOW).toMatch(/cancel-in-progress:\s*false/);
    expect(WORKFLOW).toMatch(/actions:\s*write/);
    expect(WORKFLOW).toMatch(/inputs\.loop_minutes \|\| '175'/);
  });

  it("175-min window: ticks every 5 min to the end, dispatches once at minute 170", () => {
    const sim = simulate({ LOOP_MINUTES: "175" });
    expect(sim.status).toBe(0);
    expect(sim.ticks).toEqual(Array.from({ length: 36 }, (_, i) => i * 5));
    expect(sim.dispatches).toHaveLength(1);
    expect(sim.dispatches[0].minute).toBe(170);
    expect(sim.dispatches[0].args).toBe(
      "workflow run heartbeat.yml --ref main -f loop_minutes=175",
    );
    expect(sim.stdout).toContain("successor carries coverage");
  });

  it("scheduled path: no loop_minutes at all still chains at 175", () => {
    const sim = simulate({ LOOP_MINUTES: undefined });
    expect(sim.status).toBe(0);
    expect(sim.ticks).toHaveLength(36);
    expect(sim.dispatches.map((d) => d.args)).toEqual([
      "workflow run heartbeat.yml --ref main -f loop_minutes=175",
    ]);
  });

  it("empty-string loop_minutes (an unset expression) also defaults to 175", () => {
    const sim = simulate({ LOOP_MINUTES: "" });
    expect(sim.status).toBe(0);
    expect(sim.dispatches[0]?.args).toContain("loop_minutes=175");
  });

  it("2-min test window: dispatches immediately and passes 2 down the chain", () => {
    const sim = simulate({ LOOP_MINUTES: "2" });
    expect(sim.status).toBe(0);
    expect(sim.dispatches).toEqual([
      { minute: 0, args: "workflow run heartbeat.yml --ref main -f loop_minutes=2" },
    ]);
    expect(sim.ticks).toEqual([0, 5]);
  });

  it("a failed dispatch finishes the tick window first, then exits 1", () => {
    const sim = simulate({ LOOP_MINUTES: "175" }, 1);
    expect(sim.status).toBe(1);
    expect(sim.ticks).toHaveLength(36); // coverage before reporting
    expect(sim.dispatches).toHaveLength(1); // no retry storm
    expect(sim.stdout).toContain("NO successor");
  });

  it("rejects a non-numeric loop_minutes before ticking anything", () => {
    const sim = simulate({ LOOP_MINUTES: "abc" });
    expect(sim.status).toBe(1);
    expect(sim.ticks).toHaveLength(0);
    expect(sim.dispatches).toHaveLength(0);
  });
});
