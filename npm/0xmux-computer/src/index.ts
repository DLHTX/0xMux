#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { assertMacOS, printPermissionHint } from "./utils/platform.js";
import { screenInfo } from "./tools/screen.js";
import { windowList, windowFocus } from "./tools/window.js";
import { mouseMove, mouseClick, mouseScroll } from "./tools/mouse.js";
import { keyboardType, keyboardShortcut } from "./tools/keyboard.js";
import { screenshot } from "./tools/screenshot.js";
import { accessibilitySnapshot, clickElement, typeElement } from "./tools/accessibility.js";

assertMacOS();

const server = new McpServer({
  name: "0xmux-computer",
  version: "0.1.0",
});

// --- screen_info ---
server.tool(
  "screen_info",
  "Get display info: resolution, scale factor, visible area for all connected screens",
  {},
  async () => {
    const info = await screenInfo();
    return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
  }
);

// --- window_list ---
server.tool(
  "window_list",
  "List all visible on-screen windows with app name, title, position, and size",
  {},
  async () => {
    const windows = await windowList();
    return { content: [{ type: "text", text: JSON.stringify(windows, null, 2) }] };
  }
);

// --- window_focus ---
server.tool(
  "window_focus",
  "Focus a window by app name or window title (substring match)",
  {
    app: z.string().optional().describe("App name to focus (substring match)"),
    title: z.string().optional().describe("Window title to focus (substring match)"),
  },
  async ({ app, title }) => {
    const result = await windowFocus({ app, title });
    return { content: [{ type: "text", text: result }] };
  }
);

// --- mouse_move ---
server.tool(
  "mouse_move",
  "Move mouse cursor to (x, y) in logical screen coordinates",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  },
  async ({ x, y }) => {
    const result = await mouseMove(x, y);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- mouse_click ---
server.tool(
  "mouse_click",
  "Click at (x, y). Supports left/right button and double-click",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    button: z.enum(["left", "right"]).optional().describe("Mouse button (default: left)"),
    doubleClick: z.boolean().optional().describe("Double-click instead of single click"),
  },
  async ({ x, y, button, doubleClick }) => {
    const result = await mouseClick(x, y, button ?? "left", doubleClick ?? false);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- keyboard_type ---
server.tool(
  "keyboard_type",
  "Type text at the current cursor position",
  {
    text: z.string().describe("Text to type"),
  },
  async ({ text }) => {
    const result = await keyboardType(text);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- keyboard_shortcut ---
server.tool(
  "keyboard_shortcut",
  'Execute a keyboard shortcut like "cmd+c", "cmd+shift+s", "ctrl+alt+delete"',
  {
    shortcut: z.string().describe('Shortcut string, e.g. "cmd+c", "cmd+shift+z", "ctrl+alt+delete"'),
  },
  async ({ shortcut }) => {
    const result = await keyboardShortcut(shortcut);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- screenshot ---
server.tool(
  "screenshot",
  "Take a screenshot of the full screen, a region, or a specific window. Returns base64 PNG",
  {
    regionX: z.number().optional().describe("Region X coordinate"),
    regionY: z.number().optional().describe("Region Y coordinate"),
    regionWidth: z.number().optional().describe("Region width"),
    regionHeight: z.number().optional().describe("Region height"),
    windowId: z.number().optional().describe("Capture a specific window by ID"),
  },
  async ({ regionX, regionY, regionWidth, regionHeight, windowId }) => {
    const region =
      regionX !== undefined && regionY !== undefined && regionWidth !== undefined && regionHeight !== undefined
        ? { x: regionX, y: regionY, width: regionWidth, height: regionHeight }
        : undefined;
    const base64 = await screenshot({ region, windowId });
    return {
      content: [{ type: "image", data: base64, mimeType: "image/png" }],
    };
  }
);

// --- mouse_scroll ---
server.tool(
  "mouse_scroll",
  "Scroll at (x, y). scrollY positive = scroll up, negative = scroll down",
  {
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
    scrollY: z.number().describe("Vertical scroll amount (positive=up, negative=down)"),
    scrollX: z.number().optional().describe("Horizontal scroll amount (optional)"),
  },
  async ({ x, y, scrollY, scrollX }) => {
    const result = await mouseScroll(x, y, scrollY, scrollX ?? 0);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- accessibility_snapshot ---
server.tool(
  "accessibility_snapshot",
  "Get accessibility tree of an app as compact text. Use for navigation/interaction (buttons, lists, inputs). For reading text content in apps like WeChat where content is not accessible, use screenshot instead. Returns ref IDs for click_element/type_element.",
  {
    app: z.string().optional().describe("App name (default: frontmost app)"),
    maxDepth: z.number().optional().describe("Max traversal depth (default: 8)"),
  },
  async ({ app, maxDepth }) => {
    const result = await accessibilitySnapshot(app, maxDepth ?? 6);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- click_element ---
server.tool(
  "click_element",
  "Click an element by ref ID from the last accessibility_snapshot. More reliable than coordinate-based clicking.",
  {
    ref: z.number().describe("Element ref ID from accessibility_snapshot"),
  },
  async ({ ref }) => {
    const result = await clickElement(ref);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- type_element ---
server.tool(
  "type_element",
  "Click an element by ref to focus it, then type text. Useful for filling text fields found in accessibility_snapshot.",
  {
    ref: z.number().describe("Element ref ID from accessibility_snapshot"),
    text: z.string().describe("Text to type into the element"),
  },
  async ({ ref, text }) => {
    const result = await typeElement(ref, text);
    return { content: [{ type: "text", text: result }] };
  }
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[0xmux-computer] MCP server started");
  printPermissionHint();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
