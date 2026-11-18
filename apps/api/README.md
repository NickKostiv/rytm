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
- Normalisation, same for index and query: lowercase; apostrophes dropped; Latin letters that look Cyrillic are folded to Cyrillic inside words that contain Cyrillic (`EMД` → `ЕМД`); punctuation split; a small stop-word list; crude stemming by stripping one Ukrainian inflection ending while keeping at least 4 letters; `адреналін` → `епінефрин`, `норадреналін` → `норепінефрин` because the protocols use the INN.
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
- Any unverified number → `stopReason: "withheld"`. The body is «Відповідь приховано: числа не підтверджені цитованими джерелами», followed by the cited `table` chunks verbatim when any were cited. The body itself is not number-checked. The log line has a request id and counts only.
- Order dates: when the document text disagrees with the file name, the document date is used only if another registry row of the same order confirms it from its own text (order 1237 annexes 3, 4, 6 → 16.07.2024). Otherwise the file-name date stays and the mismatch stays in the registry (order 536).
- `citations[].title` is the fragment's section heading; order, date, annex and page are separate fields. The `search_result` title sent to the model keeps the full order reference.
- An answer with no citations goes through the same classification as «nothing qualifies»: `medical` → «Цього немає в базі протоколів МОЗ», `conversation` → the conversation reply. This covers «Дякую» after a medical question, which retrieves fragments through the previous question.
