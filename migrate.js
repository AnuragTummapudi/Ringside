require('dotenv').config();

const persistence = require('./persistence');

async function main() {
  if (!persistence.usingNeon()) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL must be set before running migrations');
  }
  await persistence.init();
  console.log('Neon schema is ready.');
}

main().catch((error) => {
  console.error(`[MIGRATE] ${error.message}`);
  process.exit(1);
});
