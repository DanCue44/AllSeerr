#!/usr/bin/env bash
# Builds the linux/amd64 image with the classic Docker builder as $CI_KEY:build.
# Every stage gets a run label so image-cleanup.sh can remove all of this run's
# images, including the untagged build stages.
# Env: CI_KEY, LABELS (newline-separated key=value), COMMIT_TAG, SOURCE_DATE_EPOCH
set -euo pipefail

dockerfile="${RUNNER_TEMP:-/tmp}/Dockerfile.$CI_KEY"
sed -e "/^FROM /a LABEL io.dancue44.ci.key=$CI_KEY" Dockerfile > "$dockerfile"

label_args=()
while IFS= read -r l; do
  [[ -n "$l" ]] && label_args+=(--label "$l")
done <<< "${LABELS:-}"

docker build --force-rm --pull \
  -f "$dockerfile" \
  --build-arg TARGETPLATFORM=linux/amd64 \
  --build-arg COMMIT_TAG="$COMMIT_TAG" \
  --build-arg SOURCE_DATE_EPOCH="$SOURCE_DATE_EPOCH" \
  "${label_args[@]}" \
  -t "$CI_KEY:build" .
