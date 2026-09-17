# Autonomous AI Playwright Test Agent

This project turns a natural-language user story into an executable Playwright test through a bounded multi-agent workflow. Gemini provides planning and failure reasoning; Playwright performs browser exploration and execution; Express serves the web UI.

## Implemented Agents

1. **Orchestrator**: owns workflow control, current-run state, repository reuse, routing, and retry limits.
2. **Explorer**: opens the application with Playwright and saves an application map.
3. **Planner**: creates a structured plan with deterministic fallback planning.
4. **Generator**: creates the Playwright specification and required page objects.
5. **Executor**: runs the specification in an isolated `npx playwright test` subprocess and captures stdout, stderr, status, and duration.
6. **Healer**: compares Explorer, Planner, Generator, and Executor evidence, identifies root cause, and returns a structured diagnostic package before repair.
7. **Report**: creates `execution-report.json` with workflow, execution, retry, and healing information.
8. **Evaluation**: runs after the Final Report and evaluates it read-only using five semantic categories.

## Prerequisites and Setup

- Node.js 16 or newer
- npm 8 or newer
- Gemini API access
- Playwright Chromium
- Network access to the configured application and Gemini

```bash
npm install
npx playwright install chromium
```

Create `.env` from `.env.example`:

```env
GOOGLE_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
APP_URL=https://www.saucedemo.com
DEFAULT_USERNAME=standard_user
DEFAULT_PASSWORD=secret_sauce
```

Optional settings:

```env
PLAYWRIGHT_MCP_URL=http://localhost:8080
LOG_LEVEL=info
LOG_DIR=logs
INTENTIONAL_TEST_FAILURE=false
PORT=3000
```

Never commit `.env` or expose API keys and credentials.

## Running

Web UI:

```bash
npm start
```

`npm start` builds the project and starts `dist/src/server.js`. Open `http://localhost:3000`.

The server loads `.env`, initializes the services and agents, then waits for a browser request. It does not run Explorer, Planner, Generator, Executor, Healer, Report, or Evaluation automatically. Those agents run only after a non-empty user story is submitted through `POST /api/execute`.

CLI:

```bash
npm run cli
```

Development:

```bash
npm run dev
npm run dev-server
```

## Cleanup

Remove generated application maps, the Excel scenario repository, generated tests, page objects, execution evidence, reports, logs, test results, and compiled output:

```bash
npm run clean
```

The cross-platform cleanup script is `scripts/clean.js`. It removes generated contents while keeping the repository directories available for the next run.

## Workflow

The UI sends `POST /api/execute` with `{ userStory }` to `src/server.ts`. The server streams progress over Server-Sent Events and exposes the completed report through `GET /api/last-report`.

The Orchestrator creates an `ExecutionContext`, resolves credentials, validates repository reuse, clears artifacts for a new run, then calls Explorer, Planner, Generator, and Executor. Every failed execution is sent to Healer for cross-stage diagnosis. The Orchestrator uses Healer's classification, root-cause explanation, suggested agents, confidence score, and evidence summary to select Explorer, Planner, Generator, Healer, or Executor recovery. It updates Excel, calls Report, and calls Evaluation only after the Final Report exists.

Explorer output is an application-map JSON file. Planner output is a `TestPlan`. Generator output is `repositories/tests/generated-scenarios.spec.ts` plus page objects. Executor output is `ExecutionResults`. Report output is `test-artifacts/execution-report.json`. The same `ExecutionContext` passes state between agents.

## Semantic Evaluation

Evaluation is deterministic and read-only. It does not rerun Playwright, modify code, heal, or regenerate artifacts.

Exactly five categories are produced:

1. Explorer Accuracy
2. Test Plan Accuracy
3. Generated Test Accuracy
4. Execution Accuracy
5. Report Accuracy

Criteria use `PASS`, `PARTIAL`, `FAIL`, or `NOT_EVALUABLE`. The evaluator maps requirements to evidence instead of comparing exact names, selector strings, action counts, array lengths, or positions.

The Test Plan evaluator understands equivalent wording such as `login` and `log in`, aggregate multi-product actions, navigation/state transitions, and verification. One planner step may cover several concepts, and several planner steps may cover one concept. Product names in a story are checked as semantic product coverage rather than as a required action count.

Scoring is deterministic:

- `PASS`: full weight
- `PARTIAL`: half weight
- `FAIL`: zero
- `NOT_EVALUABLE`: excluded from the denominator

The LLM does not assign the overall percentage.

## Intentional Failure and Recovery

Enable it with:

```env
INTENTIONAL_TEST_FAILURE=true
```

This is the only required intentional-failure toggle. Intentional failures do not run during server startup; they are selected only after a user story starts a workflow. Seed configuration is optional and disabled by default.

Routes include:

```text
Explorer failure  -> Explorer recovery -> Planner -> Generator -> Executor
Planner failure   -> Planner recovery -> Generator -> Executor
Generator failure -> Generator recovery -> Executor
Locator failure   -> Healer -> Executor
Assertion failure -> Generator -> Executor
```

The report records the selected type, affected agent, injected defect, reason, current run, recovery route, and recovery history. Explorer, Planner, and Generator failures are controlled by the Orchestrator. Executor-level defects mutate the generated source only when a matching target exists in the current test.

### Explorer Failure Route

When an intentional Explorer failure is selected, the Orchestrator first completes live exploration, then writes a reproducible invalid selector into the persisted application-map JSON. Planner can still describe the faulty selector and Generator still writes a Playwright test from that plan; Generator does not execute the browser or reject the plan. Executor is the runtime boundary, so the invalid selector fails there as `PLAYWRIGHT_RUNTIME_FAILURE`.

Healer receives the application map, Planner steps, generated source, and Executor diagnostics. For this mismatch it returns a diagnostic explaining that Explorer evidence and generated selectors are inconsistent, with the suggested route:

```text
Explorer -> Planner -> Generator -> Executor
```

The Orchestrator re-invokes each suggested agent, emits start/end progress events, and stops after the configured retry limit. The Final Report records the faulty map file and JSON line, Healer explanation, confidence, suggested route, and recovery history.

For generated source defects, the report also records the exact injected file and line. For Explorer, Planner, and Generator control-flow failures, the report records the Orchestrator source control point that selected the failure. The UI shows these values under **Intentional Failure Diagnostics**.

## Retry and Healing

The initial Executor invocation is not an attempt. Re-invocations are numbered `Attempt 1/3`, `Attempt 2/3`, and `Attempt 3/3`. The workflow stops at the retry limit, generates the Final Report, and preserves diagnostics.

`ExecutionContext.healingRecords` and `ExecutionContext.recoveryHistory` are the authoritative state used by the Report and UI. Healer analyzes all failed executions, but only a diagnostic with a safe repair route can trigger another execution. Explorer, Planner, Generator, and Executor each have a bounded role and observable hand-off.

The progress UI receives an agent-start and agent-end event for every initial and recovery invocation. A successful repair still displays `Healer Agent completed`, the suggested recovery agents, and the subsequent recovery route before Report and Evaluation.

The **Clear** button only clears the story input and visible UI panels. It does not delete application maps, test plans, generated tests, page objects, reports, logs, or execution evidence. Use `npm run clean` in the terminal to delete generated artifacts.

`INTENTIONAL_TEST_FAILURE=true` is loaded when the server starts and remains active for every user story until the server is restarted. Clearing or re-entering a story does not disable it.

## Artifacts and Storage

```text
repositories/application-maps/*.json          Explorer maps
repositories/tests/generated-scenarios.spec.ts Generated test
repositories/tests/page-objects/*.ts          Page objects
test-artifacts/execution-report.json           Final Report
test-plans.xlsx                                Scenario repository
logs/                                          Application logs
```

A new run clears generated test artifacts and page objects. Reuse is allowed only when the Excel scenario, application map, generated specification, and required page objects are all available.

## Direct Test Execution and Validation

```bash
npx playwright test repositories/tests/generated-scenarios.spec.ts
npx playwright test repositories/tests/generated-scenarios.spec.ts --headed
npm run build
npm test
```

`npm test` runs Playwright specifications under `repositories/tests`.

## Project Structure

```text
src/
  agents/       orchestrator, explorer, planner, generator, executor, healer, report, evaluator
  services/     config, excel, filesystem, llm, logger, playwright
  types.ts
  index.ts      CLI entry point
  server.ts     Express web server
public/index.html
repositories/
test-artifacts/
test-plans.xlsx
```

