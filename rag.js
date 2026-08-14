const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const { listKnowledge, replaceKnowledge } = require('./storage');

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function chunkText(text, size = 650, overlap = 90) {
  const source = clean(text);
  if (!source) return [];
  const chunks = [];
  for (let start = 0; start < source.length; start += size - overlap) {
    const value = source.slice(start, start + size).trim();
    if (value) chunks.push(value);
    if (start + size >= source.length) break;
  }
  return chunks;
}

function tokens(value) {
  return new Set(clean(value).toLowerCase().split(/[^a-z0-9₹]+/).filter((item) => item.length > 1));
}

function ingestDocument({ text, metadata = {} }) {
  const chunks = chunkText(text);
  const records = chunks.map((chunk, index) => ({
    chunkId: uuid(),
    text: chunk,
    metadata: {
      source: metadata.source || 'local',
      company: metadata.company || undefined,
      category: metadata.category || 'general',
      documentType: metadata.documentType || 'text',
      url: metadata.url || undefined,
      country: metadata.country || 'IN',
      plan: metadata.plan || undefined,
      createdAt: new Date().toISOString(),
      index,
    },
  }));
  replaceKnowledge([...listKnowledge().filter((item) => item.metadata?.source !== metadata.source), ...records]);
  return records;
}

function ingestFile(filePath, metadata = {}) {
  return ingestDocument({ text: fs.readFileSync(path.resolve(filePath), 'utf8'), metadata: { ...metadata, source: metadata.source || path.basename(filePath) } });
}

function searchKnowledge(query, filters = {}, limit = 6) {
  const queryTokens = tokens(query);
  return listKnowledge()
    .filter((record) => Object.entries(filters).every(([key, value]) => !value || record.metadata?.[key] === value))
    .map((record) => {
      const recordTokens = tokens(`${record.text} ${Object.values(record.metadata || {}).join(' ')}`);
      let overlap = 0;
      queryTokens.forEach((token) => { if (recordTokens.has(token)) overlap += 1; });
      const recency = Math.max(0, 1 - ((Date.now() - new Date(record.metadata.createdAt).getTime()) / 31_536_000_000));
      return { ...record, score: Number((overlap * 3 + recency).toFixed(3)) };
    })
    .filter((record) => record.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(10, Math.max(1, limit)));
}

function buildResearchContext({ company, notes, bill, targetPrice }) {
  const query = [company, notes, bill?.planName, `target ${targetPrice}`].filter(Boolean).join(' ');
  const results = searchKnowledge(query, company ? { company } : {}, 5);
  return {
    sources: results.map(({ text, metadata, score }) => ({ text, metadata, score })),
    provider: results.length ? 'local-hybrid' : 'none',
    verified: results.length > 0,
  };
}

module.exports = { chunkText, ingestDocument, ingestFile, searchKnowledge, buildResearchContext };
