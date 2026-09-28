# Allure Docker Publisher

Libreria Node.js e CLI indipendente dal framework per pubblicare `allure-results`
su [Allure Docker Service](https://github.com/fescobar/allure-docker-service#allure-api).
Nessuna dipendenza runtime, Node.js >=22. Supporta Playwright BDD e qualsiasi
framework che produca risultati Allure nel formato standard con file `*-result.json`.
Non esegue i test e non richiede Java o Allure CLI sul runner.

## Installazione

Il pacchetto non è ancora pubblicato su npm. Per provarlo dalla cartella della libreria:

```sh
npm ci
npm test
npm pack
```

Nel progetto dei test:

```sh
npm install --save-dev /percorso/allure-docker-publisher-0.1.0.tgz allure-playwright
npx publish-allure --url http://192.0.2.10:5050 --project esempio --clean
```

Dopo la pubblicazione del repository puoi installarlo con
`npm install --save-dev github:OWNER/Allure_Publishing_from_BddVitales#COMMIT`.
Sostituisci OWNER e COMMIT con account e revisione effettivi. Il nome npm è provvisorio:
la disponibilità sul registry non è stata verificata. `npm publish` pubblica un
pacchetto sul registry npm, mentre `publish-allure` pubblica un report sul server.

Puoi aggiungere `"report:publish": "publish-allure"` agli scripts del progetto:

```sh
npm run report:publish -- --url http://192.0.2.10:5050 --project esempio --clean
```

## Playwright BDD

Nel [framework di riferimento](https://github.com/vitalets/playwright-bdd-example)
mantieni `defineBddConfig`, step, feature, webServer e impostazioni esistenti.
Aggiungi il [reporter ufficiale Allure Playwright](https://allurereport.org/docs/playwright/):

```ts
reporter: [
  ['list'],
  ['allure-playwright', { resultsDir: 'allure-results' }],
],
```

Vedi `examples/playwright.config.ts`. Prima di ogni esecuzione elimina i risultati
locali precedenti; Allure accumula i file presenti. Poi esegui il comando BDD
originale (`npm test`, con generazione BDD) e pubblica anche in caso di test falliti.
La libreria legge risultati, container e allegati dalla directory, senza conoscere
nomi di progetto, ambienti, feature o fixture aziendali.

## Configurazione

```sh
npx publish-allure --help
npx publish-allure --url http://localhost:5050 --project esempio --dry-run --json
```

| Flag | Variabile | Default |
| --- | --- | --- |
| `--url` | `ALLURE_BASE_URL` | obbligatorio |
| `--project` | `ALLURE_PROJECT_ID` | obbligatorio |
| `--results` | `ALLURE_RESULTS_DIR` | `allure-results` |
| `--public-url` | `ALLURE_PUBLIC_URL` | URL di connessione |
| `--clean` | `ALLURE_CLEAN_RESULTS` | `false` |
| `--timeout-ms` | `ALLURE_TIMEOUT_MS` | `120000` per richiesta |
| `--max-bytes` | `ALLURE_MAX_BYTES` | `1073741824` |
| `--batch-bytes` | `ALLURE_BATCH_BYTES` | `8388608` |
| `--max-file-bytes` | `ALLURE_MAX_FILE_BYTES` | `33554432` |
| `--execution-name` | `ALLURE_EXECUTION_NAME` | default server |
| `--execution-from` | `ALLURE_EXECUTION_FROM` | default server |
| `--execution-type` | `ALLURE_EXECUTION_TYPE` | default server |

I flag prevalgono sulle variabili. Il progetto usa minuscole, numeri, `-`, `_`,
e inizia con lettera o numero. URL completo `http://IP:PORTA` o `https://host`:
il suffisso `/allure-docker-service` viene aggiunto se assente, anche dopo un
prefisso di reverse proxy. `--public-url` indica la base pubblica del servizio.

Per server con `SECURITY_ENABLED=1`, imposta insieme `ALLURE_USERNAME` e
`ALLURE_PASSWORD` nei secrets della pipeline. Il client usa login, cookie JWT
e token CSRF. Usa HTTPS per trasmettere credenziali su reti non fidate.
Non sono supportati login SSO interattivi o refresh automatico della sessione;
la durata della sessione server deve coprire l'intera pubblicazione.

`--dry-run` valida tutto localmente senza contattare il server. `--json` stampa
un oggetto con progetto, conteggi, byte e `reportURL` (assente in dry run).
Exit code 0 = completato, 1 = errore. Gli errori sono scritti su stderr.

## Server Allure Docker e pipeline

Configura il server con `CHECK_RESULTS_EVERY_SECONDS=NONE` per generare tramite
API dopo l'upload completo, `API_RESPONSE_LESS_VERBOSE=0` per verificare i
conteggi caricati e `KEEP_HISTORY=1` se desideri trend e storico.
La porta deve essere quella del servizio API (tipicamente 5050), non della UI.

La sequenza è validazione locale, login opzionale, pulizia opzionale,
`send-results?force_project_creation=true` in batch, `generate-report` e link.
`--clean` rimuove i risultati remoti precedenti, conservando lo storico;
senza `--clean` i nuovi risultati si aggiungono a quelli già presenti.
Non vengono cancellati progetti o storico. Un errore a metà upload può lasciare
risultati parziali sul server: verifica lo stato prima di rilanciare con `--clean`.
Non ci sono retry automatici delle operazioni che modificano il server.

Serializza le pubblicazioni per progetto remoto, oppure usa ID distinti per job.
Per gli shard, raccogli prima tutti gli artifact in una directory e pubblica una
sola volta. I file devono essere regolari, nella radice della directory: sottocartelle
e link simbolici sono rifiutati. La directory non deve cambiare durante l'invio.
Il limite batch conta byte originali: Base64 aumenta il payload di circa un terzo;
un file singolo può superare il target batch fino al limite del singolo file.

Vedi `examples/github-actions.yml`: pubblica dopo test falliti preservando lo
stato di fallimento del job. Installa prima questa libreria nelle devDependencies
e aggiorna il lockfile del progetto. Il runner deve poter raggiungere il server.

## API JavaScript / TypeScript

```js
const { publishReport, reportOptionsFromEnv } = require('allure-docker-publisher');
const summary = await publishReport({
  ...reportOptionsFromEnv(),
  baseURL: 'http://localhost:5050',
  projectId: 'esempio',
  resultsDir: 'allure-results',
  clean: true,
});
console.log(summary.reportURL);
```

Tipi TypeScript inclusi. I test verificano il contratto HTTP tramite risposte
simulate, autenticazione, allegati, errori e CLI. Serve una verifica sul tuo
server per confermare proxy, TLS e configurazione reale.

## Pubblicazione della libreria

Il repository può essere pubblicato su GitHub e installato direttamente da lì.
Per una futura release npm scegli nome/scope disponibile, autore e licenza;
poi esegui `npm publish` con un account npm autorizzato. La licenza è al momento
`UNLICENSED`: la pubblicazione GitHub non concede automaticamente una licenza
open source. Non sono inclusi credenziali o riferimenti a progetti aziendali.
