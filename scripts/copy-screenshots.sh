#!/bin/bash
# Copy browser MCP screenshots from temp to workspace
SRC="/var/folders/mw/lz24t9tn2c95r652g5vksnn40000gn/T/cursor/screenshots/Users/rum_two/Documents/health-workforce-optimizer/health-workforce-optimizer/docs/project-doc/screenshots"
DST="/Users/rum_two/Documents/health-workforce-optimizer/health-workforce-optimizer/docs/project-doc/screenshots"
mkdir -p "$DST"
if [ -d "$SRC" ]; then
  cp -f "$SRC"/*.png "$DST/" 2>/dev/null || true
fi
ls -la "$DST"
