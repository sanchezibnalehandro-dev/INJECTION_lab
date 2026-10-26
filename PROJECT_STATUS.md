# INJECTION LAB — Current Project Status

> **Canonical current-state document for the `stage-mode-ui` branch.**
>
> Read this before changing code, prompts, provider configuration, or the live-demo launcher.
> The older `INJECTION_LAB_CODEX_HANDOFF.md` is retained as historical architecture/design context and is not the runtime source of truth.

## 1. Purpose and authorized scope

INJECTION LAB is a **local, authorized educational demonstration harness** for explaining prompt injection and defensive AI architecture.

The lab is intentionally constrained:

- it targets only this project’s own demo application;
- all canaries, employee/user records, environment values, documents, and tool results are synthetic fixtures;
- it contains no real corporate records, passwords, API keys, or third-party secrets;
- the synthetic `web_fetch` path does not perform arbitrary external browsing;
- the goal is reproducible model-behavior comparison, live teaching, evaluator validation, and defense-in-depth discussion;
- it is not a platform for exploiting external systems or real users.

When project discussions mention an “attack”, “leak”, “secret”, “employee record”, or “prompt injection”, they refer to these synthetic, server-owned demo fixtures unless explicitly stated otherwise.

## 2. Source of truth

Current branch: `stage-mode-ui`.

Code baseline referenced by this document: `7cb374152679bd918026469f242a99454dae5669` (“Localize Stage Mode presenter UI”). Documentation-only commits may move the branch head without changing the runtime code.

Primary current sources:

- `README.md` — quick start, provider configuration, experiment suites, runtime notes.
- `PROJECT_STATUS.md` — this document; current operational and project context.
- `src/demo/vulnerableLab.ts` — the seven Stage Mode scenarios and their synthetic fixtures.
- `src/demo/brianReplication.ts` — hash-locked Brian Vermeer replication source mapping.
- `fixtures/brian-replication/prompt_injection_prompts_by_order.md` — approved source-exact Brian prompt baseline.
- `START_INJECTION_LAB.bat` — recommended Windows live-demo launcher.
- `.env.example` — supported server-side environment variable names, without secrets.

`INJECTION_LAB_CODEX_HANDOFF.md` documents the original build brief and evolution of the architecture. Some names and assumptions in it are intentionally historical.

## 3. Current Stage Mode

Stage Mode is the presenter-facing live interface. Its shell is localized into Russian, while source attack payloads and raw model output remain source-exact/raw where fidelity matters.

The intentionally vulnerable educational suite contains exactly seven frozen scenarios:

1. **Direct Override** — loss of trust boundary when application instructions and user input share one textual context.
2. **Structured / JSON Pressure** — mandatory output structure competes with a text-only non-disclosure rule.
3. **Roleplay** — auditor/context framing competes with the same text-only rule.
4. **Combined** — role framing plus structured-output pressure.
5. **Multi-turn** — three-step escalation with native access to immutable synthetic employee records.
6. **Payload Splitting** — sensitive fields are requested as separate benign-looking parts and recombined.
7. **Document Injection** — an instruction is embedded in ordinary server-owned document text.

The evaluator is deliberately narrow: it reports only deterministic disclosure evidence from the final assistant response. A successful HTTP request is not, by itself, a claim that a model is “vulnerable”.

## 4. Providers and model configuration

Stage Mode currently exposes:

- **GigaChat**, defaulting to `GigaChat-2` when configured;
- **OpenAI**, with the configured comparison catalog.

DeepSeek remains implemented as an adapter but is not exposed in the current live Stage Mode catalog.

Secrets are server-only. Never add `NEXT_PUBLIC_` prefixes to provider credentials and never commit `.env.local`.

GigaChat accepts either:

- preferred: `GIGACHAT_AUTHORIZATION_KEY`;
- fallback: `GIGACHAT_CLIENT_ID` + `GIGACHAT_CLIENT_SECRET`.

Current scope: `GIGACHAT_API_PERS`.

## 5. Windows launch: important TLS requirement

For the Windows demo machine, **use `START_INJECTION_LAB.bat` for the live GigaChat path**.

The launcher sets `NODE_EXTRA_CA_CERTS` to:

`certs/russian_trusted_root_ca_pem.crt`

when that certificate exists and the variable is not already set.

This matters because Node reads extra trust roots at process startup. Putting `NODE_EXTRA_CA_CERTS` into `.env.local` is too late.

Known failure mode:

- app and `/api/demo-config` return 200;
- GigaChat `POST /api/chat` returns 502;
- the same request succeeds once Node is started with the project CA.

If this happens, first verify the launcher/CA/process environment. Do not immediately change provider code, credentials, dependencies, or prompts.

For manual terminal launch with GigaChat, set `NODE_EXTRA_CA_CERTS` **before** starting Node.

## 6. Known-good runtime checks recorded for this project

The documented preflight established:

- tests: 38/38 passed;
- lint: passed;
- TypeScript typecheck: passed;
- production build: passed after regeneration of a corrupted local Turbopack cache;
- OpenAI `gpt-4o-mini`: real `/api/chat` request passed;
- Vulnerable Lab Direct Override UI flow: passed;
- evaluator/reset/re-run flow: passed;
- document analysis route: passed, with expected synthetic canary disclosure in the intentionally vulnerable document scenario;
- GigaChat-2: safe request returned HTTP 200 when launched with the project CA;
- GigaChat-2 Direct Override: HTTP 200 and evaluator detected the synthetic canary;
- browser/runtime console: no subsequent errors in the verified path.

These are reproducibility notes, not a promise that any provider will always return the same model behavior.

## 7. Synthetic data and safety invariants

Do not replace project fixtures with real data for a live demo.

Current safety invariants:

- server resolves the profile and inserts server-owned system/tool/fixture configuration;
- the browser cannot replace those server-owned fixtures;
- employee/user/environment records are immutable synthetic datasets;
- leak canaries are synthetic;
- tool outputs never expose the machine’s real `process.env`;
- credentials and access tokens must never be rendered, logged, copied into screenshots, or committed;
- `.env.local` is Git-ignored.

## 8. Prompt fidelity and localization

Do **not** casually translate or rewrite runtime attack payloads immediately before a demo.

Changing the wording changes the experiment and may change provider behavior.

Current rule:

- localize the presenter shell, labels, descriptions, and explanatory copy;
- preserve source-exact Brian payloads where replication fidelity is required;
- preserve raw provider responses;
- if a Russian explanation is desired, add separate display/explanatory copy rather than silently changing the runtime prompt.

Brian replication is hash-locked specifically to detect source drift.

## 9. Live-demo operating procedure

Before a live session:

1. Confirm `.env.local` exists and credentials are present without printing values.
2. On Windows, start with `START_INJECTION_LAB.bat` when GigaChat is part of the demo.
3. Confirm `GET /` and `GET /api/demo-config` are healthy.
4. Run one safe provider request.
5. Run one synthetic Direct Override smoke test.
6. Press **СБРОС** so the presentation starts from a clean context.
7. Do not change code, dependencies, provider credentials, prompts, or Git state after the final successful smoke test unless a concrete failure requires it.

For repeated scenario/model comparisons, reset context between runs.

## 10. Repository hygiene

Expected local-only items may include:

- `.env.local` — ignored; contains provider credentials;
- `next-env.d.ts` — generated by Next.js and may change between dev/build modes;
- local presentation/reference material such as `Промпт инъекции/` — not part of the runtime unless intentionally added.

Never commit real provider credentials or access tokens.

Before a documentation/code commit, inspect the exact staged file list.

## 11. Presentation logic

The current presentation uses the lab as a separate live-demo screen:

**slide explains mechanism → switch to INJECTION LAB → run frozen scenario → return to slides.**

The conceptual escalation is:

Direct Override → Structured Pressure → Role/Context Framing → Combined → Multi-turn → Payload Splitting → Indirect/Document Injection → agent/tool blast radius → defense in depth.

The live lab and the presentation are separate artifacts. The slide deck does not need to duplicate full attack prompts.

## 12. ChatGPT Project reference materials

The associated ChatGPT Project currently contains source/reference materials including:

- Brian Vermeer transcript: `5,5_prompt_injection_techniques_in_15_minutes_by_Brian_Vermeer_Full(1).txt`;
- ordered prompt extraction: `prompt_injection_prompts_by_order(1).md`;
- architecture deck: `AI_Prompt_Injection_Architectures.pptx`;
- generated/reworked presentation slide images and PDFs from the presentation workflow.

These are reference/presentation assets, not runtime secrets.

## 13. Change policy

When the lab is known-good, prefer small, isolated changes.

For runtime changes:

- inspect first;
- change one concern at a time;
- do not mix documentation, dependency updates, prompt rewrites, provider changes, and UI changes in one emergency fix;
- run targeted checks before broad checks;
- preserve synthetic-only safety boundaries;
- do not “fix” a model response merely because a particular injection did or did not disclose a canary.

For documentation-only work, do not touch runtime source files.
