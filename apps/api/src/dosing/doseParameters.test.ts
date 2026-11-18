import { loadRuleSet, MOH_DOSING_RULES } from '@rytm/dosing';
import type { RuleSet, SourceValidity } from '@rytm/dosing';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDoseExtraction } from './doseExtraction.js';
import type { DoseExtraction } from './doseExtraction.js';
import { matchDoseParameters } from './doseParameters.js';

const ORDER_1269 = '1269-20190605-dod';

const ruleSet = (validity: SourceValidity = 'unknown'): RuleSet => loadRuleSet(MOH_DOSING_RULES, new Map([[ORDER_1269, validity]]));

const output = (fields: Record<string, unknown>, stopReason: string | null = 'end_turn') => ({
  stopReason,
  text: JSON.stringify({ isDoseRequest: true, drug: null, indication: null, route: null, weightKg: null, ...fields }),
});

const extraction = (fields: Partial<DoseExtraction>): DoseExtraction => ({
  isDoseRequest: true,
  drug: null,
  indication: null,
  route: null,
  weightKg: null,
  ...fields,
});

const CROUP_CANDIDATES = ['dexamethasone-croup-po', 'dexamethasone-croup-iv', 'dexamethasone-croup-im'];

test('extraction output that did not end the turn or is not the schema shape is a failure', () => {
  assert.equal(parseDoseExtraction(output({}, 'max_tokens'), []), null);
  assert.equal(parseDoseExtraction(output({}, 'refusal'), []), null);
  assert.equal(parseDoseExtraction({ stopReason: 'end_turn', text: '{"isDoseRequest":' }, []), null);
  assert.equal(parseDoseExtraction(output({ drug: 'аспірин' }), []), null);
  assert.equal(parseDoseExtraction(output({ weightKg: '12' }), ['12 кг']), null);
});

test('enum values are matched case-insensitively and replaced with the canonical string', () => {
  const parsed = parseDoseExtraction(output({ drug: 'Дексаметазон', indication: 'КРУП', route: 'PO' }), []);
  assert.deepEqual(parsed, extraction({ drug: 'дексаметазон', indication: 'круп', route: 'po' }));
  assert.equal(parseDoseExtraction(output({ drug: 'Other' }), [])?.drug, 'other');
});

test('a weight counts only when the user wrote it with a kilogram unit, decimal comma included', () => {
  const weightFrom = (weightKg: number, userText: string): unknown => parseDoseExtraction(output({ weightKg }), [userText])?.weightKg;
  assert.equal(weightFrom(12.5, 'синтетична дитина 12,5 кг'), 12.5);
  assert.equal(weightFrom(12.5, 'синтетична дитина 12,5кг'), 12.5);
  assert.equal(weightFrom(18, 'синтетична дитина, вага 18 кілограмів'), 18);
  assert.equal(weightFrom(30, 'синтетична дитина 12 років 30 кг'), 30);
  assert.equal(weightFrom(12, 'синтетична дитина 12 років 30 кг'), null);
  assert.equal(weightFrom(12, 'синтетична дитина, вага не вказана'), null);
  assert.equal(weightFrom(3200, 'новонароджений 3200 г'), null);
  assert.equal(weightFrom(3.2, 'новонароджений 3200 г'), null);
  assert.equal(weightFrom(25, 'синтетичний пацієнт, ІМТ 25 кг/м²'), null);
  assert.equal(weightFrom(25, 'синтетичний пацієнт, ІМТ 25 кг / м²'), null);
});

test('drug, indication, route and weight all stated give a confirm card with every route of that indication', () => {
  const event = matchDoseParameters(ruleSet(), extraction({ drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 }));
  assert.ok(event?.status === 'confirm');
  assert.equal(event.ruleId, 'dexamethasone-croup-po');
  assert.equal(event.weightKg, 12);
  assert.deepEqual(event.candidates.map(({ ruleId }) => ruleId), CROUP_CANDIDATES);
  assert.deepEqual(event.candidates[0], {
    ruleId: 'dexamethasone-croup-po',
    drug: 'дексаметазон',
    indication: 'круп',
    route: 'po',
    population: 'у дітей',
  });
});

test('a missing weight keeps the rule and asks for the weight', () => {
  const event = matchDoseParameters(ruleSet(), extraction({ drug: 'дексаметазон', indication: 'круп', route: 'po' }));
  assert.deepEqual(event && event.status === 'incomplete' ? [event.ruleId, event.weightKg, event.missing] : null, [
    'dexamethasone-croup-po',
    null,
    ['weight'],
  ]);
});

test('an unstated route is never assumed, even with a single candidate', () => {
  const event = matchDoseParameters(ruleSet(), extraction({ drug: 'парацетамол', indication: 'біль' }));
  assert.ok(event?.status === 'incomplete');
  assert.equal(event.ruleId, null);
  assert.deepEqual(event.missing, ['rule', 'weight']);
  assert.deepEqual(event.candidates.map(({ ruleId }) => ruleId), ['paracetamol-pain-po']);
});

test('an unstated indication lists the rules of every indication and preselects none', () => {
  const event = matchDoseParameters(ruleSet(), extraction({ drug: 'дексаметазон', route: 'po', weightKg: 12 }));
  assert.ok(event?.status === 'incomplete');
  assert.equal(event.ruleId, null);
  assert.deepEqual(event.missing, ['rule']);
  assert.equal(event.candidates.length, 6);
});

test('a drug, indication or route outside the rule set gives no_rule', () => {
  const noRule = { status: 'no_rule', reason: 'no_rule' };
  assert.deepEqual(matchDoseParameters(ruleSet(), extraction({ drug: 'other', indication: 'other', weightKg: 18 })), noRule);
  assert.deepEqual(matchDoseParameters(ruleSet(), extraction({ drug: 'дексаметазон', indication: 'other' })), noRule);
  assert.deepEqual(matchDoseParameters(ruleSet(), extraction({ drug: 'морфіну сульфат', indication: 'біль', route: 'iv', weightKg: 70 })), noRule);
  assert.deepEqual(matchDoseParameters(ruleSet(), extraction({ drug: 'мідазолам', indication: 'біль' })), noRule);
});

test('a rule whose source is not in force gives source_not_in_force', () => {
  const event = matchDoseParameters(ruleSet('superseded'), extraction({ drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 }));
  assert.deepEqual(event, { status: 'no_rule', reason: 'source_not_in_force' });
});

test('no card when the message is not a dose request or names no drug', () => {
  assert.equal(matchDoseParameters(ruleSet(), extraction({ isDoseRequest: false, drug: 'дексаметазон' })), null);
  assert.equal(matchDoseParameters(ruleSet(), extraction({ indication: 'круп', weightKg: 12 })), null);
});
