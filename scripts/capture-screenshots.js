/**
 * Capture HWO module screenshots for project documentation.
 * Usage: node scripts/capture-screenshots.js
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'docs', 'project-doc', 'screenshots');
const EMAIL = 'admin@hospital.org';
const PASSWORD = 'admin123';

const MODULES = [
  { file: '01-dashboard', route: '/dashboard', title: 'Dashboard' },
  { file: '02-data-collection', route: '/data-collection', title: 'Data Collection' },
  { file: '03-workload-analysis', route: '/workload-analysis', title: 'Workload Analysis' },
  { file: '04-ai-prediction', route: '/ai-prediction', title: 'AI Prediction' },
  { file: '05-scheduling', route: '/scheduling', title: 'Scheduling' },
  { file: '06-reporting', route: '/reporting', title: 'Reporting' },
  { file: '07-wellness', route: '/wellness', title: 'Staff Wellness' },
  { file: '08-resources', route: '/resources', title: 'Resources' },
  { file: '09-skills', route: '/skills', title: 'Skills & Competency' },
  { file: '10-mobile', route: '/mobile', title: 'Mobile' },
  { file: '11-compliance', route: '/compliance', title: 'Compliance' },
  { file: '12-user-management', route: '/user-management', title: 'User Management' },
  { file: '13-configuration', route: '/configuration', title: 'Configuration' },
  { file: '14-data-management', route: '/data-management', title: 'Data Management' },
  { file: '15-audit', route: '/audit', title: 'Audit & Logging' },
  { file: '16-profile', route: '/profile', title: 'Profile' },
];

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('input[type="email"], input[placeholder*="hospital"]', { timeout: 15000 });
  const emailSel = 'input[type="email"], input[placeholder*="hospital"]';
  const passSel = 'input[type="password"]';
  await page.$eval(emailSel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, EMAIL);
  await page.$eval(passSel, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch {
    try {
      puppeteer = require('puppeteer');
    } catch {
      console.error('Install puppeteer-core: npm install puppeteer-core --no-save');
      process.exit(1);
    }
  }

  const chromePath = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.env.CHROME_PATH;

  fs.mkdirSync(OUT, { recursive: true });
  const launchOpts = { headless: 'new', args: ['--no-sandbox', '--window-size=1440,900'] };
  if (chromePath && fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await puppeteer.launch(launchOpts);
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await login(page);

  for (const mod of MODULES) {
    console.log(`Capturing ${mod.title}...`);
    await page.goto(`${BASE}${mod.route}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForTimeout(2500);
    const outPath = path.join(OUT, `${mod.file}.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`  -> ${outPath}`);
  }

  await browser.close();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
