# Dosing in the chat: contract and decision record (KAN-96)

**Status: decided 2026-11-18 (owner). Not implemented yet.** Builds on AGENT_SPEC.md "Dosing", [dosing-rules.md](dosing-rules.md) and `@rytm/dosing` (`calculateDose`, `DoseOutcome`, `MOH_*`).

## Decisions in short

1. **Extraction:** a separate structured-output request (`output_config.format`, JSON schema) runs next to the grounded request. It returns drug, indication and route picked from closed lists built from the rule set, and the weight as the user typed it. No tool call, no parser for drug or indication.
2. **Rule matching:** deterministic, on the backend. The model never sees or returns a rule id.
3. **SSE:** one new grounded-mode event, `dose_parameters`, sent at most once, before `delta`. No dose number travels in `/chat`.
4. **Confirmation:** a new endpoint `POST /dose { ruleId, weightKg }`. No model call. It runs `calculateDose` and returns its outcome. The app calls it only when the user taps «Підтвердити».
5. **History:** unchanged. `/chat` history stays text only. Parameters, the dose block and the confirmation never reach the model.
6. **Patient data:** age is not extracted. Weight leaves the user's own text only as `weightKg` in `dose_parameters` and the `/dose` body. Logs carry no weight, age, dose or message text.

## 1. Extraction mechanism

The grounded request passes fragments as `search_result` blocks with `citations: { enabled: true }` (`groundingFragments.ts`). Any choice has to keep those citations.

| Option | Verdict |
|---|---|
| A. Tool call inside the grounded request | Rejected |
| B. Separate structured-output request | **Chosen** |
| C. Deterministic parser | Rejected for drug, indication and route. Kept as a check on weight |

**Why not A (tool call in the grounded request):**
- Claude Opus 5.5 rejects forced tool use. The `claude-api` skill (`shared/tool-use-concepts.md`, Tool Choice Options) says: "Claude Opus 5.5 … reject forced tool use: `{"type": "any"}` and `{"type": "tool", "name": ...}` return a 400 … Because `auto` does not guarantee a call, check that one was made and retry if it wasn't." A missing call would need a retry of the whole answer request.
- A `tool_use` block ends the turn with `stop_reason: "tool_use"`. The model chooses whether it writes the cited text before or after the call. If the call comes first, the answer needs a `tool_result` round trip, which is a second grounded request.
- It ties parameter quality to the answer prompt, which is being rewritten for the dose-first format (KAN-63).
- Strict tool use and citations: the skill lists citations as incompatible with structured outputs ("Incompatible with: Citations (returns 400 error)", Structured Outputs section). The live page (platform.claude.com, Structured outputs, Feature compatibility, read 2026-11-18) states the 400 only for `output_config.format`: "The API returns a 400 error if citations are enabled with `output_config.format`." It is not stated whether `strict: true` tools combine with citations. Not tested. Without `strict`, the tool input is not schema-guaranteed.

**Why B:**
- Citations stay untouched. The extraction request carries no `search_result` blocks, so the `output_config.format` + citations conflict does not arise.
- The schema guarantees the shape, and enums keep drug, indication and route inside the rule set. The model cannot invent a drug, an indication or a rule id.
- The codebase already uses this pattern: `createConversationReply` in `claudeChatStream.ts` (JSON schema, effort `low`, `fallbacks: 'default'`, `stop_reason` check, fall back to "no reply" on bad output).
- Cost: one extra low-effort request on each grounded turn that has fragments. It runs in parallel, so latency is the slower of the two requests, and the grounded one is the slower today.

**Why not C:** Ukrainian inflection (дексаметазону, дексаметазоном), synonyms and trade names (епінефрин / адреналін, димедрол), indication from wording («гавкаючий кашель»), and telling a dose request from a question about the drug. A dictionary would miss these silently. The parser idea is kept for one deterministic check: the weight must appear in the user's own words (section 2).

Skill notes that the implementation must follow: structured outputs do not guarantee enum casing ("Compare enum values case-insensitively"). `stop_reason` `refusal` or `max_tokens` means the output may not match the schema. Patient data must never go into a schema ("PHI must not be included in JSON schema definitions"); the enums here are rule-set terms only.

## 2. The extraction request

- Input: the text history (`ChatMessage[]`, same as `/chat`), the extraction system prompt (owned by ai-developer), no fragments.
- Model and params: as `createConversationReply` (model `claude-opus-5-5`, adaptive thinking, effort `low`, `server-side-fallback-2026-07-01` with `fallbacks: 'default'`).
- Output schema (all fields required):

```jsonc
{
  "isDoseRequest": boolean,          // the user asks how much of a named drug to give
  "drug": "<rule-set drug>" | "other" | null,
  "indication": "<rule-set indication>" | "other" | null,
  "route": "im" | "iv" | "io" | "po" | "nebulized" | "iv_infusion" | "other" | null,
  "weightKg": number | null
}
```

- Lists are built from `MOH_DOSING_RULES` at startup. Today: drugs `дифенгідрамін`, `парацетамол`, `морфіну сульфат`, `мідазолам`, `лоразепам`, `метилпреднізолон`, `дексаметазон`. Indications: the 7 distinct `indication` strings.
- `null` = not stated. `"other"` = stated, but not in the list. A drug is filled only when the user named it; the model never picks a drug from symptoms. Several drugs named → `drug: null`.
- `weightKg` is filled only when the user states the weight in kilograms. The model does not convert from grams or pounds and does not estimate weight from age.
- No age field (the calculator has no age input, KAN-70 minimisation).

Backend checks on the output, all deterministic:

1. `stop_reason` is not `end_turn`, JSON fails to parse, or the shape is wrong → extraction failed: no event, log `dose_parameters=failed`.
2. `weightKg` must appear as a number in one of the **user** messages, after the same normalisation the number check uses (decimal comma, spaces). Reuse `findUnverifiedNumbers([{ text, sourceTexts: userTexts }])`. If it does not appear → treated as `null`.
3. Enum values are matched to the list case-insensitively and replaced with the canonical string.

## 3. Rule matching (backend, deterministic)

Over the backend rule set (`loadRuleSet` with validities from `registry.json`):

1. `isDoseRequest` false, or `drug` null → no event.
2. `drug`, `indication` or `route` is `"other"` → `no_rule`.
3. `candidates` = usable rules with this `drug` and, when `indication` is stated, this `indication`. The route does not filter candidates, so the user can still switch route in the card.
4. `candidates` empty → `no_rule`. Reason is `source_not_in_force` when a rule in `rulesWithUnusableSource` would have matched, otherwise `no_rule`.
5. `route` stated and no candidate has it → `no_rule` (the user asked for a route the calculator has no rule for).
6. `ruleId` = the candidate with the stated route, only when indication and route are both stated. Otherwise `null`: an unstated parameter is never assumed, even when there is a single candidate.
7. Status: `confirm` when `ruleId` and `weightKg` are both set, otherwise `incomplete` with `missing`.

The weight range is not checked here. `calculateDose` checks it at `/dose`, so the calculator stays the only validator.

## 4. SSE: `dose_parameters` (grounded mode only)

Order: `dose_parameters` (0 or 1) → `delta` (1..n) → `citations` → `done`. The grounded answer is buffered today, so the backend waits for both requests and then writes the events in this order.

Sent only when all of these hold:
- `GROUNDED_MODE=1`, the turn had fragments and the extraction succeeded;
- the turn ends with a non-empty `citations` list (a cited answer or `withheld`). Never with `no_sources`, `conversation` or `error`, so a card never sits next to «Цього немає в базі протоколів МОЗ».

The extraction is aborted when the client disconnects, together with the grounded stream. An extraction failure sends no event; the cited text answer still goes out.

Payload type (TypeScript, for both apps):

```ts
type DoseCandidate = {
  ruleId: string;
  drug: string;
  indication: string;
  route: Route;               // from @rytm/dosing
  population: string | null;  // rule.population, verbatim; shown as a warning
};

type DoseParametersEvent =
  | { status: 'confirm'; ruleId: string; weightKg: number; candidates: DoseCandidate[] }
  | {
      status: 'incomplete';
      ruleId: string | null;
      weightKg: number | null;
      missing: ('rule' | 'weight')[];
      candidates: DoseCandidate[];
    }
  | { status: 'no_rule'; reason: 'no_rule' | 'source_not_in_force' };
```

Clients that do not know the event ignore it: `parse-sse-stream.ts` returns `null` for unknown event names. The change is additive for the current app.

## 5. Confirmation: `POST /dose`

- Request: `{ "ruleId": string, "weightKg": number }`. `weightKg` is a JSON number; the app turns «12,5» into `12.5`.
- No model call. The backend finds the rule by id in its rule set and passes its `drug`, `indication` and `route` with `weightKg` to `calculateDose`. Unknown id → `no_rule`, which also covers a rule set changed between the event and the tap.
- Responses:
  - `200` with `kind: "dose"`: the `DoseOutcome` dose variant from `@rytm/dosing` as is (`rule`, `sourceValidity`, `doseMg`, `volume`, `isCappedAtMaximum`, `formulaSteps`), plus `weightKg`, `sourceUrl` (`MOH_RULE_SOURCE_DOCUMENTS` url + `#page=<rule.source.page>`), `sourceTitle` and `ruleSetDate`.
  - `200` with `{ "kind": "rejected", "reason": "invalid_weight" | "no_rule" | "source_not_in_force" | "below_rounding_step" }`. This is a calculator outcome, not a transport error.
  - `400 {"error": string}`: body is not `{ ruleId: non-empty string, weightKg: number }`. Same style as `/chat`.
  - `503 {"error": "Калькулятор тимчасово недоступний. Спробуйте ще раз."}`: the rule set or the registry failed to load. Never a dose without a rule.
- `doseMg` and `volumeMl` are decimal strings («7.2»). The app shows them through `toDisplayDecimal`, the same as the calculator screen.
- The dose variant is a type both apps already have through `@rytm/dosing`, so this response is not duplicated by hand in mobile. The app still validates the JSON at run time.

The user cannot skip confirmation: `/chat` never carries a dose, and the app calls `/dose` only from the «Підтвердити» tap, never on its own. «Відкрити в калькуляторі» opens the offline screen with the card's `ruleId` and `weightKg` (or none) for the user to confirm there. It is shown whenever `candidates` is non-empty.

## 6. Sequences

Chat turn with a recognised dose request:

```
App                    API /chat                  Claude: grounded           Claude: extraction
 |-- POST /chat ------->|
 |                      |-- BM25 retrieval
 |                      |-- stream(search_results, citations) -->|
 |                      |-- create(json_schema, text history) ------------------------------>|
 |                      |<-- text + citations -------------------|                            |
 |                      |<-- {isDoseRequest, drug, indication, route, weightKg} --------------|
 |                      |-- number check on text; weight-in-user-text check; rule matching
 |<-- dose_parameters --|
 |<-- delta ------------|
 |<-- citations --------|
 |<-- done -------------|
```

Confirmation (with or without corrections):

```
App                                   API /dose
 | user checks the card, may change route (among candidates) and weight, taps «Підтвердити»
 |-- POST /dose {ruleId, weightKg} --->|
 |                                     |-- rule by id → calculateDose (no model)
 |<-- 200 {kind:"dose", ...} ----------|   the card turns into the dose block, above the text
 |<-- 200 {kind:"rejected", reason} ---|   the card stays, shows the reason, the user edits
 |<-- 503 {error} ---------------------|   the card stays, «Повторити»
```

Next chat turn (for example «а якщо 15 кг?»):

```
App -- POST /chat {messages: text only} --> extraction reads the history again → new dose_parameters
```

## 7. Payload examples

User messages and weights are synthetic. Dose results are real `calculateDose` output on `MOH_DOSING_RULES` (run 2026-11-18). ` ` is the no-break space in `formulaSteps`.

### 7.1 Parameters recognised and complete

User: «Дексаметазон перорально при крупі, дитина 12 кг».

```
event: dose_parameters
data: {"status":"confirm","ruleId":"dexamethasone-croup-po","weightKg":12,"candidates":[
  {"ruleId":"dexamethasone-croup-po","drug":"дексаметазон","indication":"круп","route":"po","population":"у дітей"},
  {"ruleId":"dexamethasone-croup-iv","drug":"дексаметазон","indication":"круп","route":"iv","population":"у дітей"},
  {"ruleId":"dexamethasone-croup-im","drug":"дексаметазон","indication":"круп","route":"im","population":"у дітей"}]}
```

Then `delta` (dose line quoted from the protocol), `citations`, `done`. After «Підтвердити»:

```
POST /dose  {"ruleId":"dexamethasone-croup-po","weightKg":12}

200 {"kind":"dose",
     "rule":{"id":"dexamethasone-croup-po","drug":"дексаметазон","indication":"круп","population":"у дітей","route":"po",
             "concentration":null,"concentrationText":null,"dose":{"kind":"per_kg","mgPerKg":0.6},"maxSingleDoseMg":16,
             "repeat":null,"rounding":"none",
             "source":{"registryId":"1269-20190605-dod","orderNumber":"1269","orderDate":"2019-06-05","annex":null,
                       "section":"5.3. РЕСПІРАТОРНИЙ ДИСТРЕС-СИНДРОМ У ДІТЕЙ (КРУП)","page":133,
                       "quote":"дексаметазон 0,6 мг/кг перорально, в/в, в/м; макс. доза - 16 мг; слід вводити за підозри на круп"}},
     "sourceValidity":"unknown","doseMg":"7.2","volume":{"kind":"no_concentration"},"isCappedAtMaximum":false,
     "formulaSteps":["0,6 мг/кг × 12 кг = 7,2 мг"],
     "weightKg":12,
     "sourceUrl":"https://moz.gov.ua/uploads/2/12737-dn_20190605_1269_dod.pdf#page=133",
     "sourceTitle":"ЕКСТРЕНА МЕДИЧНА ДОПОМОГА: ДОГОСПІТАЛЬНИЙ ЕТАП. НОВИЙ КЛІНІЧНИЙ ПРОТОКОЛ",
     "ruleSetDate":"2026-11-18"}
```

### 7.2 A parameter is missing

Weight missing. User: «Дексаметазон перорально при крупі, яка доза?»

```
event: dose_parameters
data: {"status":"incomplete","ruleId":"dexamethasone-croup-po","weightKg":null,"missing":["weight"],
       "candidates":[ /* the three croup rules from 7.1 */ ]}
```

Route and weight missing. User: «Парацетамол при болю, скільки дати?»

```
event: dose_parameters
data: {"status":"incomplete","ruleId":null,"weightKg":null,"missing":["rule","weight"],
       "candidates":[{"ruleId":"paracetamol-pain-po","drug":"парацетамол","indication":"біль","route":"po","population":null}]}
```

There is only one candidate, but the route was not stated, so it is not preselected: the user taps it. The card asks for the weight in its own field. The AI text asks for it too (AGENT_SPEC).

Weight given in grams («новонароджений 3200 г»): the model leaves `weightKg` null, and the card asks for kilograms.

### 7.3 Drug or indication with no approved rule

Drug not in the rule set. User: «Адреналін в/м при анафілаксії, дитина 18 кг».

```
event: dose_parameters
data: {"status":"no_rule","reason":"no_rule"}
```

Drug in the rule set, route not. User: «Морфін в/в при болю, 70 кг» (only `morphine-pain-im` exists).

```
event: dose_parameters
data: {"status":"no_rule","reason":"no_rule"}
```

The card says «Для цього препарату, показання й шляху введення немає правила калькулятора». It has no «Відкрити в калькуляторі» and no number. The text answer still quotes the protocol line with citations.

### 7.4 The user corrects a parameter

In the card from 7.1, the user switches to «в/м» and changes 12 to 30:

```
POST /dose  {"ruleId":"dexamethasone-croup-im","weightKg":30}

200 {"kind":"dose","rule":{ /* dexamethasone-croup-im, same source as 7.1 */ },
     "sourceValidity":"unknown","doseMg":"16","volume":{"kind":"no_concentration"},"isCappedAtMaximum":true,
     "formulaSteps":["0,6 мг/кг × 30 кг = 18 мг","більше за максимальну разову дозу 16 мг → 16 мг"],
     "weightKg":30,"sourceUrl":"https://moz.gov.ua/uploads/2/12737-dn_20190605_1269_dod.pdf#page=133",
     "sourceTitle":"ЕКСТРЕНА МЕДИЧНА ДОПОМОГА: ДОГОСПІТАЛЬНИЙ ЕТАП. НОВИЙ КЛІНІЧНИЙ ПРОТОКОЛ","ruleSetDate":"2026-11-18"}
```

A drug or indication can only be corrected with a new message («ні, при бронхоспазмі»). That is a new turn with a new `dose_parameters`.

### 7.5 The calculator rejects the input

The event can carry a weight that the calculator will reject. The event does not check the range (section 3):

```
event: dose_parameters
data: {"status":"confirm","ruleId":"dexamethasone-croup-po","weightKg":350,"candidates":[ /* as 7.1 */ ]}

POST /dose  {"ruleId":"dexamethasone-croup-po","weightKg":350}
200 {"kind":"rejected","reason":"invalid_weight"}

POST /dose  {"ruleId":"dexamethasone-croup-im","weightKg":12.345}
200 {"kind":"rejected","reason":"invalid_weight"}

POST /dose  {"ruleId":"removed-rule-id","weightKg":12}
200 {"kind":"rejected","reason":"no_rule"}

POST /dose  {"ruleId":"dexamethasone-croup-po","weightKg":"12"}
400 {"error":"Body must be an object with a string \"ruleId\" and a number \"weightKg\""}
```

Card copy for `invalid_weight`: «Перевірте вагу: більше 0 і не більше 300 кг, до двох знаків після коми». No number is shown.

## 8. AI text with the dose block

- The text comes from the grounded request of the same turn and is not regenerated after confirmation. It keeps the current rules: the first line quotes the protocol dose line verbatim with every band, then asks for the missing value. No calculation, no band picked, every number checked against the cited fragments.
- The repetition is accepted (owner, 2026-11-18). Under the dose block, the text keeps quoting the protocol dose line with every band; it is not shortened when a card is shown.
- The app renders, top to bottom: the card (before confirmation) or the dose block (after it), then the text, then sources. So the first thing in the answer is the calculator block once it exists, which is the dose-first decision.
- The dose block is not part of the text, so it is not number-checked. Its numbers come only from `calculateDose`, and its source is the rule's own quote, page and link.
- Prompt follow-up (ai-developer): the dosing rule «adds one short clause that Rytm does not calculate it» (`systemPrompt.ts`, Dosing) contradicts a card that offers a calculation. It needs rewording when this ships.

## 9. History the model sees afterwards

- `/chat` keeps `{ role, content }` with text only. The app sends the assistant's text without the card, the dose block or the confirmation.
- So the model never sees a calculated dose. It cannot repeat one, and a repeated number would be withheld anyway because it is in no fragment.
- A follow-up («а якщо 15 кг?») runs the extraction again over the text history. The drug and indication come from earlier messages, and the new weight from the last one.
- KAN-104: neither the card nor the dose block is stored on the device (owner, 2026-11-18). Both live only in the open session; a reopened conversation shows text and sources only.

## 10. Patient data: model and logs (KAN-70)

| Data | Reaches the model | In SSE / HTTP | In server logs |
|---|---|---|---|
| Message text (may contain age, weight) | Yes, as typed, in both requests. The footnote asks users not to enter identifying data | Only as the app sent it | Never |
| Age | Only inside the user's text. Not extracted and not in any field | No | Never |
| Weight | Only inside the user's text. A corrected weight from the card never reaches the model | `weightKg` in `dose_parameters` and in the `/dose` body and response | Never |
| Calculated dose | Never | `/dose` response | Never |
| Rule id, status, missing list, rejection reason | No | Yes | Yes, with the request id |

Log lines (shape only): `Grounded request <id>: dose_parameters status=confirm rule=dexamethasone-croup-po` / `status=incomplete missing=rule,weight` / `dose_parameters=failed error=<name>`. `/dose`: `Dose request: outcome=rejected reason=invalid_weight rule=<id>`. Never the request body.

## 11. Follow-ups for implementation (not created as tickets)

- be-developer: extraction call next to `createConversationReply`; rule matching; `dose_parameters` in `groundedReply.ts`; `POST /dose`; the backend rule set from `MOH_DOSING_RULES` and `registry.json` validities; unit tests on the matching and the weight check with synthetic messages.
- ai-developer: the extraction system prompt; rewording the "does not calculate" clause.
- fe-developer: parse `dose_parameters`; the card (candidates, weight field, «Підтвердити», «Відкрити в калькуляторі»); `/dose` with loading, error and retry; the dose block; route labels (shared with the calculator screen, best placed in `@rytm/dosing`).

## Owner decisions (2026-11-18)

The owner approved this record as written and answered the review questions:

1. **The backend computes the dose** through `POST /dose`, not the app's bundled calculator. Online results use the backend rule set and the live `registry.json` validities.
2. **The repeated dose line is accepted** (section 8).
3. **One drug per turn.** A message that names more than one drug gets no card.
4. **The card edits route and weight only.** Drug and indication are corrected with a new message.
5. **No age extraction** until the calculator takes age. Then an `ageYears` field is added to the extraction and the card.
6. **The card and the dose block are not stored** in the on-device history (KAN-104).

Not settled by this record: whether `strict: true` tools can be combined with citations (section 1) is untested. The design does not depend on it.
