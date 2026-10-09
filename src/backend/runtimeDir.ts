import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

// Root for runtime-writable state — game saves and the auth DB. Kept separate
// from the static game content under src/Data (leagues, squads, logos, kits)
// so production can mount it on a persistent volume: set RUNTIME_DATA_DIR to the
// volume path and saves/DB survive redeploys while content still ships in the
// image. Defaults to src/Data so local dev is unchanged.
//
// On serverless/container platforms (Vercel, read-only root FS) the configured
// directory may not be writable — probing it and falling back to the OS temp
// dir keeps boot from crashing (saves then live for the instance lifetime).
function pickRuntimeDir(): string {
  const candidates = [
    process.env.RUNTIME_DATA_DIR?.trim(),
    new URL("../Data", import.meta.url).pathname,
    path.join(tmpdir(), "touchlines-data"),
  ].filter((dir): dir is string => !!dir);

  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, ".write-probe");
      writeFileSync(probe, "ok");
      rmSync(probe, { force: true });
      return dir;
    } catch {
      // Not writable — try the next candidate.
    }
  }
  return path.join(tmpdir(), "touchlines-data");
}

export const RUNTIME_DATA_DIR = pickRuntimeDir();

