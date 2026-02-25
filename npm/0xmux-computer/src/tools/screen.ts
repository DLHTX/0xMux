import { runJxa } from "../utils/jxa.js";

export interface ScreenInfo {
  screens: Array<{
    id: number;
    width: number;
    height: number;
    scaleFactor: number;
    x: number;
    y: number;
    visibleWidth: number;
    visibleHeight: number;
    visibleX: number;
    visibleY: number;
  }>;
}

/** Get info about all connected screens */
export async function screenInfo(): Promise<ScreenInfo> {
  const script = `
ObjC.import('AppKit');
const screens = $.NSScreen.screens;
const result = [];
for (let i = 0; i < screens.count; i++) {
  const s = screens.objectAtIndex(i);
  const frame = s.frame;
  const visible = s.visibleFrame;
  result.push({
    id: i,
    width: frame.size.width,
    height: frame.size.height,
    scaleFactor: s.backingScaleFactor,
    x: frame.origin.x,
    y: frame.origin.y,
    visibleWidth: visible.size.width,
    visibleHeight: visible.size.height,
    visibleX: visible.origin.x,
    visibleY: visible.origin.y
  });
}
JSON.stringify(result);
`;
  const raw = await runJxa(script);
  return { screens: JSON.parse(raw) };
}
