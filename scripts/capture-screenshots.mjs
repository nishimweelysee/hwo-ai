/**
 * Capture core HWO module screenshots + native mobile mockups for project documentation.
 * Usage: node scripts/capture-screenshots.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'project-doc', 'screenshots');
const MOBILE_MOCKUPS = path.join(__dirname, '..', 'docs', 'mobile-mockups');
const EMAIL = 'admin@hospital.org';
const PASSWORD = 'admin123';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const WEB_MODULES = [
  { file: '01-analytics-dashboard', route: '/dashboard', title: 'Analytics Dashboard' },
  { file: '02-data-collection', route: '/data-collection', title: 'Data Collection' },
  { file: '03-workload-analysis', route: '/workload-analysis', title: 'Workload Analysis' },
  { file: '04-ai-prediction', route: '/ai-prediction', title: 'AI Prediction & Forecasting' },
  { file: '05-scheduling', route: '/scheduling', title: 'Scheduling Optimization' },
  { file: '06-wellness', route: '/wellness', title: 'Staff Wellness & Burnout Prediction' },
  { file: '07-reporting', route: '/reporting', title: 'Reporting' },
];

const MOBILE_SCREENS = [
  { file: '08-mobile-schedule', html: 'schedule.html', title: 'Mobile — Schedule View' },
  { file: '09-mobile-wellness', html: 'wellness.html', title: 'Mobile — Wellness Check-in' },
  { file: '10-mobile-alerts', html: 'alerts.html', title: 'Mobile — Alerts' },
];

async function getToken() {
  const res = await fetch(`${BASE.replace(':3000', ':8080')}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.token) throw new Error('Login failed');
  return data.token;
}

async function seedAuth(page, token) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((t) => {
    localStorage.setItem('hwo_auth_token', t);
    document.cookie = `hwo_token=${t}; path=/; max-age=28800; SameSite=Lax`;
  }, token);
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error('Chrome not found');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--window-size=1440,900'],
  });
  const page = await browser.newPage();

  const token = await getToken();
  await seedAuth(page, token);
  await page.setViewport({ width: 1440, height: 900 });

  for (const mod of WEB_MODULES) {
    console.log(`Capturing ${mod.title}...`);
    await page.goto(`${BASE}${mod.route}`, { waitUntil: 'networkidle2', timeout: 90000 });
    await new Promise((r) => setTimeout(r, 3500));
    await page.screenshot({ path: path.join(OUT, `${mod.file}.png`), fullPage: true });
  }

  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844 });

  for (const screen of MOBILE_SCREENS) {
    const htmlPath = path.join(MOBILE_MOCKUPS, screen.html);
    console.log(`Capturing ${screen.title}...`);
    await mobilePage.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
    await mobilePage.screenshot({ path: path.join(OUT, `${screen.file}.png`), fullPage: true });
  }

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
