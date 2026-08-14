const fs = require('fs');
const path = require('path');

const assetsDirectory = path.join(__dirname, '..', 'public', 'assets');

if (fs.existsSync(assetsDirectory)) {
  for (const entry of fs.readdirSync(assetsDirectory)) {
    fs.rmSync(path.join(assetsDirectory, entry), { force: true, recursive: true });
  }
}
