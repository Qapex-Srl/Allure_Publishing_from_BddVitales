'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

function positiveInteger(value, fallback, label) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${label} deve essere un intero positivo`);
  return n;
}
function serviceURL(value, label) {
  if (!value) throw new Error(`${label} mancante`);
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} deve essere un URL HTTP(S) senza credenziali, query o fragment`);
  }
  const prefix = url.pathname.replace(/\/+$/, '');
  url.pathname = prefix.endsWith('/allure-docker-service') ? prefix : `${prefix}/allure-docker-service`;
  return url.toString().replace(/\/$/, '');
}
function reportOptionsFromEnv(env = process.env) {
  const projectId = env.ALLURE_PROJECT_ID;
  if (env.ALLURE_CLEAN_RESULTS !== undefined && !['true', 'false'].includes(env.ALLURE_CLEAN_RESULTS)) {
    throw new Error('ALLURE_CLEAN_RESULTS deve essere true oppure false');
  }
  return {
    baseURL: env.ALLURE_BASE_URL,
    publicBaseURL: env.ALLURE_PUBLIC_URL || env.ALLURE_BASE_URL,
    username: env.ALLURE_USERNAME,
    password: env.ALLURE_PASSWORD,
    executionName: env.ALLURE_EXECUTION_NAME,
    executionFrom: env.ALLURE_EXECUTION_FROM,
    executionType: env.ALLURE_EXECUTION_TYPE,
    projectId,
    resultsDir: env.ALLURE_RESULTS_DIR || 'allure-results',
    clean: env.ALLURE_CLEAN_RESULTS === 'true',
    timeoutMs: positiveInteger(env.ALLURE_TIMEOUT_MS, 120000, 'ALLURE_TIMEOUT_MS'),
    maxBytes: positiveInteger(env.ALLURE_MAX_BYTES, 1024 * 1024 * 1024, 'ALLURE_MAX_BYTES'),
    batchBytes: positiveInteger(env.ALLURE_BATCH_BYTES, 8 * 1024 * 1024, 'ALLURE_BATCH_BYTES'),
    maxFileBytes: positiveInteger(env.ALLURE_MAX_FILE_BYTES, 32 * 1024 * 1024, 'ALLURE_MAX_FILE_BYTES'),
  };
}
async function publishReport(options, { fetchImpl = globalThis.fetch, dryRun = false } = {}) {
  const base = serviceURL(options.baseURL, 'ALLURE_BASE_URL');
  const publicBase = serviceURL(options.publicBaseURL || options.baseURL, 'ALLURE_PUBLIC_URL');
  const id = options.projectId;
  if (!id || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error('ALLURE_PROJECT_ID non valido (usare minuscole, numeri, trattini o underscore)');
  if (Boolean(options.username) !== Boolean(options.password)) throw new Error('Specificare username e password insieme');
  const timeout = positiveInteger(options.timeoutMs, 120000, 'timeoutMs');
  const limit = positiveInteger(options.maxBytes, 1024 * 1024 * 1024, 'maxBytes');
  const batchLimit = positiveInteger(options.batchBytes, 8 * 1024 * 1024, 'batchBytes');
  const fileLimit = positiveInteger(options.maxFileBytes, 32 * 1024 * 1024, 'maxFileBytes');
  const directory = path.resolve(options.resultsDir || 'allure-results');
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const results = [];
  let bytes = 0;
  let resultCount = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile()) throw new Error(`Elemento non supportato in allure-results: ${entry.name}`);
    const filename = path.join(directory, entry.name);
    const stat = await fs.stat(filename);
    if (bytes + stat.size > limit) throw new Error(`Risultati oltre il limite di ${limit} byte; impostare ALLURE_MAX_BYTES consapevolmente`);
    if (stat.size > fileLimit) throw new Error(`File oltre ALLURE_MAX_FILE_BYTES: ${entry.name}`);
    const content = await fs.readFile(filename);
    bytes += content.length;
    if (bytes > limit) throw new Error(`Risultati oltre il limite di ${limit} byte`);
    if (entry.name.endsWith('.json')) {
      try { JSON.parse(content.toString('utf8')); }
      catch { throw new Error(`JSON non valido: ${entry.name}`); }
    }
    if (entry.name.endsWith('-result.json')) resultCount++;
    results.push({ file_name: entry.name, filename, size: content.length, digest: require('node:crypto').createHash('sha256').update(content).digest('hex') });
  }
  if (!resultCount) throw new Error('Nessun file *-result.json: pubblicazione annullata');
  const summary = { projectId: id, files: results.length, results: resultCount, bytes, dryRun };
  // Validate all files before remote mutations; only hold one batch in memory during upload.
  if (dryRun) return summary;
  const cookies = new Map();
  async function request(endpoint, init = {}) {
    let response;
    try {
      response = await fetchImpl(`${base}/${endpoint}`, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(timeout),
        headers: { 'Content-Type': 'application/json',
          ...(cookies.size ? { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join('; '), 'X-CSRF-TOKEN': cookies.get('csrf_access_token') || '' } : {}), ...init.headers },
      });
    } catch { throw new Error(`Allure ${endpoint.split('?')[0]}: errore di rete o timeout; esito remoto da verificare prima di riprovare`); }
    if (!response.ok) {
      const error = new Error(`Allure ${endpoint.split('?')[0]}: HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    let body;
    try { body = await response.json(); }
    catch { throw new Error(`Allure ${endpoint.split('?')[0]}: risposta JSON non valida`); }
    if (!body || typeof body !== 'object' || (body.meta?.status && Number(body.meta.status) >= 400)) {
      throw new Error(`Allure ${endpoint.split('?')[0]}: risposta di errore`);
    }
    return body;
  }
  if (options.username) {
    await request('login', { method: 'POST', body: JSON.stringify({ username: options.username, password: options.password }) });
    if (!cookies.get('access_token_cookie') || !cookies.get('csrf_access_token')) throw new Error('Allure: login senza cookie di accesso/CSRF');
  }
  if (options.clean) {
    // Only a confirmed missing project may skip cleaning. Auth/network errors stop publication.
    let exists = true;
    try { await request(`projects/${encodeURIComponent(id)}`); }
    catch (error) { if (error.status === 404) exists = false; else throw error; }
    if (exists) await request(`clean-results?project_id=${id}`);
  }
  let batch = [];
  let batchSize = 0;
  async function upload() {
    if (!batch.length) return;
    const uploaded = await request(`send-results?project_id=${id}&force_project_creation=true`, {
      method: 'POST', body: JSON.stringify({ results: batch }),
    });
    const data = uploaded.data;
    if (!data || !Number.isInteger(data.processed_files_count) || data.processed_files_count !== batch.length ||
        (data.failed_files_count !== undefined && data.failed_files_count !== 0)) {
      throw new Error('Allure: upload incompleto o risposta inattesa; report non generato (richiesto API_RESPONSE_LESS_VERBOSE=0)');
    }
    batch = [];
    batchSize = 0;
  }
  for (const file of results) {
    if (batch.length && batchSize + file.size > batchLimit) await upload();
    const content = await fs.readFile(file.filename);
    if (require('node:crypto').createHash('sha256').update(content).digest('hex') !== file.digest) {
      throw new Error(`Risultati modificati durante la pubblicazione: ${file.file_name}`);
    }
    batch.push({ file_name: file.file_name, content_base64: content.toString('base64') });
    batchSize += content.length;
  }
  await upload();
  const query = new URLSearchParams({ project_id: id });
  for (const [key, value] of Object.entries({ execution_name: options.executionName, execution_from: options.executionFrom, execution_type: options.executionType })) {
    if (value) query.set(key, value);
  }
  const generated = await request(`generate-report?${query}`);
  if (typeof generated.data?.report_url !== 'string' || !generated.data.report_url) {
    throw new Error('Allure: generazione senza report_url; pubblicazione non confermata');
  }
  const remoteURL = new URL(generated.data.report_url, `${base}/`);
  const marker = `/projects/${id}/reports/`;
  const index = remoteURL.pathname.indexOf(marker);
  if (index < 0) throw new Error('Allure: report_url non corrisponde al progetto richiesto');
  return { ...summary, reportURL: `${publicBase}${remoteURL.pathname.slice(index)}` };
}
module.exports = { publishReport, reportOptionsFromEnv };
