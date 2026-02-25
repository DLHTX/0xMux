import { runJxa } from "../utils/jxa.js";
import { mouseClick } from "./mouse.js";
import { keyboardType } from "./keyboard.js";

// ref → position cache from last snapshot
const refCache = new Map<number, { x: number; y: number; width: number; height: number }>();
let nextRef = 1;

/** Reset ref cache for a new snapshot */
function resetRefs(): void {
  refCache.clear();
  nextRef = 1;
}

/** Allocate a ref ID and cache its position */
function allocRef(x: number, y: number, width: number, height: number): number {
  const id = nextRef++;
  refCache.set(id, { x, y, width, height });
  return id;
}

/** Get center point of a ref */
export function getRefCenter(ref: number): { x: number; y: number } | null {
  const pos = refCache.get(ref);
  if (!pos) return null;
  return { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 };
}

// --- JXA-based AX tree traversal (uses bulk property queries for speed) ---

function buildJxaTraversalScript(appName: string | null, maxDepth: number): string {
  const appSelector = appName
    ? `se.processes.byName(${JSON.stringify(appName)})`
    : `se.processes.whose({frontmost: true})[0]`;

  return `
const se = Application('System Events');
const proc = ${appSelector};
const MAX_DEPTH = ${maxDepth};
const MAX_ELEMENTS = 200;
let lines = [];
let count = 0;

function esc(s) {
  if (s == null || s === 'missing value') return '';
  s = String(s).replace(/\\|/g, '/').replace(/[\\r\\n]/g, ' ');
  if (s.length > 120) s = s.substring(0, 120) + '...';
  return s;
}

function posStr(p) {
  if (!p || !Array.isArray(p)) return '0,0';
  return p[0] + ',' + p[1];
}

// Leaf roles — don't recurse into these
const LEAF = new Set([
  'AXButton', 'AXStaticText', 'AXTextField', 'AXTextArea',
  'AXCheckBox', 'AXRadioButton', 'AXSlider', 'AXImage',
  'AXLink', 'AXMenuButton', 'AXPopUpButton', 'AXComboBox',
  'AXIncrementor', 'AXColorWell', 'AXDisclosureTriangle',
]);

// Large list roles — skip children if count > threshold
const LIST_LIKE = new Set(['AXList', 'AXTable', 'AXOutline']);

function traverse(parent, depth) {
  if (depth > MAX_DEPTH || count >= MAX_ELEMENTS) return;

  // Single bulk call to discover children and their roles
  let roles;
  try { roles = parent.uiElements.role(); } catch(e) { return; }
  if (!roles || roles.length === 0) return;
  const n = roles.length;

  // Bulk-query remaining properties (~4 more Apple Event calls)
  let titles = [], positions = [], sizes = [], idents = [];
  try { titles = parent.uiElements.title(); } catch(e) {}
  try { positions = parent.uiElements.position(); } catch(e) {}
  try { sizes = parent.uiElements.size(); } catch(e) {}
  try { idents = parent.uiElements.description(); } catch(e) {}

  let limit = Math.min(n, 15);

  for (let i = 0; i < limit && count < MAX_ELEMENTS; i++) {
    const role = roles[i] || '';
    const title = esc(titles[i]);
    const pos = posStr(positions[i]);
    const sz = posStr(sizes[i]);
    const ident = esc(idents[i]);

    const lineIdx = lines.length;
    lines.push(depth + '|' + role + '|' + title + '||' + ident + '|' + pos + '|' + sz + '|0');
    count++;

    // Skip leaf elements — no children to recurse into
    if (LEAF.has(role)) continue;
    if (depth >= MAX_DEPTH || count >= MAX_ELEMENTS) continue;

    // For list-like containers, peek at child count before recursing
    if (LIST_LIKE.has(role)) {
      let gcRoles;
      try { gcRoles = parent.uiElements[i].uiElements.role(); } catch(e) {}
      if (gcRoles && gcRoles.length > 15) {
        // Update parent line with actual child count
        const parts = lines[lineIdx].split('|');
        parts[parts.length - 1] = String(gcRoles.length);
        lines[lineIdx] = parts.join('|');

        // Show first items with descriptions for navigation
        let gcTitles = [], gcPositions = [], gcSizes = [], gcIdents = [];
        try { gcTitles = parent.uiElements[i].uiElements.title(); } catch(e) {}
        try { gcPositions = parent.uiElements[i].uiElements.position(); } catch(e) {}
        try { gcSizes = parent.uiElements[i].uiElements.size(); } catch(e) {}
        try { gcIdents = parent.uiElements[i].uiElements.description(); } catch(e) {}
        const showN = Math.min(gcRoles.length, 8);
        for (let j = 0; j < showN && count < MAX_ELEMENTS; j++) {
          lines.push((depth+1) + '|' + (gcRoles[j]||'') + '|' + esc(gcTitles[j]) + '||' + esc(gcIdents[j]) + '|' + posStr(gcPositions[j]) + '|' + posStr(gcSizes[j]) + '|0');
          count++;
        }
        if (gcRoles.length > showN) {
          lines.push((depth+1) + '|...|(' + (gcRoles.length - showN) + ' more items)||||0,0|0,0|0');
        }
        continue;
      }
      // Small list — update count and recurse normally
      if (gcRoles) {
        const parts = lines[lineIdx].split('|');
        parts[parts.length - 1] = String(gcRoles.length);
        lines[lineIdx] = parts.join('|');
      }
    }

    // Recurse into container and update child count
    const beforeCount = lines.length;
    traverse(parent.uiElements[i], depth + 1);
    // Update child count based on direct children added
    const childrenAdded = lines.length - beforeCount;
    if (childrenAdded > 0) {
      const parts = lines[lineIdx].split('|');
      if (parts[parts.length - 1] === '0') {
        parts[parts.length - 1] = String(n); // use the bulk count from parent perspective
      }
      lines[lineIdx] = parts.join('|');
    }
  }

  if (n > limit) {
    lines.push(depth + '|...|(' + (n - limit) + ' more items)||||0,0|0,0|0');
  }
}

try {
  const wins = proc.windows();
  for (let wi = 0; wi < wins.length && count < MAX_ELEMENTS; wi++) {
    const w = wins[wi];
    let desc = '', title = '';
    try { desc = esc(w.roleDescription()); } catch(e) {}
    try { title = esc(w.title()); } catch(e) {}

    // Skip input method dialogs and other non-app windows
    if (desc === '对话框' || desc === 'dialog') continue;

    let pos = '0,0', sz = '0,0';
    try { pos = posStr(w.position()); } catch(e) {}
    try { sz = posStr(w.size()); } catch(e) {}

    lines.push('0|' + desc + '|' + title + '|||' + pos + '|' + sz + '|0');
    count++;

    traverse(w, 1);
  }
} catch(e) {
  lines.push('ERROR: ' + e);
}

lines.join('\\n');
`;
}

interface AXElement {
  depth: number;
  role: string;
  title: string;
  value: string;
  identifier: string;
  x: number;
  y: number;
  width: number;
  height: number;
  childCount: number;
}

/** Parse the delimited output from AppleScript */
function parseAXOutput(raw: string): AXElement[] {
  const lines = raw.split("\n").filter((l) => l.length > 0);
  const elements: AXElement[] = [];

  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 8) continue;

    const [depthStr, role, title, value, identifier, posStr, sizeStr, childCountStr] = parts;
    const posParts = posStr.split(",");
    const sizeParts = sizeStr.split(",");

    elements.push({
      depth: parseInt(depthStr, 10) || 0,
      role: role || "",
      title: title || "",
      value: value || "",
      identifier: identifier || "",
      x: parseFloat(posParts[0]) || 0,
      y: parseFloat(posParts[1]) || 0,
      width: parseFloat(sizeParts[0]) || 0,
      height: parseFloat(sizeParts[1]) || 0,
      childCount: parseInt(childCountStr, 10) || 0,
    });
  }

  return elements;
}

/** Smart-parse AXIdentifier patterns */
function parseIdentifier(identifier: string): string {
  // WeChat: session_item_XXX → extract contact/group name
  const sessionMatch = identifier.match(/^session_item_(.+)$/);
  if (sessionMatch) return sessionMatch[1];

  return identifier;
}

/** Determine a human-readable label for an element */
function getLabel(elem: AXElement): string {
  const parts: string[] = [];

  // Filter out "missing value" which AppleScript returns for nil properties
  const clean = (s: string) => s === "missing value" ? "" : s;

  // Title / name
  const title = clean(elem.title);
  if (title) {
    parts.push(title);
  }

  // Smart identifier parsing
  const ident = clean(elem.identifier);
  if (ident) {
    const parsed = parseIdentifier(ident);
    if (parsed && parsed !== title) {
      parts.push(parsed);
    }
  }

  // Value (for text fields, etc)
  const val = clean(elem.value);
  if (val) {
    parts.push(`"${val}"`);
  }

  return parts.join(" ");
}

/** Map role descriptions to short tags (supports both English and Chinese macOS) */
function roleTag(role: string): string {
  const map: Record<string, string> = {
    // English
    window: "window",
    button: "button",
    "pop up button": "popup",
    "radio button": "radio",
    checkbox: "checkbox",
    "static text": "text",
    "text field": "textfield",
    "text area": "textarea",
    image: "image",
    group: "group",
    list: "list",
    table: "table",
    "scroll area": "scroll",
    "split group": "splitgroup",
    "tab group": "tabgroup",
    toolbar: "toolbar",
    "menu bar": "menubar",
    menu: "menu",
    "menu item": "menuitem",
    "menu button": "menubutton",
    slider: "slider",
    "progress indicator": "progress",
    link: "link",
    "web area": "webarea",
    row: "row",
    cell: "cell",
    column: "column",
    outline: "outline",
    sheet: "sheet",
    "combo box": "combobox",
    incrementor: "stepper",
    "color well": "colorwell",
    "disclosure triangle": "disclosure",
    // Chinese macOS role descriptions
    "按钮": "button",
    "弹出式按钮": "popup",
    "单选按钮": "radio",
    "复选框": "checkbox",
    "静态文本": "text",
    "文本栏": "textfield",
    "文本区域": "textarea",
    "文本区": "textarea",
    "文本输入区": "textarea",
    "图像": "image",
    "组": "group",
    "列表": "list",
    "表格": "table",
    "滚动区域": "scroll",
    "滚动区": "scroll",
    "文本": "text",
    "分离组": "splitgroup",
    "标签组": "tabgroup",
    "工具栏": "toolbar",
    "菜单栏": "menubar",
    "菜单": "menu",
    "菜单项": "menuitem",
    "菜单按钮": "menubutton",
    "滑块": "slider",
    "进度指示器": "progress",
    "链接": "link",
    "网页区域": "webarea",
    "行": "row",
    "单元格": "cell",
    "列": "column",
    "大纲": "outline",
    "工作表": "sheet",
    "组合框": "combobox",
    "递增器": "stepper",
    "颜色井": "colorwell",
    "展开三角形": "disclosure",
    "关闭按钮": "button",
    "最小化按钮": "button",
    "全屏幕按钮": "button",
    "缩放按钮": "button",
    "标准窗口": "window",
    "对话框": "dialog",
    "浮动窗口": "window",
    // AXRole fallback values (when role description is missing)
    axwindow: "window",
    axbutton: "button",
    axpopupbutton: "popup",
    axradiobutton: "radio",
    axcheckbox: "checkbox",
    axstatictext: "text",
    axtextfield: "textfield",
    axtextarea: "textarea",
    aximage: "image",
    axgroup: "group",
    axlist: "list",
    axtable: "table",
    axscrollarea: "scroll",
    axsplitgroup: "splitgroup",
    axtabgroup: "tabgroup",
    axtoolbar: "toolbar",
    axmenubar: "menubar",
    axmenu: "menu",
    axmenuitem: "menuitem",
    axmenubutton: "menubutton",
    axslider: "slider",
    axlink: "link",
    axwebarea: "webarea",
    axrow: "row",
    axcell: "cell",
    axcolumn: "column",
    axoutline: "outline",
    axsheet: "sheet",
    axcombobox: "combobox",
    axdialog: "dialog",
    axdrawer: "drawer",
  };
  return map[role] || map[role.toLowerCase()] || role.toLowerCase().replace(/\s+/g, "");
}

/** Should this element get a ref (interactive or navigable)? */
function shouldGetRef(elem: AXElement): boolean {
  // Use the normalized tag to check interactivity
  const tag = roleTag(elem.role);
  const interactiveTags = [
    "button", "popup", "radio", "checkbox",
    "textfield", "textarea", "link", "menuitem", "menubutton",
    "slider", "combobox", "stepper", "disclosure",
  ];
  if (interactiveTags.includes(tag)) return true;

  // List items with identifiers (e.g. WeChat session items)
  if (elem.identifier && elem.identifier.startsWith("session_item_")) return true;

  return false;
}

/** Check if element seems to have inaccessible content */
function hasInaccessibleContent(elem: AXElement): boolean {
  // WeChat virtual list cells have children but no readable text
  const tag = roleTag(elem.role);
  if ((tag === "list" || tag === "table") && elem.childCount > 10) {
    return true;
  }
  return false;
}

/** Check if element is a duplicate child button (nested inside parent button, redundant) */
function isDuplicateChild(elem: AXElement, idx: number, elements: AXElement[]): boolean {
  const tag = roleTag(elem.role);
  if (tag !== "button") return false;

  const childLabel = getLabel(elem);

  // Look backwards for the parent element (first element at lower depth)
  for (let i = idx - 1; i >= 0; i--) {
    const parent = elements[i];
    if (parent.depth < elem.depth) {
      const parentTag = roleTag(parent.role);
      if (parentTag !== "button") return false;
      // Compare center points (tolerant of different padding/size)
      const parentCx = parent.x + parent.width / 2;
      const parentCy = parent.y + parent.height / 2;
      const childCx = elem.x + elem.width / 2;
      const childCy = elem.y + elem.height / 2;
      const centerClose = Math.abs(parentCx - childCx) < 20 && Math.abs(parentCy - childCy) < 20;
      if (!centerClose) return false;
      const parentLabel = getLabel(parent);
      // Duplicate if child has no label or same label as parent
      return !childLabel || childLabel === parentLabel;
    }
    if (parent.depth === elem.depth) continue;
  }
  return false;
}

/** Check if element is a direct child of a list */
function isListChild(elem: AXElement, idx: number, elements: AXElement[]): boolean {
  for (let i = idx - 1; i >= 0; i--) {
    const prev = elements[i];
    if (prev.depth < elem.depth) {
      const prevTag = roleTag(prev.role);
      return prevTag === "list";
    }
    if (prev.depth === elem.depth) continue;
  }
  return false;
}

/** Format AX elements into compact text output */
function formatSnapshot(elements: AXElement[]): string {
  resetRefs();
  const lines: string[] = [];

  // Track list items to group inline
  let inlineBuffer: string[] = [];
  let inlineDepth = -1;

  function flushInline(): void {
    if (inlineBuffer.length > 0) {
      const indent = "  ".repeat(inlineDepth);
      lines.push(`${indent}${inlineBuffer.join(" | ")}`);
      inlineBuffer = [];
      inlineDepth = -1;
    }
  }

  for (let idx = 0; idx < elements.length; idx++) {
    const elem = elements[idx];
    const tag = roleTag(elem.role);
    const label = getLabel(elem);

    // Container roles that should always be shown for structure
    const isContainer = ["group", "splitgroup", "scroll", "tabgroup", "toolbar", "list", "table"].includes(tag);

    // Skip empty/unlabeled LEAF elements with no children
    if (!label && !shouldGetRef(elem) && elem.childCount === 0 && !isContainer) {
      // But keep it if it has descendant elements in the output
      const hasDescendants = idx + 1 < elements.length && elements[idx + 1].depth > elem.depth;
      if (!hasDescendants) continue;
    }

    // Skip "missing value" role elements that have no useful content
    if (tag === "missingvalue" && !label) {
      const hasDescendants = idx + 1 < elements.length && elements[idx + 1].depth > elem.depth;
      if (!hasDescendants) continue;
    }

    // Skip duplicate child buttons (WeChat pattern: parent button + identical child button)
    if (isDuplicateChild(elem, idx, elements)) {
      continue;
    }

    // Handle "..." truncation markers
    if (elem.role === "...") {
      flushInline();
      const indent = "  ".repeat(elem.depth);
      lines.push(`${indent}... ${elem.title}`);
      continue;
    }

    // Check if this text element is a clickable list item
    const isClickableListItem = tag === "text" && label && isListChild(elem, idx, elements);

    // Buttons and small interactive elements at same depth → inline
    const isInlineable = ["button", "menuitem", "radio", "menubutton", "popup"].includes(tag)
      && label && elem.childCount === 0;

    if (isInlineable && (inlineDepth === -1 || inlineDepth === elem.depth)) {
      if (inlineDepth === -1) {
        flushInline();
        inlineDepth = elem.depth;
      }
      const ref = shouldGetRef(elem) ? allocRef(elem.x, elem.y, elem.width, elem.height) : null;
      const refStr = ref ? `[ref=${ref}] ` : "";
      inlineBuffer.push(`${refStr}[${tag}] ${label}`);
      continue;
    }

    flushInline();

    const indent = "  ".repeat(elem.depth);

    // Allocate ref for interactive elements OR clickable list items
    const needsRef = shouldGetRef(elem) || isClickableListItem;
    const ref = needsRef ? allocRef(elem.x, elem.y, elem.width, elem.height) : null;
    const refStr = ref ? `[ref=${ref}] ` : "";

    // Build the line
    let line = `${indent}${refStr}[${tag}] ${label}`;

    // Add child count for containers
    if (elem.childCount > 5) {
      line += ` (${elem.childCount} items)`;
    }

    // Mark inaccessible content
    if (hasInaccessibleContent(elem)) {
      line += " (content not accessible - use screenshot)";
    }

    // Add position for elements with ref
    if (ref) {
      const cx = Math.round(elem.x + elem.width / 2);
      const cy = Math.round(elem.y + elem.height / 2);
      line += ` pos=${cx},${cy}`;
    }

    lines.push(line.trimEnd());
  }

  flushInline();

  return lines.join("\n");
}

// --- Public API ---

/** Take an accessibility snapshot of an app's UI tree */
export async function accessibilitySnapshot(
  app?: string,
  maxDepth = 8
): Promise<string> {
  const script = buildJxaTraversalScript(app ?? null, maxDepth);
  const raw = await runJxa(script, 45_000);

  if (!raw.trim()) {
    return "No UI elements found. The app may not support accessibility, or permissions may be missing.";
  }

  const elements = parseAXOutput(raw);
  return formatSnapshot(elements);
}

/** Click an element by ref ID from the last snapshot */
export async function clickElement(ref: number): Promise<string> {
  const center = getRefCenter(ref);
  if (!center) {
    return `ref=${ref} not found. Run accessibility_snapshot first to get valid refs.`;
  }
  return mouseClick(center.x, center.y);
}

/** Click an element by ref to focus it, then type text */
export async function typeElement(ref: number, text: string): Promise<string> {
  const center = getRefCenter(ref);
  if (!center) {
    return `ref=${ref} not found. Run accessibility_snapshot first to get valid refs.`;
  }
  await mouseClick(center.x, center.y);
  // Small delay for focus
  await new Promise((resolve) => setTimeout(resolve, 100));
  return keyboardType(text);
}
