#!/usr/bin/env bash
set -euo pipefail
cd /workspace/pulso-fit
if ! docker container inspect pulso-fit-postgres >/dev/null 2>&1; then
  docker volume create pulso-fit-pgdata >/dev/null
  docker compose up -d postgres
else
  docker start pulso-fit-postgres >/dev/null
fi
for attempt in $(seq 1 30); do
  if docker exec pulso-fit-postgres pg_isready -U pulso -d pulso_fit >/dev/null; then exit 0; fi
  sleep 1
done
echo 'PostgreSQL não ficou pronto.' >&2
exit 1
