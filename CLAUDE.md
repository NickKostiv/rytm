# Rytm

AI medical reference for Ukrainian EMS paramedics, in chat form. Answers must come only from official sources (MoH protocols, drug instructions) with citations.

Read first:

- [CONTEXT.md](CONTEXT.md) — product, audience, principles, open decisions
- [AGENT_SPEC.md](AGENT_SPEC.md) — assistant behaviour contract (flags, dosing, answer format, hard rules)
- [protocols.md](protocols.md) — list of MoH protocol PDF URLs, candidate source base (not ingested yet)
- `apps/mobile/AGENTS.md` — Expo rules: fetch SDK 58 docs before using any Expo API

## Decisions already made

- **No dose calculator.** The assistant never calculates or estimates a dose, with or without a caveat. Dosing questions get the official table quoted and cited; a patient-specific request gets an explicit refusal plus the table.
- **Claude via Messages API on our own backend**, not Managed Agents. The API key lives only in `apps/api/.env`; never in `apps/mobile` or any `EXPO_PUBLIC_*` variable.
- **Flag (GREEN / YELLOW / RED)** will be computed on the backend from deterministic signals plus model self-assessment. Today the model only writes it as the first text line.
- Legal texts (terms, privacy, medical disclaimer) exist as drafts outside the repo; the consent screen is not built. Polishing is postponed.

## Structure

pnpm monorepo, Node 22.

| Path | What |
|------|------|
| `apps/api` | `@rytm/api` — Hono + `@hono/node-server`, TypeScript ESM, `@anthropic-ai/sdk` |
| `apps/mobile` | `@rytm/mobile` — Expo SDK 58, React Native 0.88, Expo Router, React Compiler on |
| `packages/*` | planned, empty. Chat contract types are duplicated in both apps for now |

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
- Valid → `text/event-stream`:
  - `event: delta` / `data: {"text": string}` — many
  - `event: done` / `data: {"stopReason": string}` — once on success
  - `event: error` / `data: {"message": string}` — then the stream closes; a model refusal is sent as `error`

## Commands

```sh
pnpm api                               # backend, tsx watch, http://localhost:3001
pnpm mobile                            # expo start
pnpm --filter @rytm/api typecheck
cd apps/mobile && npx tsc --noEmit && npx expo lint
```

Setup: copy `apps/api/.env.example` to `apps/api/.env` and set `ANTHROPIC_API_KEY`. Mobile reads `EXPO_PUBLIC_API_URL` (default `http://localhost:3001`; Android emulator needs `http://10.0.2.2:3001`).

Install mobile dependencies with `npx expo install`, never plain `pnpm add`.

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
- The README still mentions a dose calculator; it is outdated.
- `apps/mobile/package.json` gained `eslint` and `eslint-config-expo`, auto-installed by `expo lint`.
