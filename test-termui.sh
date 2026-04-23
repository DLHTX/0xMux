#!/bin/bash
# Test TermUI — outputs markers that trigger a webview pane
HTML='<h2 style="color:#1BFF80">Hello TermUI!</h2><p>This rich content is rendered in a webview pane next to the terminal.</p><button data-action="hello">Click Me</button> <button data-action="world">Option B</button>'
B64=$(echo -n "$HTML" | base64 | tr -d '\n')
echo "__TERMUI_BEGIN__"
echo "$B64"
echo "__TERMUI_END__"
