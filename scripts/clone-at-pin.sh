#!/usr/bin/env bash
# Clones one commit of a repository, as CI and `npm run examples:regen` do:
# git init, add origin, depth-1 fetch of the pinned SHA (with retry), checkout.
#
#   scripts/clone-at-pin.sh URL COMMIT DIR
#
# DIR must not exist yet. Exit codes: 0 cloned, 1 failed, 2 usage error.
set -euo pipefail

if [ $# -ne 3 ]; then
  echo "usage: clone-at-pin.sh URL COMMIT DIR" >&2
  exit 2
fi
url=$1 commit=$2 dir=$3

if [ -e "$dir" ]; then
  echo "clone-at-pin: $dir already exists" >&2
  exit 1
fi

git init --quiet "$dir"
git -C "$dir" remote add origin "$url"

delay=2
for attempt in 1 2 3 4 5; do
  if git -C "$dir" fetch --quiet --depth=1 --no-tags origin "$commit"; then
    break
  fi
  if [ "$attempt" -eq 5 ]; then
    echo "clone-at-pin: fetching $commit from $url failed 5 times" >&2
    exit 1
  fi
  echo "clone-at-pin: fetch failed, retrying in ${delay}s" >&2
  sleep "$delay"
  delay=$((delay * 2))
done

git -C "$dir" -c advice.detachedHead=false checkout --quiet FETCH_HEAD
head=$(git -C "$dir" rev-parse HEAD)
if [ "$head" != "$commit" ]; then
  echo "clone-at-pin: checked out $head, expected $commit" >&2
  exit 1
fi
