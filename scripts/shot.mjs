// Zrzuty ekranu headless (Playwright + Chrome). użycie: node scripts/shot.mjs out.png '<params json>' [view] [clip axis:pos]
import { chromium } from 'playwright-core';
const [out, pj = '{}', view = 'iso', clip = '', panel = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: Number(process.env.H || 950) } });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
const base = process.env.URL || 'http://127.0.0.1:5181/statuetki-3d/';
await page.goto(base);
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 300000 });
const p = JSON.parse(pj);
if (Object.keys(p).length) { await page.evaluate((p) => window.__app.run(p), p); await page.waitForFunction(() => document.body.dataset.ready === '2', null, { timeout: 600000 }); }
await page.evaluate((v) => window.__app.setView(v), view);
if (process.env.ZOOM) await page.evaluate((z) => window.__app.zoom(z), Number(process.env.ZOOM));
if (clip) { const [a, pos] = clip.split(':'); await page.evaluate(([a, pos]) => window.__app.clip(true, a, +pos), [a, pos]); }
await page.waitForTimeout(800);
if (panel === 'val') { await page.evaluate(() => { const a = document.querySelector('aside.right'); a.style.cssText = 'height:auto;max-height:none;overflow:visible;position:absolute;top:0;right:0;z-index:9;background:#f4f3f0'; }); await page.waitForTimeout(300); await page.locator('aside.right').screenshot({ path: out }); }
else if (panel === 'cat') { await page.evaluate(() => { const c = document.getElementById('catalog'); c.style.cssText = 'height:auto;max-height:none;overflow:visible'; const a = document.querySelector('aside.left'); a.style.cssText = 'height:auto;max-height:none;overflow:visible;position:absolute;top:0;left:0;z-index:9;background:#f4f3f0'; }); await page.waitForTimeout(300); await page.locator('#catalog').screenshot({ path: out }); }
else if (panel === 'view') await page.locator('section.view').screenshot({ path: out });
else await page.screenshot({ path: out });
if (process.env.HASH) console.log('stl-sha256', await page.evaluate(() => window.__app.stlHash()));
await browser.close();
