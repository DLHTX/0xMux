import { runAppleScript, runJxa } from "../utils/jxa.js";

export interface WindowInfo {
  app: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** List all visible on-screen windows via System Events */
export async function windowList(): Promise<WindowInfo[]> {
  // Use AppleScript System Events — reliable and no CF type bridging issues
  const script = `
set output to "["
set isFirst to true
tell application "System Events"
  set procList to every process whose background only is false
  repeat with proc in procList
    try
      set procName to name of proc
      set winList to every window of proc
      repeat with win in winList
        try
          set winName to name of win
          set winPos to position of win
          set winSz to size of win
          if not isFirst then set output to output & ","
          set isFirst to false
          set output to output & "{\\"app\\":\\"" & procName & "\\",\\"title\\":\\"" & winName & "\\",\\"x\\":" & (item 1 of winPos) & ",\\"y\\":" & (item 2 of winPos) & ",\\"width\\":" & (item 1 of winSz) & ",\\"height\\":" & (item 2 of winSz) & "}"
        end try
      end repeat
    end try
  end repeat
end tell
set output to output & "]"
return output
`;
  const raw = await runAppleScript(script);
  return JSON.parse(raw);
}

/** Focus a window by app name (substring match) or window title */
export async function windowFocus(opts: { app?: string; title?: string }): Promise<string> {
  if (opts.app) {
    const escaped = opts.app.replace(/"/g, '\\"');
    const script = `
var found = false;
var se = Application('System Events');
var procs = se.applicationProcesses.whose({backgroundOnly: false});
for (var i = 0; i < procs.length; i++) {
  var name = procs[i].name();
  if (name.toLowerCase().includes("${escaped.toLowerCase()}")) {
    var app = Application(name);
    app.activate();
    found = name;
    break;
  }
}
found ? 'focused ' + found : 'app not found';
`;
    const result = await runJxa(script);
    return result.includes("not found") ? `App "${opts.app}" not found` : result;
  }

  if (opts.title) {
    const escaped = opts.title.replace(/"/g, '\\"');
    const script = `
tell application "System Events"
  set procList to every process whose background only is false
  repeat with proc in procList
    try
      set winList to every window of proc whose name contains "${escaped}"
      if (count of winList) > 0 then
        set frontmost of proc to true
        return "focused " & name of proc
      end if
    end try
  end repeat
end tell
return "window not found"
`;
    const result = await runAppleScript(script);
    return result;
  }

  return "Provide either app or title";
}
