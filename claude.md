每句对话前喊我 koray,
所有测试产生的文件放到.claude/test 里面
开发环境端口是 1235（不是 1234）
UI 设计规则：不许出现圆形（包括圆角、圆点、圆形按钮）
每次修改后端代码后，必须重新编译并重启开发服务器：cd /Users/koray/Documents/GitHub/0xMux && cargo build --features agent && kill $(lsof -ti:1235) 2>/dev/null; ./target/debug/oxmux-server --port 1235 &
