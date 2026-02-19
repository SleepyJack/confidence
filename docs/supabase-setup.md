# Supabase Database Setup

All database objects are defined in a single file: `sql/schema.sql`. It creates the `questions`, `user_profiles`, and `user_responses` tables along with extensions, indexes, RPC functions, and Row Level Security policies.

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Project URL (e.g. `https://xyz.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only, bypasses RLS) |
| `SUPABASE_ANON_KEY` | Anon/public key (safe to expose to browser, used for client-side auth) |

Set these in your Vercel project settings for production, and in your shell (or `.env`) for local development and tests.

## Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free project
2. Copy the **Project URL**, **anon key**, and **service_role key** from Settings → API

## Production Schema

1. Open your Supabase project → **SQL Editor**
2. Paste the contents of `sql/schema.sql` and run it

This creates everything the app needs: tables, indexes, RPC functions, and RLS policies.

### Expose the test schema to PostgREST (if using tests)

After setting up the test schema (see below), expose it so the service role can query it:

```sql
ALTER ROLE authenticator SET pgrst.db_extra_search_path TO 'public', 'test';
NOTIFY pgrst, 'reload config';
```

## Test Schema

Integration tests run against a separate `test` schema in the same Supabase project, so they never touch production data.

1. Open the **SQL Editor**
2. Paste `sql/setup-test-schema.sql` into the editor
3. Paste `sql/schema.sql` immediately after it (in the same editor session)
4. Run the combined SQL as a single batch
5. Expose the `test` schema to PostgREST (see SQL snippet above)

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
