import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'docs', 'project-doc', 'screenshots');
const MOCK = path.join(__dirname, '..', 'docs', 'mobile-mockups');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SCREENS = [
  ['08-mobile-schedule', 'schedule.html'],
  ['09-mobile-wellness', 'wellness.html'],
  ['10-mobile-alerts', 'alerts.html'],
];

const browser = await puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
fs.mkdirSync(OUT, { recursive: true });
for (const [file, html] of SCREENS) {
  await page.goto(`file://${path.resolve(MOCK, html)}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(OUT, `${file}.png`), fullPage: true });
  console.log('Saved', file);
}
await browser.close();
