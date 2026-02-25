import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Run a JXA (JavaScript for Automation) script via osascript and return stdout */
export async function runJxa(script: string, timeout = 30_000): Promise<string> {
  // For large scripts, write to temp file to avoid argument length limits
  if (script.length > 2000) {
    const tmpPath = join(tmpdir(), `0xmux-jxa-${Date.now()}.js`);
    await writeFile(tmpPath, script, "utf-8");
    try {
      return await new Promise((resolve, reject) => {
        execFile("osascript", ["-l", "JavaScript", tmpPath], { timeout }, (err: Error | null, stdout: string, stderr: string) => {
          if (err) {
            reject(new Error(`JXA error: ${stderr || err.message}`));
            return;
          }
          resolve(stdout.trim());
        });
      });
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", script], { timeout }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) {
        reject(new Error(`JXA error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/** Run an AppleScript via osascript and return stdout. Uses temp file for large scripts. */
export async function runAppleScript(script: string, timeout = 10_000): Promise<string> {
  // For large scripts, write to temp file to avoid argument length limits
  if (script.length > 1000) {
    const tmpPath = join(tmpdir(), `0xmux-as-${Date.now()}.scpt`);
    await writeFile(tmpPath, script, "utf-8");
    try {
      return await new Promise((resolve, reject) => {
        execFile("osascript", [tmpPath], { timeout }, (err: Error | null, stdout: string, stderr: string) => {
          if (err) {
            reject(new Error(`AppleScript error: ${stderr || err.message}`));
            return;
          }
          resolve(stdout.trim());
        });
      });
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout }, (err: Error | null, stdout: string, stderr: string) => {
      if (err) {
        reject(new Error(`AppleScript error: ${stderr || err.message}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}
