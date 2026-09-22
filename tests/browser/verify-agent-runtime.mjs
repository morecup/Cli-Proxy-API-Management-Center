// Runs against the isolated Vite fixture only; no production API is contacted.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [packagePath, executablePath, outputDirectory] = process.argv.slice(2);
if (!packagePath || !executablePath || !outputDirectory)
  throw Error('Provide Playwright module, browser and output paths.');
const { chromium } = await import(pathToFileURL(packagePath).href);
mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') {
      external.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('http://127.0.0.1:18746/tests/browser/agent-runtime.html');
  const cases = [
    ['en', 'An agent failed even though the main input may have completed.', 'Agents: 3'],
    ['zh-CN', '子任务执行失败；主请求完成不代表子任务成功。', '子任务 3'],
    ['zh-TW', '子任務執行失敗；主請求完成不代表子任務成功。', '子任務 3'],
    ['ru', 'Ошибка агента: завершение основного запроса не означает успех подзадачи.', 'Задачи: 3'],
  ];
  const passed = [];
  for (const [locale, failure, count] of cases) {
    await page.getByRole('button', { name: locale, exact: true }).click();
    await page.getByRole('button', { name: 'failures', exact: true }).click();
    await page.getByText(failure, { exact: true }).waitFor({ state: 'visible' });
    await page.getByText(count, { exact: false }).waitFor({ state: 'visible' });
    const warnings = await page.locator('small[class*="telemetryWarning"]').count();
    if (warnings !== 4) throw Error(`${locale}: expected four task warnings, found ${warnings}`);
    const file = path.join(outputDirectory, `agent-runtime-${locale}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.getByRole('button', { name: 'pending', exact: true }).click();
    await page.getByText(failure, { exact: true }).waitFor({ state: 'hidden' });
    if (await page.locator('small[class*="telemetryWarning"]').count())
      throw Error(`${locale}: pending events falsely degraded health`);
    await page.getByRole('button', { name: 'legacy', exact: true }).click();
    await page.getByText(count, { exact: false }).waitFor({ state: 'hidden' });
    passed.push({
      locale,
      warnings,
      screenshot: file,
      pending_not_failure: true,
      optional_absence: true,
    });
  }
  if (errors.length || external.length) throw Error(JSON.stringify({ errors, external }));
  console.log(
    JSON.stringify({ passed, page_errors: errors, external_requests: external }, null, 2)
  );
} finally {
  await browser.close();
}
