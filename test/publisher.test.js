'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publishReport, reportOptionsFromEnv } = require('../src/reporting');
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'publisher-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.writeFile(path.join(dir, 'one-result.json'), '{"name":"scenario","status":"passed"}');
  await fs.writeFile(path.join(dir, 'image-attachment.png'), Buffer.from([0, 255, 42]));
  return { baseURL: 'http://localhost:5050', projectId: 'example', resultsDir: dir };
}
function reply(data, status = 200, headers = {}) { return new Response(JSON.stringify({ data }), { status, headers }); }
const report = { report_url: 'http://internal/allure-docker-service/projects/example/reports/1/index.html' };
test('dry run validates files without network', async t => {
  const result = await publishReport(await fixture(t), { dryRun: true, fetchImpl: () => assert.fail('network') });
  assert.equal(result.files, 2); assert.equal(result.results, 1);
});
test('authenticated clean, binary uploads, batches, metadata and public URL', async t => {
  const calls = [];
  const options = { ...await fixture(t), username: 'user', password: 'secret', clean: true, batchBytes: 1, publicBaseURL: 'https://reports.example/proxy', executionName: 'run & 42' };
  const result = await publishReport(options, { fetchImpl: async (url, init) => {
    const u = new URL(url); const endpoint = u.pathname.split('/').pop(); calls.push(endpoint);
    assert.equal(init.redirect, 'error');
    if (endpoint === 'login') {
      assert.deepEqual(JSON.parse(init.body), { username: 'user', password: 'secret' });
      const response = reply({});
      response.headers.append('set-cookie', 'access_token_cookie=jwt; HttpOnly; Path=/');
      response.headers.append('set-cookie', 'csrf_access_token=csrf; Path=/');
      return response;
    }
    assert.match(init.headers.Cookie, /access_token_cookie=jwt/);
    assert.equal(init.headers['X-CSRF-TOKEN'], 'csrf');
    if (endpoint === 'send-results') {
      const files = JSON.parse(init.body).results;
      assert.equal(files.length, 1);
      if (files[0].file_name.endsWith('.png')) assert.deepEqual(Buffer.from(files[0].content_base64, 'base64'), Buffer.from([0, 255, 42]));
      assert.equal(u.searchParams.get('force_project_creation'), 'true');
      return reply({ processed_files_count: files.length, failed_files_count: 0 });
    }
    if (endpoint === 'generate-report') { assert.equal(u.searchParams.get('execution_name'), 'run & 42'); return reply(report); }
    return reply({});
  } });
  assert.deepEqual(calls, ['login', 'example', 'clean-results', 'send-results', 'send-results', 'generate-report']);
  assert.equal(result.reportURL, 'https://reports.example/proxy/allure-docker-service/projects/example/reports/1/index.html');
});
test('clean skips only a missing project, stops on unauthorized', async t => {
  const options = { ...await fixture(t), clean: true };
  await publishReport(options, { fetchImpl: async url => {
    if (url.includes('/projects/')) return reply({}, 404);
    assert.ok(!url.includes('clean-results'));
    return url.includes('send-results') ? reply({ processed_files_count: 2 }) : reply(report);
  } });
  await assert.rejects(publishReport(options, { fetchImpl: async () => reply({}, 401) }), /HTTP 401/);
});
test('invalid inputs never mutate remote state', async t => {
  const options = await fixture(t); const execution = { fetchImpl: () => assert.fail('network') };
  await assert.rejects(publishReport({ ...options, maxBytes: 1 }, execution), /limite/);
  await assert.rejects(publishReport({ ...options, username: 'user' }, execution), /insieme/);
  await fs.writeFile(path.join(options.resultsDir, 'one-result.json'), '{');
  await assert.rejects(publishReport(options, execution), /JSON non valido/);
  await fs.unlink(path.join(options.resultsDir, 'one-result.json'));
  await assert.rejects(publishReport(options, execution), /Nessun file/);
});
test('partial upload never generates report; network errors do not leak credentials', async t => {
  const options = await fixture(t);
  await assert.rejects(publishReport(options, { fetchImpl: async url => {
    assert.ok(url.includes('send-results')); return reply({ processed_files_count: 1 });
  } }), /incompleto/);
  await assert.rejects(publishReport(options, { fetchImpl: async () => { throw new Error('secret'); } }), error => !error.message.includes('secret'));
  await assert.rejects(publishReport(options, { fetchImpl: async url => url.includes('send-results') ? reply({ processed_files_count: 2 }) : reply({}) }), /report_url/);
});
test('environment is generic and CLI supports CI exit codes and JSON', async t => {
  assert.equal(reportOptionsFromEnv({ ALLURE_PROJECT: 'company', ENVIRONMENT: 'dev' }).projectId, undefined);
  assert.throws(() => reportOptionsFromEnv({ ALLURE_CLEAN_RESULTS: 'yes' }));
  const options = await fixture(t);
  const cli = path.resolve(__dirname, '../src/cli.js');
  const run = spawnSync(process.execPath, [cli, '--url', options.baseURL, '--project', 'example', '--results', options.resultsDir, '--dry-run', '--json'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).dryRun, true);
  assert.equal(spawnSync(process.execPath, [cli, '--unknown']).status, 1);
});
