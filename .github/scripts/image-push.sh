#!/usr/bin/env bash
# Pushes $CI_KEY:build under each tag in $TAGS (newline-separated). A tag that
# already exists on the build host (for example the image a local container
# runs from) is pointed back at its previous image right after the push, so a
# CI run never changes what local containers would start from.
set -euo pipefail

while IFS= read -r tag; do
  [[ -z "$tag" ]] && continue
  prev="$(docker image inspect -f '{{.Id}}' "$tag" 2>/dev/null || true)"
  docker tag "$CI_KEY:build" "$tag"
  push_ok=true
  docker push "$tag" || push_ok=false
  if [[ -n "$prev" ]]; then
    docker tag "$prev" "$tag"
  else
    docker rmi "$tag" >/dev/null
  fi
  [[ "$push_ok" == true ]] || exit 1
done <<< "$TAGS"
