const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const modelsPath = path.join(__dirname, 'models');
const files = fs.readdirSync(modelsPath).filter(f => f.endsWith('.js'));

const originalWarn = console.warn;
console.warn = (...args) => {
  originalWarn('WARNING_FOUND:', ...args);
};

for (const file of files) {
  try {
    mongoose.models = {};
    mongoose.modelSchemas = {};
    
    console.warn = (...args) => {
      originalWarn(`[${file}]`, ...args);
    };
    
    require(path.join(modelsPath, file));
    
  } catch(e) {
  }
}
console.warn = originalWarn;
console.log('Done testing models.');
