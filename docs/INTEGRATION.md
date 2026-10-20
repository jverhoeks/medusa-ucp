# Real Medusa fixture

Use Node 22/npm 11.19.0. This fixture creates only fictional local products; it must
never target a deployed database. The seed checks localhost, a database name
beginning `ucp_fixture_`, and the absence of a previous fixture state file. If a
seed fails midway, fix the cause and use a fresh disposable database rather than
rerunning against live or business data. It does not drop databases automatically.

1. `npm ci` and `npm run build` at repository root.
2. Start a disposable PostgreSQL 16 instance bound to loopback and create a fresh
   database, for example `ucp_fixture_example`. Use a fixture-only role/password.
3. Set `DATABASE_URL=postgres://FIXTURE_ROLE:FIXTURE_PASSWORD@localhost:5437/ucp_fixture_example`.
   Set `NODE_PATH` to this repository's absolute `node_modules` directory. No Stripe,
   email, production secret loader or external database is involved.
4. From `integration/app`, run `../../node_modules/.bin/medusa db:migrate` and wait
   for successful completion. Then run
   `../../node_modules/.bin/medusa exec ./src/scripts/seed-fixture.ts`.
5. Start `NODE_ENV=development ../../node_modules/.bin/medusa start --host localhost -p9003` from that same directory with
   the same fixture environment. This source-mode command is for local integration
   testing; deployed applications must use their normal compiled-server procedure.
6. From the repository root, run `node integration/verify.mjs` after readiness.
7. Stop the owned server and disposable PostgreSQL container. Preserve its data
   until no longer needed; no volume/database deletion is part of this recipe.

The three fictional products cost EUR 35, 45 and 70. The query with a EUR 50 maximum
must return the two cheaper offers over both REST and an official MCP SDK client.
This proves real Medusa plugin route/middleware registration, publishable-key
sales-channel links, region/tax-inclusive price calculation and projection. It
also checks lookup by real variant ID, details with exact option selection and
all three root discovery URLs. Generated `.fixture-state.json` is ignored and
excluded from packages.

The runtime integration test was executed with Medusa 2.21.2/PostgreSQL 16 on a
fresh local database. It is separate from unit/HTTP/schema tests and does not
claim a live shop deployment, Stripe integration or full upstream certification.
