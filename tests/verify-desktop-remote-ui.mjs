import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// Only the local synthetic fixture is used; never load a management credential.
const [modulePath, artifactPath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 } });
  const errors = [];
  const remoteRequests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5180/')) remoteRequests.push(request.url());
  });
  await page.goto('http://127.0.0.1:5180/tests/fixtures/claudeDesktopRemote.html');
  await page.getByText('会话与远端输入', { exact: true }).click();
  await page.getByText('暂无本地会话记录。', { exact: true }).waitFor();
  await page.getByLabel('远端会话 ID', { exact: true }).fill('cse_synthetic');
  await page.getByLabel('工作目录', { exact: true }).fill('C:/synthetic');
  await page.getByLabel('模型 ID', { exact: true }).fill('claude-sonnet-5');
  await page.getByRole('button', { name: '创建远端会话', exact: true }).click();
  await page
    .getByRole('alert')
    .filter({ hasText: 'Synthetic initial attachment failed' })
    .waitFor();
  await page.getByText('等待连接', { exact: true }).waitFor();
  assert.equal(await page.getByText('local_synthetic', { exact: true }).count(), 1);
  await page.getByRole('button', { name: '重试连接', exact: true }).click();
  await page.getByText('已记录远端绑定', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: '停止会话', exact: true }).click();
  await page.getByText('已停止', { exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: '重试连接', exact: true }).isDisabled(),
    true
  );
  assert.equal(
    await page.getByRole('button', { name: '停止会话', exact: true }).isDisabled(),
    true
  );
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByText('已停止', { exact: true }).waitFor();
  await page.getByRole('button', { name: '创建远端会话', exact: true }).click({ trial: true });
  await page.getByRole('button', { name: '恢复已保存会话', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Synthetic stale resume' }).waitFor();
  await page.getByText('已停止', { exact: true }).waitFor();
  assert.equal(await page.getByText('query_synthetic', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '恢复已保存会话', exact: true }).click();
  await page.getByText('query_resumed', { exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.getByRole('button', { name: '恢复已保存会话', exact: true }).count(), 0);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByText('query_resumed', { exact: true }).waitFor();
  await page.screenshot({ path: artifactPath, fullPage: true });
  await page.goto('http://127.0.0.1:5180/tests/fixtures/claudeDesktopStartup.html');
  await page
    .getByText('远端消息解析、策略读取、控制处理或回执投递失败。', { exact: true })
    .waitFor();
  await page.getByText('部分远端操作尚无可执行处理器。', { exact: true }).waitFor();
  await page.getByText('已接收的远端输入在模型执行期间失败。', { exact: true }).waitFor();
  await page
    .getByText('工作进程已注册，但未能读取此前的 worker 状态；恢复内容可能不完整。', { exact: true })
    .waitFor();
  await page
    .getByText('远端连接的 transcript 元数据写入失败；会话恢复记录可能不完整。', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await page.getByText('Synthetic QA only — no live accounts. Refreshes: 1', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText('工作进程已注册，但未能读取此前的 worker 状态；恢复内容可能不完整。', { exact: true })
      .count(),
    1
  );
  assert.equal(
    await page
      .getByText('远端连接的 transcript 元数据写入失败；会话恢复记录可能不完整。', { exact: true })
      .count(),
    1
  );
  await page
    .getByText('已接收输入 5 · 模型完成 2 · 已取消 1 · 执行失败 2', { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText('远程历史未能完整恢复。已保留验证过的本地历史；主会话或子代理的恢复仍需处理。', { exact: true })
      .count(),
    1
  );
  const runtimeArtifact = artifactPath.replace(/\.png$/, '-runtime.png');
  await page.screenshot({ path: runtimeArtifact, fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(remoteRequests, []);
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        'empty',
        'form-input',
        'failed-create-preserves-record',
        'exact-generation-retry',
        'stopped-actions-disabled',
        'refresh-preserves-stop',
        'stale-resume-refreshes-durable-generation',
        'restart-without-query-id-can-resume',
        'resume-preserves-record-and-uses-new-query',
        'refresh-preserves-resume',
        'runtime-input-counters',
        'runtime-failure-warnings',
        'bridge-transcript-warning-survives-refresh',
        'worker-state-read-warning-survives-successful-registration-and-refresh',
        'remote-hydration-warning-survives-refresh',
        'no-page-errors',
        'no-remote-requests',
      ],
      screenshots: [artifactPath, runtimeArtifact],
    })
  );
} finally {
  await browser.close();
}
