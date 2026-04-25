#!/usr/bin/env bash
#
# fetch.sh — operator-triggered fetch of every ticker in the universe.
#
# Why this script exists: AV_API_KEY lives in /etc/williams-radar.env (mode
# 600), used by the williams-radar systemd service. Other autonomous agents
# (Jarvis / mission-control) don't inherit that env, so a `node` subprocess
# they spawn in this repo throws "AV_API_KEY environment variable is
# required" on the first call. This wrapper sources the env file just for
# the lifetime of the fetch invocation — the secret never lands in any
# parent process's environment.
#
# Usage:
#   ./scripts/fetch.sh                   # uses /etc/williams-radar.env
#   ENV_FILE=/path/to/.env ./scripts/fetch.sh   # override env file
#
# Exit codes:
#   0  — every ticker has data (cached or just fetched)
#   1  — at least one ticker errored (see [fetch-tickers] summary line)

set -euo pipefail

# ENV_FILE is overridable for tests but constrained to a safe prefix —
# `source $ENV_FILE` executes its contents as bash, so a free-form path
# would be an arbitrary-code-execution sink under a poisoned-prompt
# threat model (audit W1). Allow only the canonical path or a `.test`
# sibling under /etc/.
ENV_FILE="${ENV_FILE:-/etc/williams-radar.env}"

case "$ENV_FILE" in
  /etc/williams-radar.env|/etc/williams-radar.env.test) ;;
  *)
    echo "fetch.sh: ENV_FILE must be /etc/williams-radar.env (or .test); got: $ENV_FILE" >&2
    exit 2
    ;;
esac

if [ ! -r "$ENV_FILE" ]; then
  echo "fetch.sh: cannot read env file at $ENV_FILE — check perms (mode 600 expected)" >&2
  exit 2
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
set -u  # re-assert after sourcing — defends against unset-variable footguns

if [ -z "${AV_API_KEY:-}" ]; then
  echo "fetch.sh: AV_API_KEY not set after sourcing $ENV_FILE" >&2
  exit 2
fi

cd "$(dirname "$0")/.."
# Use the repo-local tsx so a fresh-VPS run never hits npm registry
# (audit S1). Falls back to npx tsx only if node_modules is missing —
# in that case the operator has bigger problems than this script.
if [ -x ./node_modules/.bin/tsx ]; then
  exec ./node_modules/.bin/tsx src/fetch-tickers.ts
else
  echo "fetch.sh: ./node_modules/.bin/tsx missing — run 'npm install' first" >&2
  exit 2
fi
