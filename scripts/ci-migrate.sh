#!/usr/bin/env bash
#
# Runs the migrations with exactly the environment declared in
# ci/migration-env.json, and nothing else.
#
# Both repos call this. That is the entire point: portfolio_api runs it against
# a throwaway Postgres in its own CI, and paul-explore runs it against the
# database it spins up for e2e. A migration that needs a variable nobody
# declared fails here first, in the repo that added the migration, instead of
# turning up as a red build on every branch of the frontend.
#
# DATABASE_URL is not declared in the contract and must be supplied by the
# caller. It points at whichever throwaway database that side of the handshake
# has just created, so it is the one thing genuinely not shared.
#
# Override the migrate command with MIGRATE_CMD when the caller needs a
# different package manager invocation — paul-explore does, because the two
# repos pin different pnpm majors.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract="$repo_root/ci/migration-env.json"

if [ ! -f "$contract" ]; then
  echo "[ci-migrate] missing $contract" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ci-migrate] DATABASE_URL must be set by the caller" >&2
  exit 1
fi

# node rather than jq: node is already a hard requirement, jq is not.
while IFS=$'\t' read -r name value; do
  [ -z "$name" ] && continue
  export "$name=$value"
  echo "[ci-migrate] declared: $name"
done < <(node -e '
  const { vars } = require(process.argv[1]);
  for (const [name, spec] of Object.entries(vars ?? {})) {
    process.stdout.write(`${name}\t${spec.ciValue ?? ""}\n`);
  }
' "$contract")

echo "[ci-migrate] running migrations"
${MIGRATE_CMD:-pnpm migrate}
