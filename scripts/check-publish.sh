#!/usr/bin/env bash
# Publication gate for a public repository.
#
# Disclosure is irreversible: once content reaches GitHub it can be cloned,
# cached and indexed, and even a rejected pull request has already exposed
# its contents. This script is therefore the PRIMARY control and runs locally
# before every push (.githooks/pre-push). The identical job in CI is defense
# in depth, not the gate.
#
#   ./scripts/check-publish.sh          # scan tracked + untracked files
set -uo pipefail

fail=0
note() { printf '  %s\n' "$1"; }
bad()  { printf '\nBLOCKED: %s\n' "$1"; fail=1; }

files=$(git ls-files --cached --others --exclude-standard)
[ -z "$files" ] && { echo "No files to check."; exit 0; }

# --- Forbidden paths -------------------------------------------------------
# Product source and secrets must never exist in this repository, whatever
# they contain.
while IFS= read -r f; do
  case "$f" in
    .env|.env.*|*/.env|*/.env.*) bad "environment file: $f" ;;
    *.pem|*.key|*.p12|*.pfx)     bad "key material: $f" ;;
    prisma/*|*/prisma/*)         bad "database schema path: $f" ;;
    backend/src/*|*/backend/src/*) bad "backend source path: $f" ;;
    docs/superpowers/*|*/docs/superpowers/*) bad "internal spec path: $f" ;;
  esac
done <<< "$files"

# --- Forbidden content -----------------------------------------------------
# Staging hostnames leak infrastructure. The dev.test.* mailboxes must never
# appear publicly: the pattern gets copied, and invented local-parts are
# non-routable, so the resulting hard bounces damage sender reputation.
scan() {
  local label="$1" pattern="$2"
  local hits
  hits=$(printf '%s\n' "$files" | while IFS= read -r f; do
    [ -f "$f" ] || continue
    # This file necessarily contains the patterns it searches for.
    [ "$f" = "scripts/check-publish.sh" ] && continue
    grep -InE "$pattern" "$f" 2>/dev/null | sed "s|^|$f:|"
  done)
  if [ -n "$hits" ]; then
    bad "$label"
    printf '%s\n' "$hits" | head -20 | while IFS= read -r l; do note "$l"; done
  fi
}

scan "staging hostname (pre.42min.us)" 'pre\.42min\.us'
scan "internal test mailbox (dev.test.*@42min.us)" 'dev\.test\.[A-Za-z0-9._+-]*@42min\.us'

# --- Secret scanning -------------------------------------------------------
# `gitleaks git` scans history; `gitleaks dir` scans the files on disk. Only the
# second one sees work that has not been committed yet, which is exactly what a
# pre-push gate must catch. Running only the history scan silently passes a
# planted credential in an uncommitted file.
if command -v gitleaks >/dev/null 2>&1; then
  if ! gitleaks dir --no-banner --redact . >/dev/null 2>&1; then
    bad "gitleaks found secrets in the working tree"
    note "run: gitleaks dir --redact -v ."
  fi
  if git rev-parse HEAD >/dev/null 2>&1; then
    if ! gitleaks git --no-banner --redact . >/dev/null 2>&1; then
      bad "gitleaks found secrets in git history"
      note "run: gitleaks git --redact -v ."
    fi
  fi
else
  printf '\nWARNING: gitleaks is not installed; secret scanning was SKIPPED.\n'
  printf '  Install it before publishing: https://github.com/gitleaks/gitleaks\n'
fi

if [ "$fail" -ne 0 ]; then
  printf '\nPublication gate FAILED. Nothing was pushed.\n'
  exit 1
fi
printf 'Publication gate passed (%s files).\n' "$(printf '%s\n' "$files" | wc -l | tr -d ' ')"
