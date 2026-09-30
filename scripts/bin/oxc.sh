#!/bin/sh
# Usage: scripts/bin/oxc.sh <oxlint|oxfmt> [args...]
# ponytail: the ocx oxc packages ship the binary under its target-triple name
# (oxlint-x86_64-unknown-linux-musl) with no plain-name shim, so take the plain
# name if one is on PATH, else the first `<tool>-*` match in PATH order.
set -eu
tool=$1
shift
bin=$(command -v "$tool" 2>/dev/null || true)
if [ -z "$bin" ]; then
  IFS=:
  for dir in $PATH; do
    for f in "$dir/$tool"-*; do
      if [ -x "$f" ]; then bin=$f; break 2; fi
    done
  done
  unset IFS
fi
[ -n "$bin" ] || { echo "oxc.sh: $tool not on PATH (run via ocx exec --)" >&2; exit 127; }
exec "$bin" "$@"
