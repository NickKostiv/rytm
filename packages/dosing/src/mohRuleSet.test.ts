import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { calculateDose } from '#calculateDose';
import type { DosingRule, Route } from '#dosingRule';
import { loadRuleSet } from '#loadRuleSet';
import { MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES, MOH_RULE_SOURCE_DOCUMENTS } from '#mohRuleSet';

type DoseVector = {
  ruleId: string;
  weightKg: number;
  doseMg: string;
  volumeMl: string | null;
  isCappedAtMaximum: boolean;
};

const MOH_DOSE_VECTORS: readonly DoseVector[] = [
  { ruleId: 'diphenhydramine-urticaria-im', weightKg: 20, doseMg: '20', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'diphenhydramine-urticaria-iv', weightKg: 60, doseMg: '50', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'diphenhydramine-urticaria-iv', weightKg: 50, doseMg: '50', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'diphenhydramine-urticaria-po', weightKg: 12.5, doseMg: '12.5', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'paracetamol-pain-po', weightKg: 20, doseMg: '300', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'paracetamol-pain-po', weightKg: 70, doseMg: '1000', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'morphine-pain-im', weightKg: 30, doseMg: '3', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'morphine-pain-im', weightKg: 150, doseMg: '15', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'morphine-pain-im', weightKg: 160, doseMg: '15', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'midazolam-seizures-im', weightKg: 12, doseMg: '2.4', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'midazolam-seizures-im', weightKg: 60, doseMg: '10', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'lorazepam-seizures-iv', weightKg: 50, doseMg: '4', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'lorazepam-seizures-iv', weightKg: 300, doseMg: '4', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'lorazepam-seizures-io', weightKg: 18, doseMg: '1.8', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'paracetamol-febrile-seizures-po', weightKg: 14, doseMg: '210', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'paracetamol-febrile-seizures-iv', weightKg: 50, doseMg: '650', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'paracetamol-febrile-seizures-io', weightKg: 9.5, doseMg: '142.5', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'methylprednisolone-shock-adrenal-iv', weightKg: 40, doseMg: '80', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'methylprednisolone-bronchospasm-iv', weightKg: 70, doseMg: '125', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'methylprednisolone-bronchospasm-im', weightKg: 25, doseMg: '50', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'dexamethasone-bronchospasm-iv', weightKg: 20, doseMg: '12', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'dexamethasone-bronchospasm-im', weightKg: 30, doseMg: '16', volumeMl: null, isCappedAtMaximum: true },
  { ruleId: 'dexamethasone-bronchospasm-po', weightKg: 10, doseMg: '6', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'dexamethasone-croup-po', weightKg: 12, doseMg: '7.2', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'dexamethasone-croup-iv', weightKg: 15, doseMg: '9', volumeMl: null, isCappedAtMaximum: false },
  { ruleId: 'dexamethasone-croup-im', weightKg: 27, doseMg: '16', volumeMl: null, isCappedAtMaximum: true },
];

const SOURCES_URL = new URL('../../../apps/api/data/sources/', import.meta.url);

const MG_PER_GRAM = 1000;

const QUOTE_FRAGMENT_SEPARATOR = ' … ';

const ROUTE_TOKENS: Record<Route, RegExp> = {
  im: /в\/м/,
  iv: /в\/в/,
  io: /в\/к/,
  po: /перорал/,
  nebulized: /небулайзер/,
  iv_infusion: /в\/в/,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readSourcesFile = (name: string): string => readFileSync(new URL(name, SOURCES_URL), 'utf8');

const readRegistryRows = (): Record<string, unknown>[] => {
  const parsed: unknown = JSON.parse(readSourcesFile('registry.json'));
  assert.ok(Array.isArray(parsed));
  return parsed.filter(isRecord);
};

const readChunks = (): Record<string, unknown>[] =>
  readSourcesFile('chunks.jsonl')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line): unknown => JSON.parse(line))
    .filter(isRecord);

const normalizeWhitespace = (text: string): string => text.replace(/\s+/g, ' ').trim();

const pageText = (chunks: readonly Record<string, unknown>[], registryId: string, page: number): string =>
  normalizeWhitespace(
    chunks
      .filter(
        (chunk) =>
          chunk.documentId === registryId &&
          typeof chunk.pageStart === 'number' &&
          typeof chunk.pageEnd === 'number' &&
          chunk.pageStart <= page &&
          chunk.pageEnd >= page,
      )
      .map((chunk) => (typeof chunk.content === 'string' ? chunk.content : ''))
      .join(' '),
  );

const ukrainianNumber = (value: number): string => String(value).replace('.', ',');

const quoteStates = (quote: string, numberText: string, unit: string): boolean =>
  new RegExp(`(?<![\\d,])${numberText}\\s?${unit}(?!\\/)`).test(quote);

const quoteStatesMg = (quote: string, mg: number): boolean =>
  quoteStates(quote, ukrainianNumber(mg), 'мг') ||
  (mg % MG_PER_GRAM === 0 && quoteStates(quote, ukrainianNumber(mg / MG_PER_GRAM), 'г'));

const ruleFieldsMissingFromQuote = (rule: DosingRule): string[] => {
  const { quote } = rule.source;
  const doseChecks =
    rule.dose.kind === 'per_kg'
      ? [quoteStates(quote, ukrainianNumber(rule.dose.mgPerKg), 'мг/кг')]
      : rule.dose.bands.map(({ doseMg }) => quoteStatesMg(quote, doseMg));
  return [
    ...(doseChecks.every(Boolean) ? [] : ['dose']),
    ...(rule.maxSingleDoseMg === null || quoteStatesMg(quote, rule.maxSingleDoseMg) ? [] : ['maxSingleDoseMg']),
    ...(rule.repeat === null || quote.includes(`${rule.repeat.minMinutes}-${rule.repeat.maxMinutes} хвилин`) ? [] : ['repeat']),
    ...(rule.concentrationText === null || quote.includes(rule.concentrationText) ? [] : ['concentrationText']),
    ...(ROUTE_TOKENS[rule.route].test(quote) ? [] : ['route']),
  ];
};

test('the MoH rule set loads with every rule usable offline', () => {
  const ruleSet = loadRuleSet(MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES);
  assert.equal(ruleSet.rules.length, MOH_DOSING_RULES.length);
  assert.equal(ruleSet.rulesWithUnusableSource.length, 0);
});

test('every rule source and source document matches its source registry row', () => {
  const rows = readRegistryRows();
  const rowFor = (registryId: string): Record<string, unknown> => {
    const row = rows.find((candidate) => candidate.id === registryId);
    assert.ok(row, `${registryId} is not in registry.json`);
    return row;
  };
  for (const [registryId, document] of MOH_RULE_SOURCE_DOCUMENTS) {
    const row = rowFor(registryId);
    assert.equal(row.url, document.url, `${registryId}: url`);
    assert.equal(row.sha256, document.sha256, `${registryId}: sha256, the PDF changed and its rules need transcribing again`);
    assert.equal(row.validity, MOH_OFFLINE_SOURCE_VALIDITIES.get(registryId), `${registryId}: validity`);
  }
  for (const { id, source } of MOH_DOSING_RULES) {
    assert.ok(MOH_RULE_SOURCE_DOCUMENTS.has(source.registryId), `${id}: no source document for ${source.registryId}`);
    const row = rowFor(source.registryId);
    assert.equal(row.orderNumber, source.orderNumber, `${id}: orderNumber`);
    assert.equal(row.orderDate, source.orderDate, `${id}: orderDate`);
    assert.equal(row.annex, source.annex, `${id}: annex`);
  }
});

test('every quote is verbatim on its cited page of the ingested source', () => {
  const chunks = readChunks();
  const missing = MOH_DOSING_RULES.flatMap(({ id, source }) =>
    source.quote
      .split(QUOTE_FRAGMENT_SEPARATOR)
      .filter((fragment) => !pageText(chunks, source.registryId, source.page).includes(fragment))
      .map((fragment) => `${id}: ${fragment}`),
  );
  assert.deepEqual(missing, []);
});

test('every dose, maximum, repeat interval, concentration and route of a rule is stated in its quote', () => {
  const mismatches = MOH_DOSING_RULES.map((rule) => ({ id: rule.id, missing: ruleFieldsMissingFromQuote(rule) })).filter(
    ({ missing }) => missing.length > 0,
  );
  assert.deepEqual(mismatches, []);
});

test('every rule has at least one dose vector', () => {
  const covered = new Set(MOH_DOSE_VECTORS.map(({ ruleId }) => ruleId));
  assert.deepEqual(
    MOH_DOSING_RULES.map(({ id }) => id).filter((id) => !covered.has(id)),
    [],
  );
});

test('dose vectors derived by hand from the quotes match the calculator', () => {
  const ruleSet = loadRuleSet(MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES);
  for (const vector of MOH_DOSE_VECTORS) {
    const rule = MOH_DOSING_RULES.find(({ id }) => id === vector.ruleId);
    assert.ok(rule, `no rule ${vector.ruleId}`);
    const outcome = calculateDose(ruleSet, {
      drug: rule.drug,
      indication: rule.indication,
      route: rule.route,
      weightKg: vector.weightKg,
    });
    assert.ok(outcome.kind === 'dose', `${vector.ruleId} at ${vector.weightKg} kg: ${JSON.stringify(outcome)}`);
    assert.equal(outcome.rule.id, vector.ruleId);
    assert.equal(outcome.doseMg, vector.doseMg, `${vector.ruleId} at ${vector.weightKg} kg: dose`);
    assert.equal(outcome.isCappedAtMaximum, vector.isCappedAtMaximum, `${vector.ruleId} at ${vector.weightKg} kg: cap`);
    assert.deepEqual(
      outcome.volume,
      vector.volumeMl === null ? { kind: 'no_concentration' } : { kind: 'calculated', volumeMl: vector.volumeMl },
      `${vector.ruleId} at ${vector.weightKg} kg: volume`,
    );
  }
});

test('a weight above 300 kg gets no dose from a real rule', () => {
  const ruleSet = loadRuleSet(MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES);
  const rule = MOH_DOSING_RULES.find(({ id }) => id === 'lorazepam-seizures-iv');
  assert.ok(rule);
  const outcome = calculateDose(ruleSet, { drug: rule.drug, indication: rule.indication, route: rule.route, weightKg: 300.01 });
  assert.deepEqual(outcome, { kind: 'rejected', reason: 'invalid_weight' });
});
