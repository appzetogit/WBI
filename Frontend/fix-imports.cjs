const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

walk('./src', (filePath) => {
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Look for static imports of pushNotificationService
    const importRegex = /import\s*{\s*([^}]+)\s*}\s*from\s*['"]([^'"]*pushNotificationService)['"]/g;
    
    let modified = false;
    content = content.replace(importRegex, (match, importsStr, modulePath) => {
      modified = true;
      const imports = importsStr.split(',').map(s => s.trim());
      
      let wrapperCode = `const getPushService = () => import('${modulePath}');\n`;
      imports.forEach(func => {
        wrapperCode += `const ${func} = async (...args) => (await getPushService()).${func}(...args);\n`;
      });
      
      return wrapperCode;
    });
    
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Fixed:', filePath);
    }
  }
});
