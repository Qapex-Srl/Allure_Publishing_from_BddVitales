# Allure Docker Publisher

A lightweight Node.js CLI and API for publishing **Allure test results**
to [Allure Docker
Service](https://github.com/fescobar/allure-docker-service).

Designed to work with **Playwright**, **Playwright BDD**, and any
testing framework that generates standard `allure-results`.

No Java or Allure CLI installation is required on the test runner.

## How it works

``` text
Test Framework
      |
      | generates
      v
allure-results/
      |
      | publish-allure
      v
Allure Docker Service
      |
      v
Allure Report
```

The library does not execute tests or generate Allure result files. It
takes an existing `allure-results` directory, uploads its contents to
Allure Docker Service, generates the report, and returns the report URL.

## Features

-   Uploads standard `allure-results`
-   Works with Playwright and Playwright BDD
-   Framework independent
-   CLI and Node.js API
-   Automatic Allure project creation
-   Optional cleanup of previous results
-   Allure Docker Service authentication support
-   Batch uploads
-   Attachment support
-   Dry-run mode
-   JSON output for CI/CD pipelines
-   TypeScript definitions included
-   No Java or Allure CLI required

## Requirements

-   Node.js \>= 22
-   A running [Allure Docker
    Service](https://github.com/fescobar/allure-docker-service)
-   A test framework configured to generate `allure-results`

> The URL must point to the **Allure Docker Service API**, usually
> running on port `5050`, not to the Allure Docker Service UI.

## Installation

### From GitHub

``` bash
npm install --save-dev github:Qapex-Srl/Allure_Publishing_from_BddVitales
```

If your project uses Playwright, install the Allure reporter as well:

``` bash
npm install --save-dev allure-playwright
```

## Quick start

Run your tests first so that the `allure-results` directory is
generated.

Then publish the results:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project my-project
```

The default results directory is `allure-results`.

To use another directory:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project my-project \
  --results ./my-allure-results
```

## Playwright

Configure `allure-playwright` in `playwright.config.ts`:

``` ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['allure-playwright', {
      resultsDir: 'allure-results'
    }]
  ]
});
```

Run your tests:

``` bash
npx playwright test
```

Then publish the generated results:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project playwright-tests
```

## Playwright BDD

The publisher works with
[playwright-bdd](https://github.com/vitalets/playwright-bdd) without
requiring changes to your feature files, steps, fixtures, or BDD
configuration.

``` text
.feature files
      |
      v
playwright-bdd
      |
      v
Playwright
      |
      v
allure-playwright
      |
      v
allure-results/
      |
      v
publish-allure
      |
      v
Allure Docker Service
```

Keep your existing `defineBddConfig` configuration and add the Allure
reporter:

``` ts
reporter: [
  ['list'],
  ['allure-playwright', {
    resultsDir: 'allure-results'
  }]
]
```

Then execute your normal BDD test command and publish the results:

``` bash
npm test

npx publish-allure \
  --url http://localhost:5050 \
  --project bdd-tests
```

## npm scripts

You can add the publisher to your project's `package.json`:

``` json
{
  "scripts": {
    "test": "playwright test",
    "report:publish": "publish-allure"
  }
}
```

Then:

``` bash
npm test

npm run report:publish -- \
  --url http://localhost:5050 \
  --project my-project
```

## Configuration

Configuration can be provided using CLI arguments or environment
variables.

  CLI option           Environment variable      Default
  -------------------- ------------------------- ------------------
  `--url`              `ALLURE_BASE_URL`         Required
  `--project`          `ALLURE_PROJECT_ID`       Required
  `--results`          `ALLURE_RESULTS_DIR`      `allure-results`
  `--public-url`       `ALLURE_PUBLIC_URL`       Service URL
  `--clean`            `ALLURE_CLEAN_RESULTS`    `false`
  `--timeout-ms`       `ALLURE_TIMEOUT_MS`       `120000`
  `--max-bytes`        `ALLURE_MAX_BYTES`        `1073741824`
  `--batch-bytes`      `ALLURE_BATCH_BYTES`      `8388608`
  `--max-file-bytes`   `ALLURE_MAX_FILE_BYTES`   `33554432`
  `--execution-name`   `ALLURE_EXECUTION_NAME`   Server default
  `--execution-from`   `ALLURE_EXECUTION_FROM`   Server default
  `--execution-type`   `ALLURE_EXECUTION_TYPE`   Server default

CLI arguments take precedence over environment variables.

To see all available options:

``` bash
npx publish-allure --help
```

## Environment variables

Instead of passing arguments every time:

``` bash
export ALLURE_BASE_URL=http://localhost:5050
export ALLURE_PROJECT_ID=my-project

npx publish-allure
```

This is particularly useful in CI/CD environments.

## Clean previous results

By default, new results are added to the results already associated with
the project.

Use `--clean` to remove previous remote results before uploading the new
execution:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project my-project \
  --clean
```

Allure history is preserved when supported and configured by the server.

## Authentication

If Allure Docker Service has authentication enabled, configure:

``` bash
export ALLURE_USERNAME=my-user
export ALLURE_PASSWORD=my-password
```

Then run the publisher normally:

``` bash
npx publish-allure \
  --url https://allure.example.com \
  --project my-project
```

For CI/CD, store credentials as pipeline secrets rather than directly in
the repository. HTTPS should be used when credentials are transmitted
over untrusted networks.

## Dry run

Validate the local results without contacting the Allure server:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project my-project \
  --dry-run
```

For machine-readable output:

``` bash
npx publish-allure \
  --url http://localhost:5050 \
  --project my-project \
  --dry-run \
  --json
```

## CI/CD

A typical pipeline is:

``` text
Install dependencies
        |
        v
Run tests
        |
        v
Generate allure-results
        |
        v
Publish results
        |
        v
Generate Allure report
```

The publishing step should normally run even when some tests fail, so
failed test executions are still visible in Allure.

Example:

``` bash
npx publish-allure \
  --url "$ALLURE_BASE_URL" \
  --project "$ALLURE_PROJECT_ID" \
  --clean
```

The CI runner must be able to reach the Allure Docker Service API.

## JavaScript / TypeScript API

The package can also be used programmatically:

``` js
const {
  publishReport,
  reportOptionsFromEnv
} = require('allure-docker-publisher');

const summary = await publishReport({
  ...reportOptionsFromEnv(),
  baseURL: 'http://localhost:5050',
  projectId: 'my-project',
  resultsDir: 'allure-results',
  clean: true
});

console.log(summary.reportURL);
```

TypeScript definitions are included with the package.

## Exit codes

``` text
0  Publication completed successfully
1  Publication failed
```

Errors are written to `stderr`, making the CLI suitable for CI/CD
pipelines.

## Important notes

Avoid running multiple publishers simultaneously against the same Allure
project.

For parallel or sharded tests, collect the generated Allure artifacts
into a single `allure-results` directory and publish once after all
shards have completed.

If an upload fails midway, some results may already exist on the server.
Check the project state before retrying or run the next publication with
`--clean`.

## Development

Clone the repository:

``` bash
git clone https://github.com/Qapex-Srl/Allure_Publishing_from_BddVitales.git
cd Allure_Publishing_from_BddVitales
```

Install dependencies and run tests:

``` bash
npm ci
npm test
```

Create a local npm package:

``` bash
npm pack
```

## License

This project is currently marked as `UNLICENSED`.

Publishing a repository publicly on GitHub does not automatically grant
permission to use, modify, or redistribute its source code. Add an
appropriate open-source license if the project is intended for public
reuse.

## Related projects

-   [Allure Docker
    Service](https://github.com/fescobar/allure-docker-service)
-   [Allure Docker Service
    UI](https://github.com/fescobar/allure-docker-service-ui)
-   [Playwright](https://github.com/microsoft/playwright)
-   [playwright-bdd](https://github.com/vitalets/playwright-bdd)
-   [allure-playwright](https://www.npmjs.com/package/allure-playwright)
