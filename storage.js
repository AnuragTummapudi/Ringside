const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'ringside.json');

function emptyStore() {
  return { negotiations: [], bills: [], knowledge: [], users: [], sessions: [] };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(emptyStore(), null, 2));
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}

function writeStore(store) {
  ensureStore();
  const temp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2));
  fs.renameSync(temp, STORE_FILE);
}

function upsertNegotiation(record) {
  const store = readStore();
  const index = store.negotiations.findIndex((item) => item.callId === record.callId);
  if (index >= 0) store.negotiations[index] = { ...store.negotiations[index], ...record };
  else store.negotiations.unshift(record);
  writeStore(store);
  return record;
}

function listNegotiations() {
  return readStore().negotiations.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
}

function getNegotiation(callId) {
  return listNegotiations().find((item) => item.callId === callId) || null;
}

function upsertBill(record) {
  const store = readStore();
  const index = store.bills.findIndex((item) => item.billId === record.billId);
  if (index >= 0) store.bills[index] = { ...store.bills[index], ...record };
  else store.bills.unshift(record);
  writeStore(store);
  return record;
}

function listKnowledge() {
  return readStore().knowledge;
}

function replaceKnowledge(knowledge) {
  const store = readStore();
  store.knowledge = knowledge;
  writeStore(store);
  return knowledge;
}

function upsertUser(user) {
  const store = readStore();
  const index = store.users.findIndex((item) => item.googleSubject === user.googleSubject);
  if (index >= 0) store.users[index] = { ...store.users[index], ...user };
  else store.users.push(user);
  writeStore(store);
  return index >= 0 ? store.users[index] : user;
}

function getUserById(userId) {
  return readStore().users.find((item) => item.id === userId) || null;
}

function createSession(session) {
  const store = readStore();
  store.sessions = store.sessions.filter((item) => item.expiresAt > new Date().toISOString());
  store.sessions.push(session);
  writeStore(store);
  return session;
}

function getSession(tokenHash) {
  const session = readStore().sessions.find((item) => item.tokenHash === tokenHash && item.expiresAt > new Date().toISOString());
  return session || null;
}

function deleteSession(tokenHash) {
  const store = readStore();
  store.sessions = store.sessions.filter((item) => item.tokenHash !== tokenHash);
  writeStore(store);
}

module.exports = {
  DATA_DIR,
  STORE_FILE,
  ensureStore,
  upsertNegotiation,
  listNegotiations,
  getNegotiation,
  upsertBill,
  listKnowledge,
  replaceKnowledge,
  upsertUser,
  getUserById,
  createSession,
  getSession,
  deleteSession,
};
