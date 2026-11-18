# Rytm — Agent Spec

Behavior contract for the Rytm AI assistant. Source of truth for prompts, backend response schema and client rendering. Product context: [CONTEXT.md](CONTEXT.md).

## No source, missing context

Decided 2026-11-18: answers carry no flag or confidence level. The GREEN / YELLOW / RED flag is removed from the product.

- No relevant source found → a plain refusal «Цього немає в базі протоколів МОЗ». No level, no label, no answer from general knowledge.
- A parameter the answer depends on (age, weight, condition, current drugs) is missing → the assistant asks for it, never assumes it.

## Dosing

Decided 2026-11-17. The LLM does **no** dose math: it never calculates, converts, rounds or estimates a dose. A patient-specific dose is produced only by the deterministic dose calculator from a dosing rule in the rule set. Until the calculator exists, a patient-specific request gets a refusal to calculate plus the quoted protocol.

### Dosing rules

- A dosing rule is a structured record: drug, indication, route, either a per-kg dose or a fixed dose per weight / age band (MoH protocols use both), maximum single dose, maximum daily dose, concentration, repeat interval, source document, page and version date.
- Rules are transcribed from the MoH source base only, by the AI agent, and checked against the PDFs by a doctor and an EMS instructor outside the app. The rule set keeps no approval record (decided 2026-11-18). Process and schema: [docs/dosing-rules.md](docs/dosing-rules.md).
- A rule whose source document is known to be superseded or not in force is not used. A source with unverified validity is used and shown as «чинність не перевірено».
- No rule for the drug and indication → no calculated number, in either mode.

### Calculator

- One implementation, shared by the backend and the app, so online and offline give the same result for the same input.
- Input: drug, indication, route (together they select one rule) and weight. No age input yet; a rule's `population` is shown as a warning, not checked. Output: dose, volume for the rule's concentration, the formula as applied, the maximum dose, the rule's source and version date.
- It caps the result at the maximum single dose and says so. It rejects a weight that is implausible for the age once a weight-for-age reference with a source exists; until then it rejects a weight that is not a positive number or is above 300 kg (a typo guard, not a clinical limit, decided 2026-11-18). It applies no rounding that the rule does not define.
- A missing parameter is asked for, never assumed.

### Online mode (chat)

Contract: [docs/dosing-chat-contract.md](docs/dosing-chat-contract.md) (KAN-96, decided 2026-11-18 by the owner, not implemented).

1. A separate structured-output request recognises the parameters: drug, indication and route, each picked from lists built from the rule set, and the weight in kilograms as the user wrote it. Age is not recognised while the calculator has no age input. The request does not produce a dose and never returns a rule id.
2. The backend matches them to a rule deterministically. The weight counts only if it appears in the user's own messages. A parameter the user did not state is never filled in, even when only one rule fits.
3. The app shows the recognised parameters as a card («дексаметазон, круп, перорально, 12 кг»). The user confirms or corrects the route (among the drug's rules for that indication) and the weight. A missing weight is entered in the card. A drug or indication is corrected with a new message.
4. Only after «Підтвердити» does the backend calculator compute the dose from the confirmed rule and weight. No model is involved in that step.
5. The answer shows the calculator's dose block first, then the AI text of the same turn (protocol quotes with citations, generated before confirmation and not regenerated), then sources.

- The dose block is rendered from the calculator's output, never from model text.
- The confirmation cannot be skipped: the chat stream never carries a dose, and the app requests one only on the user's tap.
- The model never sees the card, the confirmed parameters or the calculated dose. Chat history stays text only.
- No rule for the stated drug, indication or route → the card says so, with no number and no calculator link. The AI text still quotes the protocol.
- Extraction failure → no card; the cited text answer is unaffected. No card is shown next to a no-source, conversation or error reply.
- «Відкрити в калькуляторі» opens the offline screen prefilled with the card's rule and weight, for the user to confirm there.
- Patient data: the user's text (which may hold age and weight) reaches the model as typed. Weight travels only between the app and the backend as a field, and no weight, age or dose is written to logs.
- In AI text every number appears verbatim in a cited source fragment. The backend verifies this and withholds answers that contain other numbers.
- A dosing question with no patient parameters is answered with the quoted protocol fragment or table, as written and cited.
- No fragment and no rule for the drug / indication → the plain refusal, no numbers shown.

### Offline mode (calculator screen)

- A form: the user picks the condition and drug and enters age, weight and the patient's state. No AI and no network.
- The same calculator runs on the device with a bundled rule set.
- The screen shows the formula, the rule's source and version date, and the date of the rule set.

## Answer format

1. Dose block (if a dose was calculated) — from the calculator: dose, volume, formula, maximum dose, protocol link and version date.
2. Answer — concise, field-ready (short steps/bullets), quoting the protocol.
3. Sources — document name, section/page, version/date, link.

## Hard rules

- Answers only from the indexed official source base; every factual claim maps to a citation.
- Every answer with citations shows its sources (decided 2026-11-18). A source that is not an official MoH document (for example a foreign guideline) is visibly labelled as not an official MoH source.
- No dose number generated by the LLM: a dose is either quoted verbatim from a cited fragment or produced by the calculator from a rule in the rule set. No invented drugs, protocols or links.
- No patient PII sent to the LLM or stored in logs.
- The assistant supports clinical decisions, it does not make them.

## Open decisions

- How an answer shows that two cited sources conflict.
- Response language for users (Ukrainian assumed).
- Dosing: the weight-for-age reference; how the offline rule set is updated and how a stale one is shown.
- Patient mode (Phase 2) rules — likely stricter (no dosing for self-treatment).
