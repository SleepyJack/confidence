/**
 * Register endpoint — creates a user with optional auto-confirmation
 * Used when emailConfirmation is disabled in config.json
 *
 * Expects: POST { email, password, handle }
 *
 * Flow:
 * 1. Creates auth user via admin API (with email_confirm: true if configured)
 * 2. Creates user_profiles row with handle
 * 3. Returns user data for client to sign in
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load config.json
let appConfig = {};
try {
  const configPath = path.join(__dirname, '../../config.json');
  appConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
  console.warn('Failed to load config.json:', err.message);
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, handle } = req.body || {};

  // Validate inputs
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!handle || typeof handle !== 'string') {
    return res.status(400).json({ error: 'Handle is required' });
  }

  // Validate handle format
  const trimmedHandle = handle.trim();
  if (trimmedHandle.length < 2 || trimmedHandle.length > 30) {
    return res.status(400).json({ error: 'Handle must be 2-30 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmedHandle)) {
    return res.status(400).json({ error: 'Handle can only contain letters, numbers, hyphens, and underscores' });
  }

  try {
    const serviceClient = getServiceClient();
    const skipConfirmation = appConfig.auth?.emailConfirmation === false;

    // Check if handle is already taken
    const { data: existingHandle } = await serviceClient
      .from('user_profiles')
      .select('id')
      .eq('handle', trimmedHandle)
      .single();

    if (existingHandle) {
      return res.status(409).json({ error: 'Handle already taken' });
    }

    // Create auth user via admin API
    const createOptions = {
      email: email.trim().toLowerCase(),
      password,
      email_confirm: skipConfirmation // Auto-confirm if email confirmation is disabled
    };

    const { data: userData, error: createError } = await serviceClient.auth.admin.createUser(createOptions);

    if (createError) {
      if (createError.message.includes('already been registered')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      console.error('User creation error:', createError);
      return res.status(500).json({ error: createError.message || 'Failed to create user' });
    }

    if (!userData.user) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Create user profile
    const { error: profileError } = await serviceClient
      .from('user_profiles')
      .insert({ id: userData.user.id, handle: trimmedHandle });

    if (profileError) {
      // Clean up: delete the auth user if profile creation fails
      await serviceClient.auth.admin.deleteUser(userData.user.id);

      if (profileError.code === '23505' && profileError.message.includes('handle')) {
        return res.status(409).json({ error: 'Handle already taken' });
      }
      console.error('Profile creation error:', profileError);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    res.status(201).json({
      user: {
        id: userData.user.id,
        email: userData.user.email
      },
      handle: trimmedHandle,
      confirmationRequired: !skipConfirmation
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
