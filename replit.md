# Missie Maaike

Een Nederlandstalige raadselmissie voor vier gasten die samen naar Maaikes verjaardagsdiner worden geleid.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/missie-maaike run dev` — run the website
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required environment: `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_CODE`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/missie-maaike/` — player website, admin control room, and practice mini-games.
- `artifacts/api-server/src/lib/mission-data.ts` — private player codes, puzzle answers, hints, and event schedule.
- `artifacts/api-server/src/routes/mission.ts` — session, answer validation, shared progress, and timed reveals.
- `lib/db/src/schema/mission-answers.ts` — persistent answers and progress.
- `lib/api-spec/openapi.yaml` — source contract for generated API hooks and validation schemas.

## Architecture decisions

- Puzzle answer keys and access codes stay on the server; locked question text and final locations are withheld until release.
- The Morse alphabet hint stays withheld server-side until five minutes after a player's first dossier opening.
- Player and admin sessions use signed, HttpOnly cookies; `SESSION_SECRET` signs sessions and `ADMIN_CODE` grants control-room access.
- The four personal coordinate fragments unlock the group gate; shared progress is stored in PostgreSQL.
- The restaurant coordinates are revealed to all players immediately after all four personal answers are correct, with arrival time 18:15.
- Puzzle release timing is fixed for 31 October 2026 in the Netherlands (UTC+01:00).

## Product

- Four guests use personal codes to solve timed dossiers, see shared progress, combine their personal coordinate fragments, and reveal the restaurant location.
- A separate admin view monitors all four players and the answer log.
- Primary device is a mobile phone; tablet is secondary. Desktop use is not a priority.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
