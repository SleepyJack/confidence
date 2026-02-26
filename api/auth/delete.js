/**
 * Delete account endpoint — permanently deletes the user and all their data.
 *
 * The database schema uses ON DELETE CASCADE, so deleting from auth.users
 * automatically removes all user_profiles and user_responses.
 *
 * Method: DELETE
 * Auth: Bearer token (Supabase JWT)
 */

const { createClient } = require('@supabase/supabase-js');
const { createRateLimiter } = require('../_lib/rate-limit');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  return createClient(url, key);
}

const deleteLimiter = createRateLimiter('delete');

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (deleteLimiter.check(req, res)) return;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const accessToken = authHeader.slice(7);

  try {
    const serviceClient = getServiceClient();

    // Verify the token and get user
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(accessToken);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Delete the user (CASCADE will remove profiles and responses)
    const { error: deleteError } = await serviceClient.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error('Delete user error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete account' });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
