const fs = require('fs');
const path = require('path');

const replacements = {
  'â‚¹': '₹',
  'â€¢': '•',
  'âš¡': '⚡',
  'âœ“': '✓',
  'â ±': '⏱',
  'â ¤ï¸ ': '❤️',
  'â­ ': '⭐',
  'â€”': '—'
};

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules') {
        walkDir(fullPath);
      }
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const [bad, good] of Object.entries(replacements)) {
        if (content.includes(bad)) {
          content = content.split(bad).join(good);
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Fixed: ${fullPath}`);
      }
    }
  }
}

walkDir(path.join(__dirname, 'Frontend', 'src'));
