#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-flizqleotabfoonteqsv}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN. Create one in Supabase Account Settings → Access Tokens and export it before running." >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  echo "Missing SUPABASE_DB_PASSWORD. Export the database password for project ${PROJECT_REF} before running." >&2
  exit 1
fi

npx supabase link --project-ref "$PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
npx supabase db push --linked --password "$SUPABASE_DB_PASSWORD"

echo "Supabase migrations applied for project ${PROJECT_REF}."
