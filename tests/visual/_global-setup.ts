import fs from "node:fs/promises";
import path from "node:path";

/**
 * Wipe the screenshot folder before the suite runs so manual review
 * always sees a clean, deterministic trail of this run only. Skipped
 * safely if the directory doesn't exist yet (first-time checkout).
 */
export default async function globalSetup() {
  const dir = path.join(process.cwd(), "test-results", "screenshots");
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore — fresh checkout / permission variance.
  }
  await fs.mkdir(dir, { recursive: true });
}
