'use strict';
const fs = require('node:fs');
const path = require('node:path');
let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const source of ['style.css', 'tutorial.css']) html = html.replace(`<link rel="stylesheet" href="${source}">`, () => `<style>\n${fs.readFileSync(path.join(__dirname, source), 'utf8')}\n</style>`);
for (const source of ['engine.js', 'tutorial-model.js', 'app.js', 'tutorial.js']) html = html.replace(`<script src="${source}"></script>`, () => `<script>\n${fs.readFileSync(path.join(__dirname, source), 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>`);
const out = path.join(__dirname, '..', 'outputs', 'S21點', 'S21點_單機版.html');
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html, 'utf8');
console.log(out);
