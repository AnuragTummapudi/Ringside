const crypto = require('crypto');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const persistence = require('./persistence');

const SESSION_COOKIE = 'ringside_session';
const OAUTH_COOKIE = 'ringside_oauth';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const stateSecret = process.env.AUTH_SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(32).toString('hex'));

function configured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && googleRedirectUri() && stateSecret);
}

function googleRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI || (process.env.APP_URL ? `${String(process.env.APP_URL).replace(/\/$/, '')}/auth/google/callback` : '');
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name || user.email, avatarUrl: user.avatarUrl || null };
}

function cookieOptions(maxAge) {
  const configuredSameSite = String(process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  const sameSite = ['lax', 'strict', 'none'].includes(configuredSameSite) ? configuredSameSite : 'lax';
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.AUTH_COOKIE_SECURE === 'true',
    sameSite,
    path: '/',
    maxAge,
  };
}

function safeReturnTo(value) {
  const path = String(value || '/new');
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !/[\r\n]/.test(path) ? path : '/new';
}

function signature(value) {
  return crypto.createHmac('sha256', stateSecret).update(value).digest('base64url');
}

function makeOauthCookie(returnTo) {
  const state = crypto.randomBytes(24).toString('base64url');
  const encodedReturn = Buffer.from(safeReturnTo(returnTo)).toString('base64url');
  const payload = `${state}.${encodedReturn}`;
  return { state, value: `${payload}.${signature(payload)}` };
}

function readOauthCookie(value, receivedState) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3) return null;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = signature(payload);
  const received = parts[2];
  if (!receivedState || receivedState !== parts[0] || received.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return null;
  try { return safeReturnTo(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

async function attachUser(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    req.user = token ? await persistence.getUserForSession(token) : null;
    next();
  } catch (error) {
    next(error);
  }
}

function requireUser(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Sign in with Google before starting a negotiation', code: 'AUTH_REQUIRED' });
}

function registerAuthRoutes(app) {
  app.get('/api/auth/config', (_req, res) => res.json({ googleEnabled: configured(), persistence: persistence.usingNeon() ? 'neon' : 'local' }));
  app.get('/api/auth/me', (req, res) => res.json({ user: publicUser(req.user) }));

  app.get('/auth/google', (req, res) => {
    if (!configured()) return res.status(503).send('Google sign-in is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, and AUTH_SESSION_SECRET.');
    const oauth = makeOauthCookie(req.query.returnTo);
    res.cookie(OAUTH_COOKIE, oauth.value, cookieOptions(10 * 60 * 1000));
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: googleRedirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state: oauth.state,
      prompt: 'select_account',
    });
    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  app.get('/auth/google/callback', async (req, res, next) => {
    try {
      if (!configured()) return res.status(503).send('Google sign-in is not configured.');
      const returnTo = readOauthCookie(req.cookies?.[OAUTH_COOKIE], req.query.state);
      res.clearCookie(OAUTH_COOKIE, cookieOptions(0));
      if (!returnTo || !req.query.code) return res.status(400).send('Invalid or expired Google sign-in request.');

      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
      const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
      const ticket = await client.verifyIdToken({ idToken: tokenResponse.data.id_token, audience: process.env.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email || !profile.email_verified) return res.status(403).send('Google did not provide a verified email address.');

      const user = await persistence.upsertUser({ googleSubject: profile.sub, email: profile.email, name: profile.name, avatarUrl: profile.picture });
      const sessionToken = crypto.randomBytes(32).toString('base64url');
      await persistence.createSession(user.id, sessionToken, new Date(Date.now() + SESSION_TTL_MS));
      res.cookie(SESSION_COOKIE, sessionToken, cookieOptions(SESSION_TTL_MS));
      return res.redirect(returnTo);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const token = req.cookies?.[SESSION_COOKIE];
      if (token) await persistence.deleteSession(token);
      res.clearCookie(SESSION_COOKIE, cookieOptions(0));
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { attachUser, requireUser, registerAuthRoutes, publicUser, configured, SESSION_COOKIE };
