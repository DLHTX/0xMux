import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screenInfo } from "./screen.js";

interface ScreenshotOpts {
  /** Capture a specific region {x, y, width, height} in logical coordinates */
  region?: { x: number; y: number; width: number; height: number };
  /** Capture a specific window by ID */
  windowId?: number;
}

/** Take a screenshot and return base64 PNG */
export async function screenshot(opts: ScreenshotOpts = {}): Promise<string> {
  const tmpPath = join(tmpdir(), `0xmux-screenshot-${Date.now()}.png`);

  const args: string[] = ["-x"]; // no sound

  if (opts.windowId !== undefined) {
    args.push("-l", String(opts.windowId));
  } else if (opts.region) {
    const { x, y, width, height } = opts.region;
    args.push("-R", `${x},${y},${width},${height}`);
  }

  args.push(tmpPath);

  await new Promise<void>((resolve, reject) => {
    execFile("screencapture", args, { timeout: 10_000 }, (err: Error | null) => {
      if (err) {
        reject(new Error(`screencapture failed: ${err.message}`));
        return;
      }
      resolve();
    });
  });

  // Resize to logical resolution so image coordinates match CGEvent logical coordinates
  const info = await screenInfo();
  const scale = info.screens[0]?.scaleFactor ?? 1;
  if (scale > 1) {
    const logicalWidth = info.screens[0].width;
    await new Promise<void>((resolve, reject) => {
      execFile("sips", ["--resampleWidth", String(logicalWidth), tmpPath], { timeout: 10_000 }, (err: Error | null) => {
        if (err) {
          reject(new Error(`sips resize failed: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  const buf = await readFile(tmpPath);
  await unlink(tmpPath).catch(() => {});

  return buf.toString("base64");
}
