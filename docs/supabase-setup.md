# Supabase Database Setup

The app stores questions in a Supabase Postgres database. Both production and integration tests use the same schema DDL (`sql/schema.sql`).

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only, bypasses RLS) |

Set these in your Vercel project settings for production, and in your shell (or `.env`) for local development and tests.

## Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Copy the **Project URL** and **service_role key** from Settings → API

## Production Schema

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `sql/schema.sql` and run it

This creates the `questions` table, indexes, the `check_duplicate_summary` RPC function, and enables Row Level Security in the `public` schema.

## Test Schema

Integration tests run against a separate `test` schema in the same Supabase project, so they never touch production data.

1. Open the **SQL Editor**
2. Paste `sql/setup-test-schema.sql` into the editor
3. Paste `sql/schema.sql` immediately after it (in the same editor session)
4. Run the combined SQL as a single batch
5. Expose the `test` schema to PostgREST: go to **Settings → API → Exposed schemas** and add `test` (or run the SQL below)

```sql
ALTER ROLE authenticator SET pgrst.db_extra_search_path TO 'public', 'test';
NOTIFY pgrst, 'reload config';
```

The `setup-test-schema.sql` file sets `search_path = test`, so `schema.sql` creates everything inside the `test` schema. The GRANT statements at the end give the `service_role` access to the test schema.

## Running Integration Tests

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

npm run test:integration
```

The test runner sets `SUPABASE_SCHEMA=test` automatically (see `package.json`).

## Running Unit Tests

Unit tests don't need a database:

```bash
npm test
```
