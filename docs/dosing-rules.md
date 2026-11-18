# Dosing rules: schema and process (KAN-93)

Decided 2026-11-18 by the product owner. Status: draft until the owner reviews this file.

## Process

- Rules are transcribed only from the MoH source base (`apps/api/data/sources`), with order number, annex, page and order date. Foreign guidelines and other web sources are never a rule source.
- Transcription is done by the AI agent. A doctor and an EMS instructor check the rules against the PDFs outside the app.
- No approval record is kept in the rule set: no name, role, date or status. A transcribed rule is used by the calculator as soon as it is in the rule set (owner decision 2026-11-18).
- A source with validity `unknown` (KAN-54) is used, and the calculator shows «чинність не перевірено». A source known to be superseded or not in force is not used.
- When a source order is superseded or its PDF changes (`sha256` in the registry differs), every rule citing it is removed from the rule set until it is transcribed again from the new document.
- When orders in the base disagree on the same drug, indication and patient group, the newer order wins (owner decision 2026-11-18, below).

Known risk accepted by the owner: with no status field, a transcription error reaches the calculator without a gate. The doctor's and instructor's check happens outside the data and is not recorded.

## Owner decisions after the KAN-95 review (2026-11-18)

1. **Newer order wins.** When orders in the base disagree on the same drug, indication and patient group, the rule comes from the newer order; the older rule is removed. The newer one is transcribed only if it maps onto the schema; otherwise there is no rule. When the orders cover different patient groups (order 1259 annex 2 covers only infants and children, page 6; order 1269 covers all ages), the newer one does not replace the older one for the other group. The calculator has no age input, so it cannot pick between them: there is no rule and the calculator refuses (re-review, same day).
2. **Age-limited sections stay, with a warning.** A rule keeps the source's own words about the patient group in `population` (verbatim, `null` when the section names none). The calculator does not check age; the result carries the rule, and the card shows `rule.population`.
3. **Weight above 300 kg is rejected** as a typing error. It is a technical guard, not a clinical limit.
4. **No rule whose maximum the calculator would mislabel** (orchestrator, same day): `morphine-pain-iv` / `-io` are removed because the source says «максимальна первинна доза» and the calculator's formula says «максимальну разову дозу».

## Rule record

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `<drug>-<indication>-<route>`, e.g. `diphenhydramine-urticaria-im` |
| `drug` | string | INN in Ukrainian as in the source, e.g. `дифенгідрамін` |
| `indication` | string | as named in the source section |
| `population` | string \| null | the source's words for the patient group the dose is for, verbatim, e.g. «у дітей 2 річного віку або старше»; `null` when the section names none. Shown as a warning, not checked |
| `route` | `'im' \| 'iv' \| 'io' \| 'po' \| 'nebulized' \| 'iv_infusion'` | |
| `concentration` | `{ amountMg: number; volumeMl: number } \| null` | `1 мг/мл` → `{ amountMg: 1, volumeMl: 1 }`. `%` and `1:1000` are converted to this form at transcription and the original text is kept in `concentrationText`. `null` when the source gives none |
| `concentrationText` | string \| null | verbatim from the source |
| `dose` | `PerKgDose \| BandDose` | see below |
| `maxSingleDoseMg` | number \| null | `null` = the source states no maximum; the calculator then shows "максимальна доза в протоколі не вказана" |
| `repeat` | `{ minMinutes: number; maxMinutes: number } \| null` | `null` = the source states no interval |
| `rounding` | `'none' \| { stepMg: number; direction: 'down' \| 'nearest' }` | default `'none'` |
| `source` | `{ registryId: string; orderNumber: string; orderDate: string; annex: string \| null; section: string; page: number; quote: string }` | `section` is the section heading verbatim; `quote` is the verbatim source line the numbers come from |

```ts
type PerKgDose = { kind: 'per_kg'; mgPerKg: number };

type BandDose = {
  kind: 'band';
  bands: { minKg: number | null; maxKgExclusive: number | null; doseMg: number; label: string }[];
};
```

- Bands are by weight. The lower bound is inclusive, the upper bound exclusive; `null` means open. Bands of one rule must cover the weight range without gaps or overlaps, checked by the rule-set loader.
- Age-labelled bands («дорослі», «діти») keep the label only as text when the source defines them by weight.
- Age bands are not needed for the first rules. Add them when a transcribed source defines a dose by age.

## Calculation order

1. Base dose: `mgPerKg × weight`, or the dose of the weight band.
2. Rounding, only when the rule defines it. A dose rounded to 0 mg is rejected, no number is shown.
3. Cap at `maxSingleDoseMg`. A capped dose may fall off the rounding grid; the cap wins.
4. Volume from the concentration. A volume that is not a finite decimal is not shown; the dose in mg is.

A weight that is not a positive number, is above 300 kg or has more than two decimal places is rejected. A rule whose source is superseded or needs review stays out of the usable set and the calculator answers "source not in force" for it.

The result carries `formulaSteps`, one string per step of the formula as applied. Numbers use a decimal comma and a no-break space (U+00A0) before the unit, e.g. «0,6 мг/кг × 12 кг = 7,2 мг». `toDisplayDecimal` turns the result's `doseMg` / `volumeMl` («7.2») into the same display form («7,2»), so the chat and the calculator screen print numbers the same way.

## Weight plausibility for age

No source in the MoH base gives a weight-for-age reference yet. Until one is found, the calculator rejects only a weight that is not a positive number or is above 300 kg, and asks for weight when it is missing. A weight-for-age check is open and must cite a source when added.

## What the package exports for offline use

One import from `@rytm/dosing` gives everything the calculator screen needs without the network:

- `MOH_DOSING_RULES`: the rules.
- `MOH_RULE_SET_DATE`: `2026-11-18`.
- `MOH_OFFLINE_SOURCE_VALIDITIES`: a snapshot of `registry.json` validity for the cited sources, for `loadRuleSet` on the device. The backend builds validities from `registry.json` at run time instead.
- `MOH_RULE_SOURCE_DOCUMENTS`: `registryId → { title, url, sha256 }`. `url` is the registry's PDF URL; the source link is `${url}#page=${rule.source.page}`, as in the chat citations. `title` is copied from page 1 of the PDF, because `registry.json` has no title field. `sha256` is the PDF the rules were transcribed from.

## Worked example (in the rule set, transcribed by the AI agent, not checked)

### Diphenhydramine, urticaria or itch

Source: «При кропивниці або свербіжу введіть дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально».

```json
{
  "id": "diphenhydramine-urticaria-im",
  "drug": "дифенгідрамін",
  "indication": "кропивниця або свербіж",
  "population": null,
  "route": "im",
  "concentration": null,
  "concentrationText": null,
  "dose": { "kind": "per_kg", "mgPerKg": 1 },
  "maxSingleDoseMg": 50,
  "repeat": null,
  "rounding": "none",
  "source": { "registryId": "1269-20190605-dod", "orderNumber": "1269", "orderDate": "2019-06-05", "annex": null, "section": "3.4. АНАФІЛАКТИЧНА ТА АЛЕРГІЧНА РЕАКЦІЯ", "page": 64, "quote": "дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально" }
}
```

The source gives no concentration, so the calculator returns a dose in mg and no volume. The same dose applies to `iv` and `po`; each route is its own rule.

### Epinephrine, anaphylaxis, IM: removed, awaiting clinician choice

The earlier example from order 1269 (2019), page 64 («а) дорослі (25 кг або більше) 0,3 мг в/м … б) діти (менше 25 кг): 0,15 мг»), is removed under decision 1: order 1259 annex 2 (children's CPR, 2024) is newer and gives a different dose. No rule from order 1259 either, because it disagrees with itself: page 20 (item 33) says «епінефрин в дозі 0,01 мг/кг» в/м, and the annex 6 algorithm on page 43 says «Діти <25-30 кг 0,15 мг в/м» / «Дорослі/діти ≥25-30 кг 0,3 мг в/м», a boundary that is not one number. **Awaiting the clinicians' choice between 1259 page 20 and page 43.**

## Transcribed rules (KAN-95, 2026-11-18, not checked)

20 rules. Source (validity `unknown`):

| registryId | Order | Annex | Document (page 1) | PDF sha256 at transcription |
|------------|-------|-------|-------------------|-----------------------------|
| `1269-20190605-dod` | 1269 of 2019-06-05 | — | ЕКСТРЕНА МЕДИЧНА ДОПОМОГА: ДОГОСПІТАЛЬНИЙ ЕТАП. НОВИЙ КЛІНІЧНИЙ ПРОТОКОЛ | `78ec08b025920da3421dc17292460c5b9df7832e5f4371a4482fe2d02d9523f0` |

One quote serves every route of a drug line; `-iv`, `-im` etc. are one rule each.

| Rule ids | Order, section | Page | Population (page it is quoted from) | Quote |
|----------|----------------|------|------------|-------|
| `diphenhydramine-urticaria-im`, `-iv`, `-po` | 1269, 3.4 | 64 | — | дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально |
| `paracetamol-pain-po` | 1269, 3.11 | 85 | — | парацетамол 15 мг/кг перорально (максимальна доза – 1 г) |
| `morphine-pain-im` | 1269, 3.11 | 86 | — | морфіну сульфат - 0,1 мг/кг в/м (максимальна разова доза - 15 мг) |
| `midazolam-seizures-im` | 1269, 3.12 | 94 | — | мідазолам 0,2 мг/кг (максимальна доза – 10 мг), бажано в/м, або назально |
| `lorazepam-seizures-iv`, `-io` | 1269, 3.12 | 94 | — | лоразепам 0,1мг/кг в/в або в/к, максимум 4 мг |
| `paracetamol-febrile-seizures-po`, `-iv`, `-io` | 1269, 3.12 | 94 | — | парацетамол 15 мг/кг, максимальна доза - 650 мг, шляхи введення - ректальний/ в/в /в/к (якщо пацієнт не може ковтати) або пероральний (якщо пацієнт може ковтати) |
| `methylprednisolone-shock-adrenal-iv` | 1269, 3.13 | 99 | — | метилпреднізолон, 2 мг/кг в/в (максимальна доза - 125 мг) |
| `dexamethasone-croup-po`, `-iv`, `-im` | 1269, 5.3 | 133 | у дітей (p132) | дексаметазон 0,6 мг/кг перорально, в/в, в/м; макс. доза - 16 мг; слід вводити за підозри на круп |
| `methylprednisolone-bronchospasm-iv`, `-im` | 1269, 7.2 | 156 | у дітей 2 річного віку або старше (p154) | метилпреднізолон (2 мг/кг, максимальна доза - 125 мг) в/в або в/м |
| `dexamethasone-bronchospasm-iv`, `-im`, `-po` | 1269, 7.2 | 156 | у дітей 2 річного віку або старше (p154) | дексаметазон (0,6 мг/кг, максимальна доза - 16 мг) в/в, в/м або перорально |

Removed after the review: `epinephrine-anaphylaxis-im` (decision 1, see above), `morphine-pain-iv` / `-io` (decision 4), `hydrocortisone-shock-adrenal-iv` / `-im` (decision 1: order 1259 annex 2 page 21 gives a hydrocortisone stress dose of «1-2 мг/кг» for children in shock; a range, and only for children, so no rule). `midazolam-seizures-iv` was added in round 1 from order 1259 annex 2 (0,15 мг/кг, max 7,5 мг) and removed in round 2: that standard covers only infants and children, so for adults order 1269 page 94 («мідазолам 0,1мг/кг, в/в або в/к, максимум 4 мг») still applies; the two doses are for different groups, the calculator has no age input, and a 70 kg adult would have got 7,5 мг. No IV or IO midazolam rule until the calculator takes age.

### Tests

`mohRuleSet.test.ts` checks, for every rule: it loads through `loadRuleSet`; its order number, date and annex match `registry.json`; each source document's URL, sha256 and validity match `registry.json` (a changed PDF fails the test, which enforces the "PDF changed → transcribe again" rule); each quote fragment is verbatim on the cited page in `chunks.jsonl`; every dose, maximum, repeat interval, concentration and the route token («в/м», «в/в», «в/к», «перорал…») is written in the quote; one or more hand-derived dose vectors (including capped doses, a dose exactly at the cap, 300 kg and 300,01 kg).

Deliberate trade-off: the test reads `apps/api/data/sources/registry.json` and `chunks.jsonl`, so `packages/dosing` depends on the backend's data in tests only. The rule module itself stays free of file access and bundles into the app. Re-running the ingestion with a different text layout will fail the quote test until the quotes are checked again, which is intended.

## Transcription notes for the checkers

General:

- `page` is the 1-based page index of the PDF, the page `#page=N` opens. It is the same number the citations use (`chunk.pageStart` in `apps/api/src/grounding/groundingFragments.ts`). On every page used, the printed page number equals the index.
- Quotes are copied from the page text extracted with `pdfjs-dist` (the ingestion dependency of `apps/api`). Line breaks are replaced by single spaces; nothing else is changed, including the source's own spacing («0,1мг/кг») and dashes. Each quote was found on its page both in the PDF text and in `chunks.jsonl`.
- `section` is the heading verbatim from the PDF text. The ingested chunks of 1269 page 99 carry the heading «3.12. СУДОМИ», but the page belongs to «3.13. ШОК» (heading on page 97); the rule uses the PDF heading.
- `population` is copied verbatim. 7.2 bronchospasm: «у дітей 2 річного віку або старше», page 154, inclusion criteria («Дихальна недостатність з хрипами та свистом у дітей 2 річного віку або старше…»). 5.3 croup: «у дітей», page 132, aims of the section («…дихальних розладів у дітей»). The section heading on page 132 also says «У ДІТЕЙ».
- No rule has a concentration, because the sources name none; the calculator shows no volume.
- «максимальна доза», «максимум», «макс.» and «максимальна разова доза» are read as the maximum single dose. The sources do not say per day or per course.
- Decision 1 was applied to every rule: newer orders in the base (1259 annexes, 253 annexes, 1237, 1555, 1869, 1957, 1070, 536) were searched for the same drugs. Order 1259 annex 2 page 22 gives the same numbers as 1269 for midazolam IM and lorazepam IV (for children; 1269 covers all ages), so those 1269 rules stay. The other newer documents give fixed-dose or range regimens for burn, combat or hospital patients (e.g. «Морфін 1-5 мг в/в кожні 15 хв», 1555 annex 3), not a different per-kg dose for the same group, so the 1269 rules for paracetamol, morphine IM, diphenhydramine, methylprednisolone and dexamethasone stay.

Per rule:

- `diphenhydramine-urticaria-*`: step 3а recommends `iv` for severe shock; the rule does not encode the condition.
- `paracetamol-pain-po`: «1 г» is entered as 1000 мг; the formula shows «1000 мг». Step 4 applies «за наявності дозволу зі сторони медичного керівництва», not encoded.
- `morphine-pain-im`: step 4 of 3.11, given only «за наявності дозволу зі сторони медичного керівництва» (medical-leadership permission), not encoded; the card does not show it. The drug name is the source's «морфіну сульфат». Step 8 allows another analgesic dose after 5 minutes if the pain score and vital signs allow; this conditional repeat does not fit `repeat`, so `repeat` is `null`. No cumulative maximum is given.
- `midazolam-seizures-im`: step 7а applies when there is no IV access; «назально» is not a schema route. The same numbers are in order 1259 annex 2, page 22, for children.
- `lorazepam-seizures-*`: the same numbers as order 1259 annex 2, page 22 (IV only there).
- `paracetamol-febrile-seizures-*`: maximum 650 мг, unlike 1 г in 3.11; rectal is not a schema route; the route depends on whether the patient can swallow.
- `methylprednisolone-shock-adrenal-iv`: step 10 of 3.13, «якщо в анамнезі надниркова недостатність або довготривала стероїдна залежність»; the indication text is a summary of that condition. The hydrocortisone alternative in the same step was removed (decision 1); methylprednisolone has no newer dose for this situation in the base.
- `dexamethasone-croup-*`: section «5.3. РЕСПІРАТОРНИЙ ДИСТРЕС-СИНДРОМ У ДІТЕЙ (КРУП)».
- `*-bronchospasm-*`: the source says the steroids «можна застосовувати». Order 1259 annex 2, page 19, gives prednisolone 1–2 мг/кг for children's asthma, a different drug, so it does not replace these rules. **For the clinicians:** section 7.2 also covers adults (it names ХОЗЛ, and its steroid maxima of 125 мг and 16 мг are adult-sized), yet the verbatim population on the card, «у дітей 2 річного віку або старше», reads as children only. Decide whether to keep this wording, shorten it or set `population` to `null` for 7.2.

## Not transcribed

Earlier conflicts under decision 1. Where the newer order is the children's standard (1259 annex 2, infants and children only, page 6), it does not replace 1269 for adults; with no age input the calculator cannot choose, so there is no rule either way:

- Epinephrine IM in anaphylaxis: see "awaiting clinician choice" above.
- Midazolam IV / IO in seizures: 1259 annex 2 page 22, 0,15 мг/кг max 7,5 мг, for children; 1269 page 94, 0,1 мг/кг max 4 мг, for all ages, so for adults. Different groups, needs age input.
- Hydrocortisone in shock: 1259 annex 2 page 21, «1-2 мг/кг» for children, a range; 1269 page 99, 2 мг/кг max 100 мг, still the dose for adults. Needs age input.
- Diazepam IV in seizures: 1259 annex 2 page 22, «0,2 - 0,25 мг/кг (макс. 10 мг)» for children, a range; 1269 page 94, 0,1 мг/кг max 4 мг, still the dose for adults. Needs age input.
- Magnesium sulfate in severe asthma: 1259 annex 2 page 19, «одноразову дозу в/в магнію сульфату 50 мг/кг протягом 20 хв (максимум 2 г)». The dose maps (50 мг/кг, max 2000 мг), but the 20-minute administration has no field and `iv` vs `iv_infusion` is a clinical call; one decision away. 1269's 40 мг/кг (7.2, page 156) still applies to adults; needs age input.
- Amiodarone in cardiac arrest: 1259 annex 2 (pages 14, 42) caps the first dose at 300 мг and later doses at 150 мг; the schema has one maximum. Lidocaine: 1259 annex 2 page 12, «1-1,5 мг/кг», a range. The adult standard (1259, `1259-20240718-dod`) gives fixed adult doses.
- Neonatal epinephrine: order 536 (2025), pages 20–21, gives «0,2 мл/кг 0,01 % розчину» and 0,3 мл/кг for repeats, doses in мл. 1269's 0,01 мг/кг (page 137) is replaced, so no rule.
- Ketorolac 1 мг/кг max 15 мг IV in febrile seizures (1269 p94): against 0,5 мг/кг IV for children in 3.11 of the same order (p86). Same order, so decision 1 does not settle it; left for the clinicians.

Order 1269, by reason:

- **Age bands or age limits in the dose line** (the calculator has no age): 3.3 agitation, all benzodiazepines, antipsychotics and ketamine (p57–58); 2.5 tachycardia in children, adenosine and amiodarone (p42–43); 2.3 bradycardia in children (p34); 3.9 glucagon «якщо вага ≥ 20 кг або ≥ 5 років» (p79); 3.10 nausea, ondansetron, metoclopramide, prochlorperazine, diphenhydramine (p82–83); 3.11 ibuprofen «для пацієнтів старше 6 місяців» (p85) and ketorolac (p86); 3.12 ibuprofen 10 мг/кг max 600 мг (p94), left out for the same 6-month limit; 4.1 calcium for children (p108); 9.1 diphenhydramine, midazolam with a reduction from 69 years (p199–200); 9.2 organophosphate atropine and pralidoxime tables, mixed age and weight bands (p206–209); 9.5 ondansetron (p221); 9.6 hydroxocobalamin and thiosulfate (p225); 9.7 / 9.9 atropine, glucagon (child bands stop at 40 kg, adults by age), calcium (p228, p235); 9.11 naloxone (p242); 9.14 benzodiazepines (p259); 9.18 acetazolamide and dexamethasone (p277).
- **Maximum mislabelled by the calculator**: morphine 0,1 мг/кг IV/IO, «максимальна первинна доза - 10 мг» (p86), decision 4.
- **Dose in мкг, г/кг or мл**: fentanyl 1 мкг/кг and 0,1 мкг/кг (p86; the two steps differ tenfold, worth a look); activated charcoal 1 г/кг (p228, p235); all fluids in мл/кг.
- **Ranges or titration**: atropine 0,01–0,02 мг/кг (p34), lidocaine 1–1,5 мг/кг (p41), procainamide and vasopressor infusions (p34, p41, p99), magnesium for children 25–50 мг/кг (p107), midazolam «зі збільшенням до 2 мг» (p199–200).
- **Route not in the schema**: diazepam rectal (p94), midazolam and ketamine nasal (p86, p94), epinephrine endotracheal (p137).
- **Cumulative maximum not in the schema**: hydromorphone 0,015 мг/кг and ketamine 0,25 мг/кг (p86).
- **No route**: paracetamol and ibuprofen for fever in shock (p99); epinephrine «0,01 мг/кг в 1 мг, макс. доза – 0,3 мг» in bronchospasm (p156), whose concentration text is also unclear.
- **Likely source errors, for the checkers**: lidocaine 0,5 мг/кг with «лідокаїну 0,1 мг/мл», max 40 мг, for IO pain (p16), which would be 400 мл at the maximum; paediatric bradycardia epinephrine «0,01 мг/кг болюсно (0,1 мл/кг) максимальною дозою в 10 мкг (1мл)» from a 10 мкг/мл solution (p34), where 0,01 мг/кг is 1 мл/кг; epinephrine «0,1 мг/кг, доза для дорослих 1 мг» in the cardiac arrest teaching notes (p110), ten times 0,01 мг/кг; «10 мг/кг» of saline (p103, p137), «20 мг/кг» of fluids (p235, p259), «30 мг/кг» of isotonic fluid (p38), all apparently мл/кг.
- **Overlapping section**: morphine 0,1 мг/кг IV or IM for respiratory irritants (p252) has no maximum while 3.11 has; which one applies is a clinical choice.
- **Not weight-based**: fixed adult doses and nebulised doses; outside the calculator.

Other orders:

- Order 1259 annex 2 (children's CPR, 2024), besides the items above: epinephrine 10 мкг/кг and atropine 20 мкг/кг (мкг); ranges for prednisolone, methylprednisolone, adenosine, tranexamic acid; glucagon «0,03 мг/кг або 1 мг >25 кг; 0,5 мг <25 кг» (alternatives, 25 кг itself in no band); calcium and fluids in мл/кг. Valproic acid 40 мг/кг IV max 3 г (p22) maps onto the schema but is a second-line hospital drug; left for a later pass.
- Order 1259, adult CPR standard (`1259-20240718-dod`), its annex 2 tachycardia table (p26): adult-only; verapamil range, diltiazem 0,25 мг/кг «в середньому 20 мг», esmolol infusion.
- Order 253 annex 5 (airway in combat trauma): ketamine 2 мг/кг and etomidate 0,3 мг/кг come with «Для нестабільних пацієнтів вимагається скорочення дози» (reduction not quantified); rocuronium 1,2 мг/кг for adults and 1,5 мг/кг for children; suxamethonium and atropine by age.
- Orders 1070, 1237, 1555, 1869, 1957, 253 (annexes 3, 11), 536: hospital regimens, infusions, ranges, subcutaneous route, a dose quoted from a foreign body (253 annex 3, RCPCH), alteplase split into bolus and infusion, amiodarone 5 мг/кг for atrial fibrillation (1957, p33) with an open-ended repeat «не раніше, ніж через 15 хвилин» and no maximum.
- Order 714 annexes: scanned, out of scope (KAN-57).
