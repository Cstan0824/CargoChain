import { chromium } from 'playwright';

const consoleEvents = [];
const networkEvents = [];
const pageErrors = [];
const requestFailures = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('console', (msg) => {
  consoleEvents.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location(),
  });
});

page.on('pageerror', (err) => {
  pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
});

page.on('requestfailed', (req) => {
  requestFailures.push({
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText,
    resourceType: req.resourceType(),
  });
});

page.on('response', (resp) => {
  const status = resp.status();
  if (status >= 400) {
    networkEvents.push({
      url: resp.url(),
      status,
      statusText: resp.statusText(),
      resourceType: resp.request().resourceType(),
    });
  }
});

try {
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 15000 });
} catch (e) {
  consoleEvents.push({ type: 'NAV_ERROR', text: String(e), location: null });
}

await page.waitForTimeout(5000);

const rootHTML = await page.evaluate(() => {
  const r = document.getElementById('root');
  return {
    rootExists: !!r,
    rootInnerHTMLLength: r ? r.innerHTML.length : 0,
    rootInnerHTML: r ? r.innerHTML.slice(0, 2000) : null,
    bodyText: document.body.innerText.slice(0, 2000),
  };
});

const visibleText = await page.evaluate(() => document.body.innerText);

console.log(JSON.stringify({
  consoleEvents,
  pageErrors,
  requestFailures,
  httpErrors: networkEvents,
  rootHTML,
  visibleText,
}, null, 2));

await browser.close();
