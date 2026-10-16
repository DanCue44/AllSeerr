#!/usr/bin/env bash
# Removes every image this run built (tagged or not) and logs out of GHCR.
set -uo pipefail

docker rmi "$CI_KEY:build" >/dev/null 2>&1 || true
docker image prune -af --filter "label=io.dancue44.ci.key=$CI_KEY" | tail -n 1 || true
docker logout ghcr.io >/dev/null 2>&1 || true
