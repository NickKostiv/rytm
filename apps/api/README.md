# @rytm/api

Hono backend for the Rytm chat. Setup and the chat contract are in the root `CLAUDE.md`.

## Source base (local prototype)

The official MoH protocols listed in `protocols.md` are kept as local files under `data/sources/`. There is no database or embedding vendor yet (KAN-49 / KAN-51 are still open).

| Path | What | In git |
|------|------|--------|
| `data/sources/registry.json` | One row per unique protocol URL: order, date, annex, sha256, fetched-at, validity, attribution, document check | yes |
| `data/sources/pdf/` | Downloaded PDFs | no (`.gitignore`) |
| `data/sources/chunks.jsonl` | Page-anchored text and table chunks extracted from the PDFs | yes |

Commands, run from the repo root:

```sh
pnpm --filter @rytm/api sources:fetch     # download / re-check every PDF, update registry.json
pnpm --filter @rytm/api sources:extract   # rebuild chunks.jsonl from the downloaded PDFs
pnpm --filter @rytm/api test              # node:test suites, including chunk file invariants
```

`sources:fetch` downloads sequentially with a 60 s timeout. It skips the scanned order 714 annexes (protocols.md lines 16–19, they need OCR) and ingests the duplicate URL on lines 26 / 27 once. It exits non-zero when a download fails.

- New URL: the row is added with validity `unknown`.
- Same sha256: reported as unchanged; nothing else changes.
- Different sha256: the new file replaces the old one, validity becomes `needs_review`, and `previousSha256` keeps the old hash. Retrieval excludes the document until a person reviews it and sets the validity again.
- 404, timeout or a response that is not a PDF: reported, and the previous row and file are kept.

Retrieval uses documents with validity `in_force` or `unknown` and excludes `superseded` and `needs_review`. Allowing `unknown` is a temporary owner decision while validity is not verified (KAN-54). Citations must show that validity was not verified.

The server loads the index once per process: restart `pnpm api` after `sources:extract`.

`sources:extract` must be run after any fetch that reports a change. It refuses to run when a PDF on disk does not match the registry sha256. Chunks carry the PDF sha256 they were built from, and the chunk test fails when they are stale.

### Re-check cadence

Manual, weekly. Owner: product owner. Run `sources:fetch`, then `sources:extract` if anything changed, and review every `needs_review` row and every `MISMATCH` / `WARNING` line before the next release. No scheduler is installed. Detecting new MoH orders that are not in `protocols.md` is out of scope.

## Grounded mode (`GROUNDED_MODE=1`)

Off by default. Without the variable `/chat` uses the legacy prompt and the legacy `delta` / `done` / `error` stream.

### Retrieval (`src/retrieval/`)

- In-memory BM25 over `data/sources/chunks.jsonl`, loaded on the first grounded request; a failed load is retried on the next request and answered with an `error` event, never with an unsourced answer.
- Excluded: registry validity other than `in_force` / `unknown`, chunks with non-empty `warnings`, chunks whose `sourceSha256` differs from the registry row.
- Normalisation, same for index and query: lowercase; apostrophes dropped; Latin letters that look Cyrillic are folded to Cyrillic inside words that contain Cyrillic (`EMД` → `ЕМД`); punctuation split; vowel variants и/ї/ы → і and э/ё → е; a small stop-word list; crude stemming by stripping one Ukrainian inflection ending while keeping at least 4 letters, except that every form of «доза» maps to `доз`; `адреналін` → `епінефрин`, `норадреналін` → `норепінефрин` because the protocols use the INN. `скока` / `сколько` (stop words) and `взросл` → `доросл` are point fixes for observed queries, not systematic Russian support.
- A chunk qualifies when its matched query terms carry at least 60% of the query IDF weight and its score is at least half the top score. Up to 3 fragments per document, 16 in total. Nothing qualifies → the grounded answer is not generated; one non-streaming call with `CONVERSATION_SYSTEM_PROMPT` classifies the last message. `medical` (also any refusal or invalid output) → «Цього немає в базі протоколів МОЗ» with `stopReason: "no_sources"`. `conversation` (greeting, question about Rytm, off-topic) → its short text as `delta`, empty `citations`, `stopReason: "conversation"`; a conversation text with any number (same number check, no sources) or that itself retrieves any fragment → the `no_sources` answer instead. An API error → `error` event.
- The main control against medical content in a conversation reply is the classifier prompt. The two checks above are a best-effort extra layer: the number check is deterministic, but the retrieval check runs on the whole text and misses advice diluted by ordinary words («Дайте йому парацетамол і стежте за станом.», «Охолодіть опік проточною водою.» retrieve nothing). Searching per sentence was tried and rejected: it caught none of those and blocked greetings such as «Чим можу допомогти з протоколами?».
- Query: the last user message, plus the previous user message when the last one is shorter than 40 characters.
- No evaluation harness, recall@k or latency percentile exists yet.

### Grounding and number check (`src/grounding/`)

- Each fragment is a `search_result` block (`source` = moz.gov.ua URL + `#page=N`, `title` = order, date, annex, section, page and «чинність не перевірено»), placed before the question in the last user turn; the system prompt is `GROUNDED_SYSTEM_PROMPT`, cached.
- The answer is buffered server-side and checked before anything is sent. Nothing is streamed and then retracted.
- The model's answer arrives as text blocks, each with its own citations. Every number in a block must occur in a fragment cited by that same block: its `cited_text` or its full content. A block that contains a number and cites nothing withholds the whole answer. Citation metadata (order number, date, page) never verifies a number; the prompt forbids writing it in the answer. The check compares numbers only; it never computes, rounds or converts.
- Normalised before comparing: non-breaking and thin spaces, en/em/minus dashes, decimal comma = point, digit groups joined into one number (`400 000` = `400000`, so `1:400` never matches `1:400 000`), trailing fractional zeros (`7,50` = `7,5`). A dotted or colon sequence is one token (`1:400000`, `13.10.2025`); the parts of a ratio in a fragment also count on their own. Ignored: ordered-list markers at line start (`1.`, `2)`). Footnote markers `^N` need no rule: `N` must occur in the cited fragment like any other number. No other allowlist.
- Non-ASCII numerals (`½`, `¼`, superscript and fullwidth digits) must occur verbatim in a fragment cited by the same block.
- Known limits: a number written as a word («два», «половина») is not detected; only the prompt forbids it. A number that occurs in a cited fragment for another patient group or another drug passes when the block cites that fragment.
- Any unverified number → `stopReason: "withheld"`. The body is «Відповідь приховано: числа не підтверджені цитованими джерелами», followed by the cited `table` chunks verbatim when any were cited. `citations` lists every fragment the answer cited, text and table. The body itself is not number-checked. The log line has a request id and counts only.
- Order dates: when the document text disagrees with the file name, the document date is used only if another registry row of the same order confirms it from its own text (order 1237 annexes 3, 4, 6 → 16.07.2024). Otherwise the file-name date stays and the mismatch stays in the registry (order 536).
- `citations[].title` is the fragment's section heading; order, date, annex and page are separate fields. The `search_result` title sent to the model keeps the full order reference.
- An answer with no citations goes through the same classification as «nothing qualifies»: `medical` → «Цього немає в базі протоколів МОЗ», `conversation` → the conversation reply. This covers «Дякую» after a medical question, which retrieves fragments through the previous question.

## Dosing (`src/dosing/`, KAN-97)

Contract: `docs/dosing-chat-contract.md`. The dose itself comes only from `calculateDose` in `@rytm/dosing`.

- Rule set: `MOH_DOSING_RULES` loaded with the validities of `data/sources/registry.json` (not the offline validities), once per process, retried after a failed load.
- `/chat`, grounded mode only: when retrieval finds fragments, a structured-output request (`DOSING_PARAMETERS_SYSTEM_PROMPT`, effort `low`, no fragments) runs in parallel with the grounded request and returns drug, indication and route from lists built from the rule set, plus the weight. The backend drops a weight that is not in the user's own messages, matches the rule deterministically and sends `dose_parameters` before `delta`, only when the answer ends with citations (cited or `withheld`). An extraction or rule-set failure sends no card; the text answer is unaffected.
- `POST /dose { ruleId, weightKg }`: no model call. `200 {kind:"dose", ...}` or `200 {kind:"rejected", reason}`, `400` on a malformed body, `503` when the rule set or registry fails to load.
- Logs carry the request id, status, rule id, missing list and rejection reason; never message text, age, weight or dose.

## Verified mode (`VERIFIED_MODE=1`, KAN-106)

Contract and decisions: `docs/verified-answer-pipeline.md`. Needs `GROUNDED_MODE=1` as well; with `VERIFIED_MODE` unset the grounded path above is unchanged. Code: `src/grounding/verifiedReply.ts` (pipeline), `verifiedAnswer.ts` (citations and deterministic checks), `judgeVerdict.ts` (judge schema, input, validation), `answerSentences.ts`, `src/retrieval/retrievalTerms.ts`, and `checkStatedVolumes` in `@rytm/dosing`.

- Events: `progress` (`retrieving`, `answering`, `searching_web` once on the first server tool call, `verifying` before the judge), then `dose_parameters`, `delta`, `citations`, `web_sources` (only when non-empty), `done`. Nothing is streamed before verification.
- Retrieval miss: the classifier (`VERIFIED_CONVERSATION_SYSTEM_PROMPT`, schema `{kind, text, retrievalTerms}`) runs first. `conversation` → short reply as in grounded mode. `medical` → terms cleaned (number tokens, numbers glued to units, `в/м` `в/в` `в/к` `п/ш` dropped), one re-search with the unchanged threshold. Still nothing → the free answer without fragments.
- Answer: `VERIFIED_SYSTEM_PROMPT`, fragments as `search_result` blocks, `web_search_20260209` (`max_uses` 3, `moz.gov.ua` blocked, location UA). `pause_turn` is resumed with the paused content and the container id, at most twice.
- Checks in order: stop reason; numbers (MoH `cited_text` + fragment, web `cited_text`; volume tokens excluded); volumes (`checkStatedVolumes`: dose and concentration from one top-level item / line of one cited fragment or one web `cited_text`, exact decimal, or the volume quoted verbatim when the sentence states no dose and concentration); calculator precedence (a `confirm` / `incomplete` card, or a failed extraction, fails any volume and any number not in a cited MoH fragment); judge (fragments = retrieved + BM25 per answer sentence, capped at 16; any `contradicted` or invalid output fails).
- Fail with fragments → `withheld`, body «Відповідь не пройшла перевірку за протоколами МОЗ. Цитати з протоколу:» plus up to 3 fragments (contradicting, then cited, then retrieved). Fail without fragments, or an answer that is exactly «Цього немає в базі протоколів МОЗ» → `no_sources`.
- Labels: « (поза протоколами МОЗ)» at the end of each line with a `not_covered` sentence or a volume verified only by a web citation; on the no-fragment path every line.
- Deadline: 90 s per turn; past it the turn ends `withheld` (with fragments) or `no_sources`.
- Logs: request id, stop reasons, token usage, web search count, failed check name, verdict counts, elapsed ms. Never message text, terms, answer text, `cited_text`, URLs, age or weight.
