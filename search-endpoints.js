const fs = require('fs');

const code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');

console.log("Searching for endpoints in server.ts...");
lines.forEach((line, i) => {
  if ((line.includes("app.get(") || line.includes("app.post(")) && line.includes('"/api/')) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
