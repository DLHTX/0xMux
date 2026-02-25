import { runJxa } from "../utils/jxa.js";

/** Move the mouse cursor to (x, y) in logical coordinates */
export async function mouseMove(x: number, y: number): Promise<string> {
  const script = `
ObjC.import('CoreGraphics');
const point = $.CGPointMake(${x}, ${y});
const event = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft);
$.CGEventPost($.kCGHIDEventTap, event);
'moved to ${x},${y}';
`;
  return runJxa(script);
}

/** Click at (x, y) with options for button and double-click */
export async function mouseClick(
  x: number,
  y: number,
  button: "left" | "right" = "left",
  doubleClick = false
): Promise<string> {
  const btn = button === "right" ? "$.kCGMouseButtonRight" : "$.kCGMouseButtonLeft";
  const downEvent = button === "right" ? "$.kCGEventRightMouseDown" : "$.kCGEventLeftMouseDown";
  const upEvent = button === "right" ? "$.kCGEventRightMouseUp" : "$.kCGEventLeftMouseUp";
  const clickCount = doubleClick ? 2 : 1;

  const script = `
ObjC.import('CoreGraphics');
const point = $.CGPointMake(${x}, ${y});

// Move to position first
const moveEvt = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, point, ${btn});
$.CGEventPost($.kCGHIDEventTap, moveEvt);

for (let i = 0; i < ${clickCount}; i++) {
  const down = $.CGEventCreateMouseEvent($(), ${downEvent}, point, ${btn});
  $.CGEventSetIntegerValueField(down, $.kCGMouseEventClickState, i + 1);
  $.CGEventPost($.kCGHIDEventTap, down);

  const up = $.CGEventCreateMouseEvent($(), ${upEvent}, point, ${btn});
  $.CGEventSetIntegerValueField(up, $.kCGMouseEventClickState, i + 1);
  $.CGEventPost($.kCGHIDEventTap, up);
}
'clicked ${button} at ${x},${y}${doubleClick ? " (double)" : ""}';
`;
  return runJxa(script);
}

/** Scroll at (x, y). scrollY positive = up, negative = down. scrollX optional. */
export async function mouseScroll(
  x: number,
  y: number,
  scrollY: number,
  scrollX = 0
): Promise<string> {
  // Move mouse to position first, then create scroll event
  const script = `
ObjC.import('CoreGraphics');
const point = $.CGPointMake(${x}, ${y});
const moveEvt = $.CGEventCreateMouseEvent($(), $.kCGEventMouseMoved, point, $.kCGMouseButtonLeft);
$.CGEventPost($.kCGHIDEventTap, moveEvt);

const scrollEvt = $.CGEventCreateScrollWheelEvent($(), 0, 2, ${scrollY}, ${scrollX});
$.CGEventPost($.kCGHIDEventTap, scrollEvt);
'scrolled (${scrollY}, ${scrollX}) at ${x},${y}';
`;
  return runJxa(script);
}
