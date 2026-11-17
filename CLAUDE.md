# Rytm

AI medical reference for Ukrainian EMS paramedics: an online chat plus a planned offline dose calculator. Answers must come only from official sources (MoH protocols, drug instructions) with citations.

Read first:

- [CONTEXT.md](CONTEXT.md) — product, audience, principles, open decisions
- [AGENT_SPEC.md](AGENT_SPEC.md) — assistant behaviour contract (flags, dosing, answer format, hard rules)
- [protocols.md](protocols.md) — list of MoH protocol PDF URLs, candidate source base (not ingested yet)
- `apps/mobile/AGENTS.md` — Expo rules: fetch SDK 58 docs before using any Expo API

## Decisions already made

- **Doses are calculated by deterministic code, never by the LLM** (decided 2026-11-17, third and current version; it replaces both "no dose calculator" and "the LLM calculates, the backend verifies"). Full contract: AGENT_SPEC.md "Dosing". Nothing of this is built yet.
  - **Dosing rules** are structured records transcribed from the MoH protocols by a person and approved by a named clinician: drug, indication, route, per-kg dose or fixed dose per weight / age band, maximum dose, concentration, repeat interval, source document, page and version date. No approved rule → no number.
  - **One calculator** applies a rule to the patient's parameters. It is a single implementation shared by the backend and the app (planned `packages/dosing`), so both modes give the same result.
  - **Online mode (chat):** the AI recognises the parameters in the message (drug, age, weight, condition) and adds short text with protocol quotes and citations. The app shows the recognised parameters for the user to confirm, then the backend calculator computes the dose. The dose block comes from the calculator, not from model text.
  - **Offline mode (calculator screen):** a form where the user picks the condition and drug and enters age, weight and state; the same calculator runs on the device with a bundled rule set. No AI, no network.
  - A missing parameter is asked for, never assumed. The calculator checks limits (maximum single dose, implausible weight for the age).
  - Every calculated dose shows the formula as applied, the protocol link and the protocol version date.
  - In AI text, numbers appear only as verbatim quotes from cited fragments (the existing number check stays). Foreign guidelines (UK Resus Council, ERC) may be quoted as a labelled comparison once ingested; dosing rules come from the MoH base only.
  - The flag stays the first line of a medical answer and sources stay at the end. An answer with no sources (a greeting, a question about Rytm itself) carries no flag explanation boilerplate and no sources block (KAN-90).

## Building it so the stores approve it

Recommendations collected on 2026-11-17 from the guideline text and reported review practice. Not an official Apple position, and no guarantee.

1. **Publisher.** App Store guideline 1.4.2 requires a drug dosage calculator to come from a hospital, university, pharmacy, manufacturer, insurer or other approved entity, or to have regulator approval. The offline calculator screen is plainly such a calculator, so this applies in full.
   - Publish from the organisation account of a hospital, medical university or EMS centre.
   - If that is impossible, attach an official letter from such an institution stating that it approves the clinical content.
   - Name the clinical reviewers (physician, pharmacist) in the store description and inside the app.
   - Without one of these the rest helps little. Tracked in KAN-9 and KAN-19.
2. **AI is the interface, not the source of numbers.** This is the architecture in "Decisions already made": the AI only recognises the request; the rule comes from the approved base; deterministic code calculates; the recognised parameters are confirmed by the user; limits are checked; a drug or condition missing from the base gets a refusal; every answer carries the protocol link, its version date and the formula.
3. **Access and submission.** Verify that users are medical professionals (KAN-22) and describe the calculator honestly in Review Notes (KAN-19). Fallback if public review fails: distribution to specific services, or a web app.
4. **Separate from Apple:** whether this software is a medical device under Ukrainian law must be settled with a lawyer before release (KAN-13).
- **Claude via Messages API on our own backend**, not Managed Agents. The API key lives only in `apps/api/.env`; never in `apps/mobile` or any `EXPO_PUBLIC_*` variable.
- **Flag (GREEN / YELLOW / RED)** will be computed on the backend from deterministic signals plus model self-assessment. Today the model only writes it as the first text line.
- Legal texts (terms, privacy, medical disclaimer) exist as drafts outside the repo; the consent screen is not built. Polishing is postponed.

## Backlog

The MVP backlog lives in Jira project `KAN` on `rytm.atlassian.net`. Created on 2026-11-17: 5 Epics, 81 tickets, 161 `Blocks` links. Added later the same day under KAN-7, without `Blocks` links: KAN-90 (no flag on non-medical answers) and KAN-91 (detect new and superseded MoH orders).

The dosing tickets (KAN-10, KAN-12, KAN-36, KAN-63, KAN-64, KAN-73) still describe the second version of the dosing decision ("the LLM calculates, the backend verifies"). They are stale against "Decisions already made" until rewritten. No tickets exist yet for the dosing rule base, the shared calculator, the parameter-confirmation step or the offline calculator screen.

| Epic | Key | Children |
|------|-----|----------|
| Launch readiness: store review, regulatory and legal risks | KAN-4 | KAN-9 … KAN-24 |
| App identity, splash screen and launch hand-off | KAN-5 | KAN-25 … KAN-31 |
| Chat UI for the field-reference MVP | KAN-6 | KAN-32 … KAN-48 |
| Ground the chat backend in the official MoH source base | KAN-7 | KAN-49 … KAN-76, KAN-90, KAN-91 |
| Consent, medical disclaimer and sign-in gate | KAN-8 | KAN-77 … KAN-89 |

Each ticket description starts with a local id (`A0-01` … `A4-14`) used for cross-references in ticket text. KAN-1 … KAN-3 are Jira template placeholders, unrelated.

Decisions that block the most work:

- KAN-22 auth method and professional gating. Blocks sign-in, session, consent order and API auth.
- KAN-10 intended-purpose statement → KAN-13 regulatory classification opinion → KAN-12 which assistant behaviours to keep. KAN-12 blocks the system prompt (KAN-63), the flag algorithm (KAN-65) and the flag UI (KAN-41).
- KAN-9 publishing legal entity. Google Play requires an Organization account for medical apps.
- KAN-21 whether a static medical reminder line appears in the chat UI in addition to the consent screen.
- KAN-77 first-launch order of consent and sign-in.

Unblocked today: KAN-32, KAN-34, KAN-37, KAN-74, KAN-78, KAN-79.

Findings from planning that are not in the code or the specs:

- Research suggests the product as designed may qualify as medical device software (AGENT_SPEC RED asking for patient age / weight, YELLOW "recommendations", the per-answer flag). This is an inference, not a legal opinion; the MDCG quotes came from an unofficial copy. Tracked in KAN-13.
- The 2026-11-17 dose-calculation decision adds a patient-specific output, which makes the device inference stronger and the Anthropic "general information" exclusion less likely to apply (KAN-13, KAN-14).
- App Store guideline 1.4.2 (read 2026-11-17): drug dosage calculators must come from a manufacturer, hospital, university, insurer, pharmacy or other approved entity, or have regulator approval. Apple does not define whether a chat counts; a calculator form does. Tracked in KAN-19. Google Play has no equivalent rule but its "not a medical device" disclaimer becomes harder to justify (KAN-20).
- App Store search for "pedi help" on 2026-11-17 returned five dosing-related apps: three from institutions (a professional society, a university, a hospital network) and two from private LLCs, one of them released in 2024. Judged by names and sellers only, the apps were not opened. Pedi Help (id 1019521365), an individual developer's calculator, is no longer listed in any of five countries checked; the reason is unknown.
- The MoH anaphylaxis protocol (section 3.4 in the ingested base) gives epinephrine as a fixed dose per weight band (25 kg or more / under 25 kg), not per kg. The reference answer pasted into KAN-63 uses a per-kg dose and reaches a different number for the same child. Dosing rules must support fixed-dose bands, and that reference is a format example only.
- Foreign guidelines are not in `protocols.md`, their reuse rights are unknown (KAN-15), and no ingestion ticket exists for them.
- `protocols.md` lines 26 and 27 are the same URL. Annexes 2 and 5 of order 1555 exist on moz.gov.ua and are not listed. Open question to the product owner in KAN-53.
- `protocols.md` lines 16–19 (order 714) look like image-only scans, judged by a byte-level heuristic without a PDF library. They need OCR plus human review (KAN-57).
- AGENT_SPEC conflicts with itself and with the streaming contract: the backend must reject dosing answers with unverified numbers, which is only possible after generation; and "every answer starts with a flag" cannot hold for a flag computed after generation. Decided in KAN-64 / KAN-67.
- Anthropic citations cannot be combined with structured outputs, so the model's flag has to be parsed from text or come from a second call (KAN-65).
- Found by reading `use-chat.ts`, not by running it: two fast taps on Send may start two requests, and Stop marks a partial answer as `done`. Confirm in KAN-32 before fixing in KAN-38.
- The reference chat in the `zax` repo ports almost nothing: its markdown parser has no tables or links, and its typewriter and keyboard handling are bound to that app.

## Agents

Project subagents live in `.claude/agents/`. Start a coordinated session with `claude --agent orchestrator`. Defined on 2026-11-17; none has been run on a real ticket yet.

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
- `product-manager` runs spend real Anthropic API tokens. Until the source base exists (KAN-7), the assistant returns RED with no medical content, so that loop can only check flag, refusal and format.
- Only `orchestrator` writes to Jira. Without asking, it may add one closing comment to the ticket it worked and move that ticket to `In Review` (only when the work is done, or implemented with the unverified parts listed). Moving to `Done`, editing fields, and creating, linking or deleting issues still need the owner's confirmation in that session. KAN statuses: `To Do`, `In Progress`, `In Review`, `Done`.

## Structure

pnpm monorepo, Node 22.

| Path | What |
|------|------|
| `apps/api` | `@rytm/api` — Hono + `@hono/node-server`, TypeScript ESM, `@anthropic-ai/sdk` |
| `apps/mobile` | `@rytm/mobile` — Expo SDK 58, React Native 0.88, Expo Router, React Compiler on |
| `packages/*` | planned, empty. Chat contract types are duplicated in both apps for now. `packages/dosing` (dosing rules plus the calculator, shared by both apps) is planned here |

### apps/api/src

- `server.ts` — entry; fails fast without `ANTHROPIC_API_KEY`; port from `PORT` (default 3001)
- `app.ts` — CORS, `GET /health`, `POST /chat` (SSE), aborts the Claude request on client disconnect
- `chatRequest.ts` — body validation (`MAX_MESSAGES = 50`, `MAX_CONTENT_LENGTH = 8000`)
- `claudeChatStream.ts` — `client.beta.messages.stream`: model `claude-opus-5-5`, adaptive thinking, effort `medium`, `max_tokens` 16000, beta `server-side-fallback-2026-07-01` with `fallbacks: 'default'`, cached system prompt
- `chatErrorMessage.ts` — SDK errors → user-safe Ukrainian messages; logs only error name/status/type
- `systemPrompt.ts` — frozen prompt. Currently in "source base not connected" mode: every medical question gets RED and no medical content

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
- Grounded mode (`GROUNDED_MODE=1` in `apps/api/.env`): the answer is buffered and number-checked on the server (decided 2026-11-17: buffer, no retract; flag sent first as its own event), then:
  1. `event: flag` / `{"level": "GREEN"|"YELLOW"|"RED", "explanation": string}`; an unparseable flag line becomes RED «Рівень не визначено моделлю»
  2. `event: delta` / `{"text": string}` — body without the flag line; one today, clients must accept many
  3. `event: citations` / `{"items": [{"id", "orderNumber", "orderDate": "YYYY-MM-DD", "annex": string|null, "title": section heading, "page": number, "url": "https://moz.gov.ua/…#page=N", "attribution": "moz.gov.ua", "validity": "unknown"|"in_force"}]}` — once, deduplicated, may be empty
  4. `event: done` / `{"stopReason": string}` — model stop reason, `"no_sources"` (RED «відповіді немає в базі джерел») or `"withheld"` (RED, a number in a text block is not in the fragments that block cites; body is the cited tables verbatim or a fixed sentence)
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

Working and verified:

- Backend streams a real Claude answer over `/chat` (checked with curl): Ukrainian, starts with `🔴 RED`, gives no numbers.
- The chat screen renders in Expo Go on the iOS simulator (empty state only).

Not verified:

- Sending a message from the app itself, on any platform
- The `done` event, refusal path, fallback and prompt-cache hits against the real API
- Android and web
- Keyboard handling: `KeyboardAvoidingView` has no header-height offset, the composer may hide behind the keyboard

Known baseline errors, inherited from the Expo template (not regressions):

- `tsc` in `apps/mobile`: `src/constants/theme.ts` — no type declarations for the `@/global.css` import
- `expo lint`: `react-hooks/set-state-in-effect` in `src/hooks/use-color-scheme.web.ts`

## Known gaps

- **Security:** `/chat` has no auth and CORS is `*`. Local development only; anyone who can reach the port spends tokens on the key.
- No source base: no ingestion, retrieval or citations. The assistant cannot answer medical questions yet.
- The model writes markdown (`**bold**`, lists); the app renders plain text, so the markup shows as-is.
- No consent screen, auth, persistence or database.
- No dosing rule base, no calculator, no parameter-confirmation step and no offline mode exist in code. Until they do, the running assistant keeps today's behaviour: it refuses to calculate and quotes the protocol. `systemPrompt.ts` already matches the rule "the LLM never calculates"; it changes only when the calculator is wired in.
- Offline mode has no design yet: how the bundled rule set is updated, how a stale rule set is shown, and whether it ships in the MVP are open.
- `apps/mobile/package.json` gained `eslint` and `eslint-config-expo`, auto-installed by `expo lint`.
