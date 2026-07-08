// Diagnostic script: navigate to local dev server, capture console, inspect DOM.
// Uses globally installed playwright (npx --no-install).
const path = require('path');
const Module = require('module');

// Find the playwright module that npx can see.
const cliPaths = [
  'C:\\Users\\PREDATOR\\AppData\\Roaming\\npm\\node_modules\\playwright',
  'C:\\Users\\PREDATOR\\AppData\\Roaming\\npm\\node_modules\\@playwright\\test',
  'C:\\Users\\PREDATOR\\AppData\\Local\\npm-cache\\_npx',
];
let pwPath = null;
const fs = require('fs');
for (const p of cliPaths) {
  try { if (fs.existsSync(p) && fs.statSync(p).isFile()) { pwPath = p; break; } } catch (_) {}
}
if (!pwPath) {
  // Pick the first npx cache that has playwright installed
  const npxCache = 'C:\\Users\\PREDATOR\\AppData\\Local\\npm-cache\\_npx';
  try {
    const entries = fs.readdirSync(npxCache);
    // Pick the install that matches the actually-installed chromium-1228
    let picked = null;
    for (const e of entries) {
      const cand = `${npxCache}\\${e}\\node_modules\\playwright`;
      if (!fs.existsSync(cand) || !fs.statSync(cand).isDirectory()) continue;
      const core = `${npxCache}\\${e}\\node_modules\\playwright-core`;
      let rev = null;
      try {
        rev = require(`${core}/browsers.json`).browsers.find(b => b.name === 'chromium').revision;
      } catch (_) {}
      if (rev === '1228') { picked = cand; break; }
      if (!picked) picked = cand;
    }
    if (picked) pwPath = picked;
  } catch (_) {}
}
if (!pwPath) {
  console.error('FATAL: cannot locate playwright module');
  process.exit(2);
}
console.log('Using playwright at:', pwPath);

const { chromium } = require(pwPath);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleEntries = [];
  const pageErrors = [];
  const requestFailures = [];

  page.on('console', (msg) => {
    consoleEntries.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  });
  page.on('pageerror', (err) => {
    pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
  });
  page.on('requestfailed', (req) => {
    requestFailures.push({ url: req.url(), failure: req.failure() ? req.failure().errorText : null });
  });
  page.on('response', (resp) => {
    if (resp.status() >= 400) {
      requestFailures.push({ url: resp.url(), status: resp.status(), statusText: resp.statusText() });
    }
  });

  const url = 'http://localhost:5174/';
  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    navError = { name: e.name, message: e.message };
  }

  // Wait 5 seconds for app to settle
  await page.waitForTimeout(5000);

  // Inspect DOM
  const dom = await page.evaluate(() => {
    const root = document.getElementById('root');
    const layout = document.querySelector('.layout, [class*="layout"], #__next, main, header, nav');
    return {
      title: document.title,
      rootExists: !!root,
      rootInnerHTMLLength: root ? root.innerHTML.length : 0,
      rootInnerHTMLPreview: root ? root.innerHTML.slice(0, 1500) : null,
      rootChildrenCount: root ? root.children.length : 0,
      bodyTextPreview: (document.body.innerText || '').slice(0, 500),
      hasLayoutEl: !!layout,
      layoutTag: layout ? layout.tagName + (layout.className ? '.' + (layout.className + '').split(/\s+/).join('.') : '') : null,
      hasNavbar: !!document.querySelector('nav, [class*="navbar"], [class*="Nav"]'),
    };
  });

  await browser.close();

  const report = {
    url,
    navError,
    consoleEntries,
    pageErrors,
    requestFailures,
    dom,
  };
  console.log('=== DIAGNOSTIC REPORT ===');
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
