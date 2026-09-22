import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Offline regression only: a new headless browser profile and a synthetic
// component fixture. No management credentials or installed Desktop state.
const [modulePath, artifactPrefix] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const checks = [], screenshots = [];
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (route.request().url().startsWith('http://127.0.0.1:5182/')) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto('http://127.0.0.1:5182/tests/fixtures/claudeDesktopObservedScope.html');
  await page.getByLabel('Fixture', { exact: true }).selectOption('uncaptured');
  for (const [locale, title, hint] of [
    ['zh-CN', '抓包清单外的 4 个可执行映射', '不增加已抓包覆盖率'],
    ['zh-TW', '抓包清單外的 4 個可執行映射', '不增加已抓包覆蓋率'],
    ['en', '4 executable mappings outside the capture inventory', 'do not increase captured coverage'],
    ['ru', 'Рабочие сопоставления вне реестра захватов: 4', 'не повышают покрытие захватов'],
  ]) {
    await page.getByLabel('Language', { exact: true }).selectOption(locale);
    const heading = page.getByText(title, { exact: true });
    await heading.waitFor();
    const details = heading.locator('..');
    if (!(await details.getAttribute('open'))) await heading.click();
    assert.equal(await details.locator('li').count(), 4);
    assert.ok((await details.innerText()).includes(hint));
    for (const name of ['tengu_chain_parent_cycle', 'tengu_chain_timestamp_fallback', 'tengu_chain_parallel_tr_recovered']) {
      assert.ok((await details.innerText()).includes(name));
    }
    checks.push(locale + ': translated list, disclaimer and all three new source mappings');
    if (locale === 'zh-CN' || locale === 'en') {
      const path = artifactPrefix + '-' + locale + '.png';
      await details.locator('..').screenshot({ path });
      screenshots.push(path);
    }
    await heading.click();
  }
  await page.getByLabel('Fixture', { exact: true }).selectOption('union');
  assert.equal(await page.getByText('Рабочие сопоставления вне реестра захватов: 4', { exact: true }).count(), 0);
  checks.push('legacy response without the optional field hides the source-only section');
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  checks.push('no browser errors or external HTTP requests');
  console.log(JSON.stringify({ checks, screenshots, browser_errors: errors.length, external_requests: external.length }));
} finally {
  await browser.close();
}
