# Rytm

AI medical reference for Ukrainian EMS paramedics: an online chat plus a planned offline dose calculator. Answers must come only from official sources (MoH protocols, drug instructions) with citations.

Read first:

- [CONTEXT.md](CONTEXT.md) — product, audience, principles, open decisions
- [AGENT_SPEC.md](AGENT_SPEC.md) — assistant behaviour contract (no-source refusal, dosing, answer format, hard rules)
- [protocols.md](protocols.md) — list of MoH protocol PDF URLs, candidate source base (not ingested yet)
- `apps/mobile/AGENTS.md` — Expo rules: fetch SDK 58 docs before using any Expo API

## Decisions already made

- **Doses are calculated by deterministic code, never by the LLM** (decided 2026-11-17, third and current version; it replaces both "no dose calculator" and "the LLM calculates, the backend verifies"). Full contract: AGENT_SPEC.md "Dosing". Built so far: the calculator package (KAN-94); no real rules, no chat wiring, no UI.
  - **Dosing rules** are structured records transcribed from the MoH protocols by the AI agent and checked against the PDFs by a doctor and an EMS instructor outside the app; the rule set keeps no approval record (decided 2026-11-18, KAN-93, [docs/dosing-rules.md](docs/dosing-rules.md)): drug, indication, route, per-kg dose or fixed dose per weight band, maximum dose, concentration, repeat interval, rounding, source document, page, order date and verbatim quote. No rule → no number.
  - **One calculator** applies a rule to the patient's parameters. It is a single implementation shared by the backend and the app (planned `packages/dosing`), so both modes give the same result.
  - **Online mode (chat):** the AI recognises the parameters in the message (drug, age, weight, condition) and adds short text with protocol quotes and citations. The app shows the recognised parameters for the user to confirm, then the backend calculator computes the dose. The dose block comes from the calculator, not from model text.
  - **Offline mode (calculator screen):** a form where the user picks the condition and drug and enters age, weight and state; the same calculator runs on the device with a bundled rule set. No AI, no network.
  - A missing parameter is asked for, never assumed. The calculator checks limits (maximum single dose, implausible weight for the age).
  - Every calculated dose shows the formula as applied, the protocol link and the protocol version date.
  - In AI text, numbers appear only as verbatim quotes from cited fragments (the existing number check stays). Foreign guidelines (UK Resus Council, ERC) may be quoted as a labelled comparison once ingested; dosing rules come from the MoH base only.
  - Sources stay at the end of a medical answer. An answer with no sources (a greeting, a question about Rytm itself) carries no sources block (KAN-90).

## Building it so the stores approve it

Recommendations collected on 2026-11-17 from the guideline text and reported review practice. Not an official Apple position, and no guarantee.

1. **Publisher.** App Store guideline 1.4.2 requires a drug dosage calculator to come from a hospital, university, pharmacy, manufacturer, insurer or other approved entity, or to have regulator approval. The offline calculator screen is plainly such a calculator, so this applies in full.
   - Publish from the organisation account of a hospital, medical university or EMS centre.
   - If that is impossible, attach an official letter from such an institution stating that it approves the clinical content.
   - Name the clinical reviewers (physician, pharmacist) in the store description and inside the app.
   - Without one of these the rest helps little. Tracked in KAN-9 and KAN-19.
2. **AI is the interface, not the source of numbers.** This is the architecture in "Decisions already made": the AI only recognises the request; the rule comes from the transcribed MoH rule set; deterministic code calculates; the recognised parameters are confirmed by the user; limits are checked; a drug or condition missing from the base gets a refusal; every answer carries the protocol link, its version date and the formula.
3. **Access and submission.** Verify that users are medical professionals (KAN-22) and describe the calculator honestly in Review Notes (KAN-19). Fallback if public review fails: distribution to specific services, or a web app.
4. **Separate from Apple:** whether this software is a medical device under Ukrainian law must be settled with a lawyer before release (KAN-13).
- **Offline calculator ships, reachable online too** (owner, 2026-11-18). It settles KAN-99: the calculator screen (KAN-100) is in scope, works with no network and is also opened from the chat. UI and features follow established EMS / paediatric dose-calculator apps.
- **Answer leads with the dose** (owner, 2026-11-18). The first sentence of a dosing answer is short and carries the dose: the calculator result when a rule exists, otherwise the protocol dose line quoted verbatim for the matching band. No filler. The LLM still never calculates.
- **Chat history on the device** (owner, 2026-11-18, KAN-104). Storage form is still open (patient data).
- **Publishing and legal work deferred** (owner, 2026-11-18): Rytm is a personal pet project for now; store and regulatory tickets (KAN-9 … KAN-24) wait until the end.
- **Claude via Messages API on our own backend**, not Managed Agents. The API key lives only in `apps/api/.env`; never in `apps/mobile` or any `EXPO_PUBLIC_*` variable.
- **No response flag** (decided 2026-11-18). The GREEN / YELLOW / RED flag is removed from the product: no level, no label, no confidence marker on any answer. A question the source base does not cover gets a plain refusal «Цього немає в базі протоколів МОЗ». KAN-101 removed it from the prompt, the API and the app (not yet run against the real API). Jira was updated the same day: KAN-41, KAN-65, KAN-66 closed, KAN-90 rewritten, flag text removed from the other tickets.
- Legal texts (terms, privacy, medical disclaimer) exist as drafts outside the repo; the consent screen is not built. Polishing is postponed.

## Backlog

The MVP backlog lives in Jira project `KAN` on `rytm.atlassian.net`. Created on 2026-11-17: 5 Epics, 81 tickets, 161 `Blocks` links. Added later the same day under KAN-7, without `Blocks` links: KAN-90 (short replies to non-medical messages; rewritten 2026-11-18) and KAN-91 (detect new and superseded MoH orders).

On 2026-11-18 the dosing tickets (KAN-10, KAN-12, KAN-36, KAN-63, KAN-64, KAN-73) were rewritten to the third version of the dosing decision, and epic KAN-92 was created for the calculator: KAN-93 … KAN-100 (local ids A5-01 … A5-08), with 14 `Blocks` links. KAN-100 (offline screen) is conditional on KAN-99.

| Epic | Key | Children |
|------|-----|----------|
| Launch readiness: store review, regulatory and legal risks | KAN-4 | KAN-9 … KAN-24 |
| App identity, splash screen and launch hand-off | KAN-5 | KAN-25 … KAN-31 |
| Chat UI for the field-reference MVP | KAN-6 | KAN-32 … KAN-48 |
| Ground the chat backend in the official MoH source base | KAN-7 | KAN-49 … KAN-76, KAN-90, KAN-91 |
| Deterministic dose calculator: approved dosing rules, online and offline | KAN-92 | KAN-93 … KAN-100 |
| Consent, medical disclaimer and sign-in gate | KAN-8 | KAN-77 … KAN-89 |

Each ticket description starts with a local id (`A0-01` … `A4-14`) used for cross-references in ticket text. KAN-1 … KAN-3 are Jira template placeholders, unrelated.

Decisions that block the most work:

- KAN-22 auth method and professional gating. Blocks sign-in, session, consent order and API auth.
- KAN-10 intended-purpose statement → KAN-13 regulatory classification opinion → KAN-12 which assistant behaviours to keep. KAN-12 blocks the system prompt (KAN-63).
- KAN-9 publishing legal entity. Google Play requires an Organization account for medical apps.
- KAN-21 whether a static medical reminder line appears in the chat UI in addition to the consent screen.
- KAN-77 first-launch order of consent and sign-in.

Unblocked today: KAN-32, KAN-34, KAN-37, KAN-74, KAN-78, KAN-79.

Session of 2026-11-18 (orchestrator):

- In Review: KAN-90 (non-medical replies; «Дякую» after a medical turn still gets a protocol answer), KAN-94 (`packages/dosing`), KAN-101, KAN-74.
- KAN-93 decided, record in [docs/dosing-rules.md](docs/dosing-rules.md); waiting for the owner's review of that file.
- KAN-105 (chat UI overhaul): Blocked. Own steps built and QA'd on web; open: empty web `document.title`, square focus ring; HIGH audit items belong to KAN-43 (needs the footnote text) and KAN-36 (table columns hidden at 360 px).
- Created: KAN-104 (chat history), KAN-105.
- Retrieval fix without a ticket: patient numbers and age/weight units are dropped from the query (`toQueryTerms`).
- Proposed follow-ups, not created: web title and focus ring; classify short follow-ups before the history-joined retrieval; newborn weight in grams; volume precision for non-terminating volumes; a refusal mixed into a cited answer.

Findings from planning that are not in the code or the specs:

- Research suggests the product as designed may qualify as medical device software (AGENT_SPEC RED asking for patient age / weight, YELLOW "recommendations", the per-answer flag, removed on 2026-11-18). This is an inference, not a legal opinion; the MDCG quotes came from an unofficial copy. Tracked in KAN-13.
- The 2026-11-17 dose-calculation decision adds a patient-specific output, which makes the device inference stronger and the Anthropic "general information" exclusion less likely to apply (KAN-13, KAN-14).
- App Store guideline 1.4.2 (read 2026-11-17): drug dosage calculators must come from a manufacturer, hospital, university, insurer, pharmacy or other approved entity, or have regulator approval. Apple does not define whether a chat counts; a calculator form does. Tracked in KAN-19. Google Play has no equivalent rule but its "not a medical device" disclaimer becomes harder to justify (KAN-20).
- App Store search for "pedi help" on 2026-11-17 returned five dosing-related apps: three from institutions (a professional society, a university, a hospital network) and two from private LLCs, one of them released in 2024. Judged by names and sellers only, the apps were not opened. Pedi Help (id 1019521365), an individual developer's calculator, is no longer listed in any of five countries checked; the reason is unknown.
- The MoH anaphylaxis protocol (section 3.4 in the ingested base) gives epinephrine as a fixed dose per weight band (25 kg or more / under 25 kg), not per kg. The reference answer pasted into KAN-63 uses a per-kg dose and reaches a different number for the same child. Dosing rules must support fixed-dose bands, and that reference is a format example only.
- Foreign guidelines are not in `protocols.md`, their reuse rights are unknown (KAN-15), and no ingestion ticket exists for them.
- `protocols.md` lines 26 and 27 are the same URL. Annexes 2 and 5 of order 1555 exist on moz.gov.ua and are not listed. Open question to the product owner in KAN-53.
- `protocols.md` lines 16–19 (order 714) look like image-only scans, judged by a byte-level heuristic without a PDF library. They need OCR plus human review (KAN-57).
- AGENT_SPEC conflicts with itself and with the streaming contract: the backend must reject dosing answers with unverified numbers, which is only possible after generation. Decided in KAN-64 / KAN-67.
- Found by reading `use-chat.ts`, not by running it: two fast taps on Send may start two requests, and Stop marks a partial answer as `done`. Confirm in KAN-32 before fixing in KAN-38.
- The reference chat in the `zax` repo ports almost nothing: its markdown parser has no tables or links, and its typewriter and keyboard handling are bound to that app.

## Agents

Project subagents live in `.claude/agents/`. Start a coordinated session with `claude --agent orchestrator`. Defined on 2026-11-17; first run on real tickets on 2026-11-18 (KAN-90, KAN-93, KAN-94, KAN-105).

| Agent | Role | Edits code | Model |
|-------|------|------------|-------|
| `orchestrator` | Reads a KAN ticket, checks blockers, briefs the others, reports what is verified and what is not | one-liners only | opus |
| `designer` | UI spec before a screen is built; design review of the Expo web build after | no | opus |
| `fe-developer` | `apps/mobile` | yes | sonnet by default; orchestrator picks per task |
| `be-developer` | `apps/api`: endpoints, SSE, auth, persistence, ingestion, retrieval, deterministic checks on answers | yes | opus |
| `ai-developer` | `systemPrompt.ts` and model params in `claudeChatStream.ts` | yes | opus |
| `code-reviewer` | Independent review of the diff, 1–10 score, before QA | no | opus |
| `qa-tester` | Executes the change: API contract via curl, Expo web in Chrome | no | sonnet |
| `product-manager` | Runs synthetic scenarios against `/chat`, grades answers against `AGENT_SPEC.md` | no | sonnet |

Order for a ticket: `designer` spec (UI tickets only) → developer → `code-reviewer` → `qa-tester` (plus `designer` review if there was a spec). Answer-behaviour tickets loop `product-manager` ↔ `ai-developer`.

Rules shared by all of them:

- A report is a claim until it shows evidence. "Verified" means executed in that session; otherwise "implemented, not run". QA verdicts `PARTIAL` and `BLOCKED` are not a pass.
- No agent runs a simulator or device. Native iOS / Android behaviour is checked by the owner.
- QA, design review and `product-manager` need servers the owner starts: `pnpm api` (`:3001`) and `npx expo start --web` (`:8081`). The web build is itself unverified (see Current state), so the first QA or design review may come back `BLOCKED`.
- `product-manager` runs spend real Anthropic API tokens. Until the source base exists (KAN-7), the assistant refuses medical questions with no medical content, so that loop can only check refusal and format.
- Only `orchestrator` writes to Jira. Without asking, it may add one closing comment to the ticket it worked and move that ticket to `In Review` (only when the work is done, or implemented with the unverified parts listed). Moving to `Done`, editing fields, and creating, linking or deleting issues still need the owner's confirmation in that session. KAN statuses: `To Do`, `In Progress`, `In Review`, `Done`.

## Structure

pnpm monorepo, Node 22.

| Path | What |
|------|------|
| `apps/api` | `@rytm/api` — Hono + `@hono/node-server`, TypeScript ESM, `@anthropic-ai/sdk` |
| `apps/mobile` | `@rytm/mobile` — Expo SDK 58, React Native 0.88, Expo Router, React Compiler on |
| `packages/dosing` | `@rytm/dosing` — rule types, validating rule-set loader, `calculateDose` (exact bigint decimals). TS source exported directly (`exports` → `src/index.ts`, internal `#*` imports), no build step. Dependency of both apps, not wired yet. Chat contract types are still duplicated in both apps |

### apps/api/src

- `server.ts` — entry; fails fast without `ANTHROPIC_API_KEY`; port from `PORT` (default 3001)
- `app.ts` — CORS, `GET /health`, `POST /chat` (SSE), aborts the Claude request on client disconnect
- `chatRequest.ts` — body validation (`MAX_MESSAGES = 50`, `MAX_CONTENT_LENGTH = 8000`)
- `claudeChatStream.ts` — `client.beta.messages.stream`: model `claude-opus-5-5`, adaptive thinking, effort `medium`, `max_tokens` 16000, beta `server-side-fallback-2026-07-01` with `fallbacks: 'default'`, cached system prompt
- `chatErrorMessage.ts` — SDK errors → user-safe Ukrainian messages; logs only error name/status/type
- `systemPrompt.ts` — frozen prompt. Legacy "source base not connected" mode: every medical question gets «Цього немає в базі протоколів МОЗ» and no medical content (since KAN-101, no flag)

### apps/mobile/src

- `app/_layout.tsx`, `app/index.tsx` — thin routes; a single Stack screen titled "Rytm"
- `features/chat/` — `use-chat.ts` (state, cancel, retry), `stream-chat.ts` (`expo/fetch`), `parse-sse-stream.ts`, `chat-messages.ts`, `types.ts`, `constants.ts`, `components/`
- `components/themed-text.tsx`, `components/themed-view.tsx`, `constants/theme.ts`, `hooks/` — reuse these

## Chat contract

- `GET /health` → `200 {"status":"ok"}`
- `POST /chat`, body `{ "messages": [{ "role": "user" | "assistant", "content": string }] }`, full history each time, last message from `user`
- Invalid body → `400 {"error": string}` as JSON
- Valid → `text/event-stream`. Legacy mode (default, `GROUNDED_MODE` unset):
  - `event: delta` / `data: {"text": string}` — many
  - `event: done` / `data: {"stopReason": string}` — once on success
  - `event: error` / `data: {"message": string}` — then the stream closes; a model refusal is sent as `error`
- Grounded mode (`GROUNDED_MODE=1` in `apps/api/.env`): the answer is buffered and number-checked on the server (decided 2026-11-17: buffer, no retract), then:
  1. `event: delta` / `{"text": string}` — the model text as-is; one today, clients must accept many
  2. `event: citations` / `{"items": [{"id", "orderNumber", "orderDate": "YYYY-MM-DD", "annex": string|null, "title": section heading, "page": number, "url": "https://moz.gov.ua/…#page=N", "attribution": "moz.gov.ua", "validity": "unknown"|"in_force"}]}` — once, deduplicated, may be empty
  3. `event: done` / `{"stopReason": string}` — model stop reason, `"no_sources"` (body is «Цього немає в базі протоколів МОЗ»), `"conversation"` (the message is not medical: a short reply with empty citations, KAN-90) or `"withheld"` (a number in a text block is not in the fragments that block cites; body is «Відповідь приховано: числа не підтверджені цитованими джерелами», followed by the cited tables verbatim when any were cited)
  - `event: error` replaces all of the above when the source base fails to load, the API fails or the model refuses

## Commands

```sh
pnpm api                               # backend, tsx watch, http://localhost:3001
pnpm mobile                            # expo start
pnpm --filter @rytm/api typecheck
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

Setup: copy `apps/api/.env.example` to `apps/api/.env` and set `ANTHROPIC_API_KEY`. Mobile reads `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`; Android emulator needs `http://10.0.2.2:3001`).

Install mobile dependencies with `npx expo install`, never plain `pnpm add`.

## Git

Applies to every agent in this repo and overrides the owner's global "I commit myself" rule.

- When the owner asks for a commit, run `git add` and `git commit` yourself. Do not ask again whether to do it.
- Never `git push`. The owner pushes.
- No `Co-Authored-By: Claude` trailer, no other AI attribution and no `QA:` line. Message: Conventional Commits subject plus optional bullets.
- Stage only the files that belong to the change, by path. Never `git add -A` or `git add .`: the working tree usually holds other sessions' work.
- Do not commit without being asked.

## Conventions specific to this repo

- `apps/mobile`: kebab-case file names, `@/` import alias, route files default-export (Expo Router requires it), everything else named exports. No manual `useMemo` / `useCallback` / `memo` — React Compiler handles it.
- `apps/api`: camelCase file names named by content, relative imports with `.js` extension (NodeNext ESM).
- UI copy and assistant answers are in Ukrainian; code, identifiers and docs in English.

## Current state

Working and verified (2026-11-18):

- Grounded `/chat` against the real API: cited answers with the `citations` event; «дозування адреналіну 20 років 70 кг при анафілаксії» returns section 3.4 of order 1269 with no dose arithmetic (one run).
- Non-medical messages get short `conversation` replies with no sources (16 of 17 scenarios, one run each).
- Expo web (QA): send, stop, retry, error paths, empty state with examples, new composer.
- `@rytm/dosing`: 31 unit tests on synthetic rules; resolves in api tsc, mobile tsc and an `expo export --platform web` bundle.

Not verified:

- Native iOS / Android after 2026-11-18: composer autogrow, keyboard, BigInt on Hermes
- Legacy mode (`GROUNDED_MODE` unset) after KAN-90
- Prompt-cache hits for the conversation prompt

Known baseline errors (not regressions):

- `expo lint`: `react-hooks/set-state-in-effect` in `src/hooks/use-color-scheme.web.ts`
- The old `tsc` error about `@/global.css` in `theme.ts` no longer appears

## Known gaps

- **Security:** `/chat` has no auth and CORS is `*`. Local development only; anyone who can reach the port spends tokens on the key.
- The source base is ingested and searched by BM25 only (no embeddings); scanned order 714 annexes are not in it (KAN-57).
- **Conversation route (KAN-90):** a message with no cited fragments goes to a classifier call (`CONVERSATION_SYSTEM_PROMPT`). If it wrongly labels a medical message `conversation`, its reply reaches the user without sources. Deterministic guards catch any number and replies the retrieval index matches; advice without numbers in ordinary wording («Охолодіть опік проточною водою») is not caught. The classifier prompt is the main control.
- No consent screen, auth, persistence or database.
- No real dosing rules (KAN-95), no parameter recognition or confirmation (KAN-96 … KAN-98) and no calculator screen (KAN-100). Until they exist the assistant refuses to calculate and quotes the protocol.
- Answers are long: the dose is buried in text (owner, 2026-11-18). The prompt rewrite for the dose-first format is pending.
- Offline rule-set updates and how a stale rule set is shown are undecided.
- `apps/mobile/package.json` gained `eslint` and `eslint-config-expo`, auto-installed by `expo lint`.
