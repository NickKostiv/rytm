# Dosing rules: schema and process (KAN-93)

Decided 2026-11-18 by the product owner. Status: draft until the owner reviews this file.

## Process

- Rules are transcribed only from the MoH source base (`apps/api/data/sources`), with order number, annex, page and order date. Foreign guidelines and other web sources are never a rule source.
- Transcription is done by the AI agent. A doctor and an EMS instructor check the rules against the PDFs outside the app.
- No approval record is kept in the rule set: no name, role, date or status. A transcribed rule is used by the calculator as soon as it is in the rule set (owner decision 2026-11-18).
- A source with validity `unknown` (KAN-54) is used, and the calculator shows «чинність не перевірено». A source known to be superseded or not in force is not used.
- When a source order is superseded or its PDF changes (`sha256` in the registry differs), every rule citing it is removed from the rule set until it is transcribed again from the new document.

Known risk accepted by the owner: with no status field, a transcription error reaches the calculator without a gate. The doctor's and instructor's check happens outside the data and is not recorded.

## Rule record

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `<drug>-<indication>-<route>`, e.g. `epinephrine-anaphylaxis-im` |
| `drug` | string | INN in Ukrainian as in the source, e.g. `епінефрин` |
| `indication` | string | as named in the source section |
| `route` | `'im' \| 'iv' \| 'io' \| 'po' \| 'nebulized' \| 'iv_infusion'` | |
| `concentration` | `{ amountMg: number; volumeMl: number } \| null` | `1 мг/мл` → `{ amountMg: 1, volumeMl: 1 }`. `%` and `1:1000` are converted to this form at transcription and the original text is kept in `concentrationText`. `null` when the source gives none |
| `concentrationText` | string \| null | verbatim from the source |
| `dose` | `PerKgDose \| BandDose` | see below |
| `maxSingleDoseMg` | number \| null | `null` = the source states no maximum; the calculator then shows "максимальна доза в протоколі не вказана" |
| `repeat` | `{ minMinutes: number; maxMinutes: number } \| null` | `null` = the source states no interval |
| `rounding` | `'none' \| { stepMg: number; direction: 'down' \| 'nearest' }` | default `'none'` |
| `source` | `{ registryId: string; orderNumber: string; orderDate: string; annex: string \| null; page: number; quote: string }` | `quote` is the verbatim source line the numbers come from |

```ts
type PerKgDose = { kind: 'per_kg'; mgPerKg: number };

type BandDose = {
  kind: 'band';
  bands: { minKg: number | null; maxKgExclusive: number | null; doseMg: number; label: string }[];
};
```

- Bands are by weight. The lower bound is inclusive, the upper bound exclusive; `null` means open. Bands of one rule must cover the weight range without gaps or overlaps, checked by the rule-set loader.
- Age-labelled bands («дорослі», «діти») keep the label only as text when the source defines them by weight, as in section 3.4.
- Age bands are not needed for the first rules. Add them when a transcribed source defines a dose by age.

## Calculation order

1. Base dose: `mgPerKg × weight`, or the dose of the weight band.
2. Rounding, only when the rule defines it. A dose rounded to 0 mg is rejected, no number is shown.
3. Cap at `maxSingleDoseMg`. A capped dose may fall off the rounding grid; the cap wins.
4. Volume from the concentration. A volume that is not a finite decimal is not shown; the dose in mg is.

A weight with more than two decimal places is rejected. A rule whose source is superseded or needs review stays out of the usable set and the calculator answers "source not in force" for it.

## Weight plausibility for age

No source in the MoH base gives a weight-for-age reference yet. Until one is found, the calculator only rejects a weight that is not a positive number and asks for weight when it is missing. A weight-for-age check is open and must cite a source when added.

## Worked examples (draft, transcribed by the AI agent, not checked)

Order 1269 of 2019-06-05, section 3.4 «Анафілактична та алергічна реакція», page 64. Validity of the order: `unknown` (KAN-54).

### Epinephrine, anaphylaxis, IM

Source: «введіть епінефрин (1 мг/мл) з такою дозою та шляхом введення: а) дорослі (25 кг або більше) 0,3 мг в/м в верхньо-зовнішню поверхню стегна; б) діти (менше 25 кг): 0,15 мг в верхньо-зовнішню поверхню стегна»; repeat: «кожні 5-15 хвилин з використанням наведених вище доз» (page 64, step 6).

```json
{
  "id": "epinephrine-anaphylaxis-im",
  "drug": "епінефрин",
  "indication": "анафілаксія",
  "route": "im",
  "concentration": { "amountMg": 1, "volumeMl": 1 },
  "concentrationText": "1 мг/мл",
  "dose": {
    "kind": "band",
    "bands": [
      { "minKg": 25, "maxKgExclusive": null, "doseMg": 0.3, "label": "дорослі (25 кг або більше)" },
      { "minKg": null, "maxKgExclusive": 25, "doseMg": 0.15, "label": "діти (менше 25 кг)" }
    ]
  },
  "maxSingleDoseMg": null,
  "repeat": { "minMinutes": 5, "maxMinutes": 15 },
  "rounding": "none",
  "source": { "registryId": "1269-20190605-dod", "orderNumber": "1269", "orderDate": "2019-06-05", "annex": null, "page": 64, "quote": "а) дорослі (25 кг або більше) 0,3 мг в/м ... б) діти (менше 25 кг): 0,15 мг" }
}
```

Transcription note for the checkers: line «б» does not repeat «в/м» for children; the rule assumes the same route as line «а».

### Diphenhydramine, urticaria or itch

Source: «При кропивниці або свербіжу введіть дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально».

```json
{
  "id": "diphenhydramine-urticaria-im",
  "drug": "дифенгідрамін",
  "indication": "кропивниця або свербіж",
  "route": "im",
  "concentration": null,
  "concentrationText": null,
  "dose": { "kind": "per_kg", "mgPerKg": 1 },
  "maxSingleDoseMg": 50,
  "repeat": null,
  "rounding": "none",
  "source": { "registryId": "1269-20190605-dod", "orderNumber": "1269", "orderDate": "2019-06-05", "annex": null, "page": 64, "quote": "дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально" }
}
```

The source gives no concentration, so the calculator returns a dose in mg and no volume. The same dose applies to `iv` and `po`; each route is its own rule.

