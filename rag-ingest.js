require('dotenv').config();
const path = require('path');
const { ingestFile } = require('./rag');

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run rag:ingest -- path/to/document.txt');
  process.exit(1);
}

const records = ingestFile(path.resolve(input), {
  source: path.basename(input),
  category: process.argv[3] || 'general',
  company: process.argv[4] || undefined,
});
console.log(`Ingested ${records.length} local knowledge chunks from ${path.basename(input)}`);
