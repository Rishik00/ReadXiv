import { chromium } from 'playwright';
const dir = process.env.TEMP;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
// focus body so the `t` key isn't swallowed; click the greeting area
await p.mouse.click(640, 200);
await p.waitForTimeout(300);
await p.screenshot({ path: `${dir}/pill-now.png` });
// switch to Stats via the toggle button
const statsBtn = p.getByRole('tab', { name: 'Stats' });
if (await statsBtn.count()) { await statsBtn.first().click(); }
await p.waitForTimeout(700);
await p.screenshot({ path: `${dir}/pill-stats.png` });
// hover the chart to trigger the tooltip
const chart = await p.$('.editorial-chart-hit');
if (chart) { const box = await chart.boundingBox(); if (box) { await p.mouse.move(box.x + box.width*0.7, box.y + box.height*0.5); await p.waitForTimeout(400); } }
await p.screenshot({ path: `${dir}/pill-stats-hover.png` });
console.log('done');
await b.close();
