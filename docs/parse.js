const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');
const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
if (scriptMatch) {
    fs.writeFileSync('temp.js', scriptMatch[1]);
} else {
    console.error('No script tag found!');
}
