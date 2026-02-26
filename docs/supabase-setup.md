# Supabase Database Setup

All database objects are defined in a single file: `sql/schema.sql`. It creates the `questions`, `user_profiles`, `user_responses`, and `response_stats` tables along with extensions, indexes, RPC functions, and Row Level Security policies.

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

## Auth Configuration

### URL Configuration

Go to **Authentication → URL Configuration**:

- **Site URL** — set to your primary production URL (custom domain if you have one, otherwise the Vercel URL). This is where Supabase redirects users after they click a confirmation link.
- **Redirect URLs** — add every other URL the app runs at. Supabase will refuse to redirect to anything not on this list.

Typical setup:

| URL | Where to add it |
|---|---|
| `https://yourcustomdomain.com` | Site URL |
| `https://your-project.vercel.app` | Redirect URLs |
| `http://localhost:3000` | Redirect URLs |

If you don't have a custom domain yet, set the Vercel URL as the Site URL and add `localhost` to Redirect URLs.

### Email Confirmation

Email confirmation is controlled by `auth.emailConfirmation` in `config.json`. Set it to `true` to require users to verify their email before logging in, or `false` to auto-confirm (useful during development).

To enable it:
1. Set `"emailConfirmation": true` in `config.json`
2. Go to **Authentication → Email** in Supabase and ensure **Enable email confirmations** is on
3. Ensure your Site URL and Redirect URLs are configured (see above) — the confirmation link will redirect there

### Custom SMTP (Resend)

Supabase's built-in email service is rate-limited to 3 emails/hour and has poor deliverability. For production, use a custom SMTP provider. [Resend](https://resend.com) is the easiest option — free tier covers 3,000 emails/month.

**1. Set up Resend**

1. Create a free account at [resend.com](https://resend.com)
2. Go to **Domains** and add your domain (e.g. `yourdomain.com`)
3. Add the DNS records Resend provides (DKIM, SPF, DMARC) — your DNS provider will have a TXT/CNAME records section
4. Wait for verification (usually a few minutes)
5. Go to **API Keys** → **Create API Key** → copy it

**2. Configure Supabase**

Go to **Project Settings → Auth → SMTP Settings** and enable **Custom SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API key |
| Sender email | `noreply@yourdomain.com` (must match your verified domain) |
| Sender name | Whatever you want shown in the From field |

Save and send a test email to confirm it's working.

> **Note:** If you haven't verified a domain yet, Resend allows sending from `onboarding@resend.dev` for testing, but this won't work for production.

### Email Templates

You can customise the confirmation and password reset emails at **Authentication → Email Templates**. Available template variables include `{{ .ConfirmationURL }}`, `{{ .Email }}`, and `{{ .SiteURL }}`.

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
