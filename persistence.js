const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const { neon } = require('@neondatabase/serverless');
const local = require('./storage');

const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '';
const sql = databaseUrl ? neon(databaseUrl) : null;
let initialized = false;
let initializing = null;

function usingNeon() {
  return Boolean(sql);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function asIso(value) {
  return value ? new Date(value).toISOString() : null;
}

async function init() {
  if (!sql || initialized) return;
  if (initializing) return initializing;
  initializing = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      google_subject TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
      id UUID PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON auth_sessions(token_hash)`;
    await sql`CREATE TABLE IF NOT EXISTS negotiations (
      call_id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS negotiations_user_started_idx ON negotiations(user_id, started_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS bill_documents (
      bill_id TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS bill_documents_user_created_idx ON bill_documents(user_id, created_at DESC)`;
    initialized = true;
  })();
  try {
    await initializing;
  } finally {
    initializing = null;
  }
}

async function upsertUser(profile) {
  const record = {
    id: profile.id || uuid(),
    googleSubject: profile.googleSubject,
    email: profile.email.toLowerCase(),
    name: profile.name || null,
    avatarUrl: profile.avatarUrl || null,
  };
  if (!sql) return local.upsertUser(record);
  await init();
  const rows = await sql`
    INSERT INTO users (id, google_subject, email, name, avatar_url)
    VALUES (${record.id}, ${record.googleSubject}, ${record.email}, ${record.name}, ${record.avatarUrl})
    ON CONFLICT (google_subject) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = NOW()
    RETURNING id, google_subject, email, name, avatar_url
  `;
  const user = rows[0];
  return { id: user.id, googleSubject: user.google_subject, email: user.email, name: user.name, avatarUrl: user.avatar_url };
}

async function createSession(userId, token, expiresAt) {
  const record = { id: uuid(), userId, tokenHash: tokenHash(token), expiresAt: asIso(expiresAt) };
  if (!sql) return local.createSession(record);
  await init();
  await sql`INSERT INTO auth_sessions (id, user_id, token_hash, expires_at) VALUES (${record.id}, ${record.userId}, ${record.tokenHash}, ${record.expiresAt})`;
  return record;
}

async function getUserForSession(token) {
  const hash = tokenHash(token);
  if (!sql) {
    const session = local.getSession(hash);
    return session ? local.getUserById(session.userId) : null;
  }
  await init();
  const rows = await sql`
    SELECT u.id, u.google_subject, u.email, u.name, u.avatar_url
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hash} AND s.expires_at > NOW()
    LIMIT 1
  `;
  const user = rows[0];
  return user ? { id: user.id, googleSubject: user.google_subject, email: user.email, name: user.name, avatarUrl: user.avatar_url } : null;
}

async function deleteSession(token) {
  const hash = tokenHash(token);
  if (!sql) return local.deleteSession(hash);
  await init();
  await sql`DELETE FROM auth_sessions WHERE token_hash = ${hash}`;
}

async function upsertNegotiation(record) {
  if (!sql) return local.upsertNegotiation(record);
  await init();
  await sql`
    INSERT INTO negotiations (call_id, user_id, status, started_at, ended_at, data)
    VALUES (${record.callId}, ${record.userId}, ${record.status}, ${record.startedAt}, ${record.endedAt || null}, ${JSON.stringify(record)})
    ON CONFLICT (call_id) DO UPDATE SET
      status = EXCLUDED.status,
      ended_at = EXCLUDED.ended_at,
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
  return record;
}

async function getNegotiation(callId, userId) {
  if (!sql) {
    const record = local.getNegotiation(callId);
    return record && record.userId === userId ? record : null;
  }
  await init();
  const rows = await sql`SELECT data FROM negotiations WHERE call_id = ${callId} AND user_id = ${userId} LIMIT 1`;
  return parseJson(rows[0]?.data);
}

async function listNegotiations(userId) {
  if (!sql) return local.listNegotiations().filter((record) => record.userId === userId);
  await init();
  const rows = await sql`SELECT data FROM negotiations WHERE user_id = ${userId} ORDER BY started_at DESC`;
  return rows.map((row) => parseJson(row.data)).filter(Boolean);
}

async function upsertBill(record) {
  if (!sql) return local.upsertBill(record);
  await init();
  await sql`
    INSERT INTO bill_documents (bill_id, user_id, data)
    VALUES (${record.billId}, ${record.userId}, ${JSON.stringify(record)})
    ON CONFLICT (bill_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
  return record;
}

module.exports = {
  usingNeon,
  init,
  upsertUser,
  createSession,
  getUserForSession,
  deleteSession,
  upsertNegotiation,
  getNegotiation,
  listNegotiations,
  upsertBill,
};
