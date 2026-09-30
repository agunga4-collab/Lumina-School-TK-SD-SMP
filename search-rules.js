const fs = require('fs');

const rules = fs.readFileSync('firestore.rules', 'utf8');
const lines = rules.split('\n');

console.log("Searching for match patterns in firestore.rules...");
lines.forEach((line, i) => {
  if (line.includes("match /") && !line.includes("match /databases")) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
