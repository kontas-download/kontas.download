// Makes sure the git-ignored extension list exists, so a fresh checkout builds without any add-on.
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(__dirname, '..', 'src', 'extensions', 'local.ts');
if (!fs.existsSync(target)) {
  fs.writeFileSync(target, fs.readFileSync(path.join(__dirname, '..', 'src', 'extensions', 'local.empty.ts'), 'utf8'));
}
