/**
 * Signup endpoint — creates a user_profile row with a handle
 * after the user has signed up via Supabase Auth on the client side.
 *
 * Expects: POST { handle }
 * Auth: Bearer token (Supabase JWT from client)
 *
 * Flow:
 * 1. Client calls supabase.auth.signUp() — creates auth.users row
 * 2. Client calls POST /api/auth/signup with { handle } — creates user_profiles row
 */

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

function getUserClient(url, anonKey, accessToken) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Extract JWT from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const accessToken = authHeader.slice(7);

  const { handle } = req.body || {};
  if (!handle || typeof handle !== 'string') {
    return res.status(400).json({ error: 'Handle is required' });
  }

  // Validate handle format
  const trimmed = handle.trim();
  if (trimmed.length < 2 || trimmed.length > 30) {
    return res.status(400).json({ error: 'Handle must be 2-30 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return res.status(400).json({ error: 'Handle can only contain letters, numbers, hyphens, and underscores' });
  }

  try {
    // Verify the JWT and get user ID using service client
    const serviceClient = getServiceClient();
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Insert user profile using service client (bypasses RLS)
    const { error: insertError } = await serviceClient
      .from('user_profiles')
      .insert({ id: user.id, handle: trimmed });

    if (insertError) {
      if (insertError.code === '23505') {
        // Unique constraint violation
        if (insertError.message.includes('handle')) {
          return res.status(409).json({ error: 'Handle already taken' });
        }
        // Profile already exists for this user
        return res.status(409).json({ error: 'Profile already exists' });
      }
      console.error('Profile insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    res.status(201).json({ handle: trimmed, id: user.id });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
