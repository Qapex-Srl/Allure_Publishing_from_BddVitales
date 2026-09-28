#!/usr/bin/env node
'use strict';
const { parseArgs } = require('node:util');
const { publishReport, reportOptionsFromEnv } = require('./reporting');
const mapping = {
  url: 'baseURL', project: 'projectId', results: 'resultsDir', 'public-url': 'publicBaseURL',
  'timeout-ms': 'timeoutMs', 'max-bytes': 'maxBytes', 'batch-bytes': 'batchBytes',
  'max-file-bytes': 'maxFileBytes', 'execution-name': 'executionName',
  'execution-from': 'executionFrom', 'execution-type': 'executionType',
};
async function main() {
  const { values } = parseArgs({ options: {
    ...Object.fromEntries(Object.keys(mapping).map(key => [key, { type: 'string' }])),
    clean: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`Usage: publish-allure --url http://localhost:5050 --project example [options]

--results DIR         Allure results directory (default: allure-results)
--clean               Remove previous remote results before upload (preserves history)
--public-url URL      Public service URL for the returned report link
--execution-name NAME --execution-from URL --execution-type TYPE
--timeout-ms N        Timeout per HTTP request (default: 120000)
--max-bytes N         Maximum total input size (default: 1073741824)
--batch-bytes N       Target raw input bytes per upload (default: 8388608)
--max-file-bytes N    Maximum individual file size (default: 33554432)
--dry-run             Validate locally without contacting the server
--json                Print a machine-readable summary

Environment: ALLURE_BASE_URL, ALLURE_PROJECT_ID, ALLURE_RESULTS_DIR,
ALLURE_PUBLIC_URL, ALLURE_CLEAN_RESULTS=true|false, ALLURE_USERNAME,
ALLURE_PASSWORD, ALLURE_EXECUTION_NAME, ALLURE_EXECUTION_FROM,
ALLURE_EXECUTION_TYPE, ALLURE_TIMEOUT_MS, ALLURE_MAX_BYTES,
ALLURE_BATCH_BYTES, ALLURE_MAX_FILE_BYTES. CLI options override environment.`);
    return;
  }
  const options = reportOptionsFromEnv();
  for (const [flag, key] of Object.entries(mapping)) if (values[flag] !== undefined) options[key] = values[flag];
  if (values.clean !== undefined) options.clean = values.clean;
  const summary = await publishReport(options, { dryRun: values['dry-run'] === true });
  console.log(values.json ? JSON.stringify(summary) : summary.dryRun
    ? `Validati ${summary.results} risultati e ${summary.files} file (${summary.bytes} byte).`
    : `Report pubblicato: ${summary.reportURL}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
