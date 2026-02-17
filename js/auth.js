/**
 * Auth module — handles Supabase email/password authentication
 *
 * Lifecycle:
 * 1. On app load: Auth.init() fetches config, creates Supabase client, checks session
 * 2. Login/Signup: Uses Supabase Auth JS (email + password)
 * 3. On first login: migrates localStorage history to Supabase via /api/auth/migrate
 * 4. Session state drives UI (logged-in vs anonymous)
 */

const Auth = {
  supabase: null,
  user: null,       // Supabase auth user
  profile: null,    // { handle } from user_profiles
  _ready: false,
  _readyPromise: null,
  _readyResolve: null,

  /**
   * Initialize auth — fetch config and restore session.
   * Returns a promise that resolves when auth state is known.
   */
  async init() {
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });

    try {
      const resp = await fetch('/api/auth/config');
      if (!resp.ok) {
        console.warn('Auth not configured (no SUPABASE_ANON_KEY), running in anonymous mode');
        this._finishInit();
        return;
      }
      const { url, anonKey } = await resp.json();

      // Create browser-side Supabase client
      this.supabase = window.supabase.createClient(url, anonKey);

      // Listen for auth state changes
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.user = session?.user || null;
        this._updateUI();
      });

      // Check current session
      const { data: { session } } = await this.supabase.auth.getSession();
      this.user = session?.user || null;

      if (this.user) {
        await this._loadProfile();
        // Restore user's history from Supabase
        await this._hydrateLocalStorage();
      }
    } catch (err) {
      console.warn('Auth init failed, running in anonymous mode:', err.message);
    }

    this._finishInit();
  },

  _finishInit() {
    this._ready = true;
    if (this._readyResolve) this._readyResolve();
    this._updateUI();
  },

  /**
   * Wait for auth to be ready
   */
  whenReady() {
    if (this._ready) return Promise.resolve();
    return this._readyPromise;
  },

  /**
   * Sign up with email + password + handle
   */
  async signUp(email, password, handle) {
    if (!this.supabase) throw new Error('Auth not available');

    // 1. Create auth user
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password
    });

    if (error) throw error;
    if (!data.user) throw new Error('Signup failed — no user returned');

    // 2. Create profile with handle
    const session = data.session;
    if (session) {
      const profileResp = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ handle })
      });

      if (!profileResp.ok) {
        const err = await profileResp.json();
        // Clean up: auth user exists but profile failed — user can retry handle later
        throw new Error(err.error || 'Failed to create profile');
      }

      this.profile = { handle };

      // 3. Migrate localStorage data
      await this._migrateLocalData(session.access_token);
    }

    this.user = data.user;
    this._updateUI();
    return data;
  },

  /**
   * Log in with email + password
   */
  async logIn(email, password) {
    if (!this.supabase) throw new Error('Auth not available');

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    this.user = data.user;
    await this._loadProfile();

    // Migrate any localStorage data accumulated while logged out
    if (data.session) {
      await this._migrateLocalData(data.session.access_token);
    }

    // Load user's history from Supabase into localStorage
    await this._hydrateLocalStorage();

    // Refresh game state and UI
    Game.seenQuestions = Storage.getSeenQuestions();
    this._updateUI();
    if (typeof UI !== 'undefined' && UI.updateStats) {
      UI.updateStats();
    }

    return data;
  },

  /**
   * Log out
   */
  async logOut() {
    if (!this.supabase) return;

    await this.supabase.auth.signOut();
    this.user = null;
    this.profile = null;
    this._updateUI();
  },

  /**
   * Load user profile (handle) from user_profiles
   */
  async _loadProfile() {
    if (!this.supabase || !this.user) return;

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('handle')
      .eq('id', this.user.id)
      .single();

    if (!error && data) {
      this.profile = { handle: data.handle };
    }
  },

  /**
   * Migrate localStorage history to Supabase on first login.
   * Non-destructive: keeps localStorage data until migration succeeds.
   */
  async _migrateLocalData(accessToken) {
    try {
      const history = Storage.loadHistory();
      if (history.length === 0) return;

      // Transform to API format (full answer data)
      const responses = history
        .filter(h => h.questionId)
        .map(h => ({
          questionId: h.questionId,
          userLow: h.userLow,
          userHigh: h.userHigh,
          confidence: h.confidence,
          correctAnswer: h.correctAnswer,
          isCorrect: h.isCorrect,
          answeredAt: h.timestamp || Date.now()
        }));

      if (responses.length === 0) return;

      const resp = await fetch('/api/auth/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ responses })
      });

      if (resp.ok) {
        console.log('Migrated', responses.length, 'responses to Supabase');
        // Clear localStorage after successful migration
        Storage.clearHistory();
      } else {
        console.warn('Migration failed, keeping localStorage data');
      }
    } catch (err) {
      console.warn('Migration error (non-fatal):', err.message);
    }
  },

  /**
   * Save a response to Supabase (called after each answer when logged in)
   */
  async saveResponse(answerData) {
    if (!this.supabase || !this.user) return false;

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) return false;

      const score = Scoring.normalizeLogScore(
        Math.max(
          Scoring.calculateLogScore(
            answerData.userLow, answerData.userHigh,
            answerData.confidence, answerData.correctAnswer
          ),
          Scoring.LOG_SCORE_FLOOR
        )
      );

      const { error } = await this.supabase
        .from('user_responses')
        .insert({
          user_id: this.user.id,
          question_id: answerData.questionId,
          answer: (answerData.userLow + answerData.userHigh) / 2,
          user_low: answerData.userLow,
          user_high: answerData.userHigh,
          correct_answer: answerData.correctAnswer,
          is_correct: answerData.isCorrect,
          score: score,
          confidence: answerData.confidence
        });

      if (error) {
        console.warn('Failed to save response to Supabase:', error.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('Save response error:', err.message);
      return false;
    }
  },

  /**
   * Load response history from Supabase (for logged-in users)
   */
  async loadHistory() {
    if (!this.supabase || !this.user) return null;

    try {
      const { data, error } = await this.supabase
        .from('user_responses')
        .select('question_id, user_low, user_high, correct_answer, is_correct, confidence, answered_at')
        .eq('user_id', this.user.id)
        .order('answered_at', { ascending: true });

      if (error) {
        console.warn('Failed to load history from Supabase:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('Load history error:', err.message);
      return null;
    }
  },

  /**
   * Hydrate localStorage from Supabase history.
   * Called on login to restore user's history for stats display.
   */
  async _hydrateLocalStorage() {
    if (!this.supabase || !this.user) return;

    try {
      const supabaseHistory = await this.loadHistory();
      if (!supabaseHistory || supabaseHistory.length === 0) return;

      // Transform Supabase format to localStorage format
      const localHistory = supabaseHistory
        .filter(r => r.user_low != null && r.user_high != null && r.correct_answer != null)
        .map(r => ({
          questionId: r.question_id,
          userLow: r.user_low,
          userHigh: r.user_high,
          confidence: r.confidence,
          correctAnswer: r.correct_answer,
          isCorrect: r.is_correct,
          timestamp: new Date(r.answered_at).getTime()
        }));

      if (localHistory.length === 0) return;

      // Replace localStorage with Supabase data
      localStorage.setItem(Storage.KEYS.HISTORY, JSON.stringify(localHistory));

      // Also restore seen questions list
      const seenIds = localHistory.map(h => h.questionId);
      localStorage.setItem(Storage.KEYS.SEEN_QUESTIONS, JSON.stringify(seenIds));

      console.log('Loaded', localHistory.length, 'responses from Supabase');
    } catch (err) {
      console.warn('Hydrate localStorage error:', err.message);
    }
  },

  /**
   * Check if user is logged in
   */
  isLoggedIn() {
    return !!this.user;
  },

  /**
   * Get display name (handle or email prefix)
   */
  getDisplayName() {
    if (this.profile?.handle) return this.profile.handle;
    if (this.user?.email) return this.user.email.split('@')[0];
    return null;
  },

  /**
   * Get access token for API calls
   */
  async getAccessToken() {
    if (!this.supabase) return null;
    const { data: { session } } = await this.supabase.auth.getSession();
    return session?.access_token || null;
  },

  /**
   * Update UI based on auth state
   */
  _updateUI() {
    const authBtn = document.getElementById('auth-btn');
    const userInfo = document.getElementById('user-info');
    const userHandle = document.getElementById('user-handle');

    if (!authBtn) return; // UI not ready yet

    if (this.isLoggedIn()) {
      authBtn.textContent = 'Log Out';
      authBtn.onclick = () => this.logOut();
      if (userInfo) userInfo.classList.add('visible');
      if (userHandle) userHandle.textContent = this.getDisplayName();
    } else {
      authBtn.textContent = 'Log In';
      authBtn.onclick = () => AuthUI.showModal();
      if (userInfo) userInfo.classList.remove('visible');
      if (userHandle) userHandle.textContent = '';
    }
  }
};

/**
 * AuthUI — handles the login/signup modal
 */
const AuthUI = {
  /**
   * Show the auth modal
   */
  showModal(mode = 'login') {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.add('active');
    this.switchMode(mode);
    // Focus first input
    setTimeout(() => {
      const firstInput = modal.querySelector('input:not([type=hidden])');
      if (firstInput) firstInput.focus();
    }, 100);
  },

  /**
   * Hide the auth modal
   */
  hideModal() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;
    modal.classList.remove('active');
    this.clearErrors();
  },

  /**
   * Switch between login and signup modes
   */
  switchMode(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginTab = document.getElementById('auth-tab-login');
    const signupTab = document.getElementById('auth-tab-signup');

    if (mode === 'signup') {
      loginForm.style.display = 'none';
      signupForm.style.display = 'block';
      loginTab.classList.remove('active');
      signupTab.classList.add('active');
    } else {
      loginForm.style.display = 'block';
      signupForm.style.display = 'none';
      loginTab.classList.add('active');
      signupTab.classList.remove('active');
    }

    this.clearErrors();
  },

  /**
   * Show error message in the auth modal
   */
  showError(formId, message) {
    const errorEl = document.querySelector(`#${formId} .auth-error`);
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  },

  /**
   * Clear all error messages
   */
  clearErrors() {
    document.querySelectorAll('.auth-error').forEach(el => {
      el.textContent = '';
      el.classList.remove('visible');
    });
  },

  /**
   * Handle login form submit
   */
  async handleLogin(e) {
    e.preventDefault();
    const form = e.target;
    const email = form.querySelector('[name="email"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!email || !password) {
      AuthUI.showError('login-form', 'Email and password are required');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
      await Auth.logIn(email, password);
      AuthUI.hideModal();
    } catch (err) {
      AuthUI.showError('login-form', err.message || 'Login failed');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  },

  /**
   * Handle signup form submit
   */
  async handleSignup(e) {
    e.preventDefault();
    const form = e.target;
    const handle = form.querySelector('[name="handle"]').value.trim();
    const email = form.querySelector('[name="email"]').value.trim();
    const password = form.querySelector('[name="password"]').value;
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!handle || !email || !password) {
      AuthUI.showError('signup-form', 'All fields are required');
      return;
    }

    if (password.length < 6) {
      AuthUI.showError('signup-form', 'Password must be at least 6 characters');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account...';

    try {
      await Auth.signUp(email, password, handle);
      AuthUI.hideModal();
    } catch (err) {
      AuthUI.showError('signup-form', err.message || 'Signup failed');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
    }
  },

  /**
   * Initialize event listeners for auth UI
   */
  init() {
    // Tab switching
    const loginTab = document.getElementById('auth-tab-login');
    const signupTab = document.getElementById('auth-tab-signup');
    if (loginTab) loginTab.addEventListener('click', () => this.switchMode('login'));
    if (signupTab) signupTab.addEventListener('click', () => this.switchMode('signup'));

    // Form submissions
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    if (signupForm) signupForm.addEventListener('submit', (e) => this.handleSignup(e));

    // Close modal on backdrop click
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideModal();
      });
    }

    // Close button
    const closeBtn = document.getElementById('auth-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideModal());
  }
};
