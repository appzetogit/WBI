const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const modelsPath = path.join(__dirname, 'models');
const files = fs.readdirSync(modelsPath).filter(f => f.endsWith('.js'));

files.forEach(file => {
  try {
    require(path.join(modelsPath, file));
  } catch(e) {}
});

for (const modelName of Object.keys(mongoose.models)) {
  const model = mongoose.models[modelName];
  const indexes = model.schema.indexes();
  const seen = {};
  for (const idx of indexes) {
    const key = JSON.stringify(idx[0]);
    if (seen[key]) {
      console.log(`Model ${modelName} has DUPLICATE index: ${key}`);
    }
    seen[key] = true;
  }
}
