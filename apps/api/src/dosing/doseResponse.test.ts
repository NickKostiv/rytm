import Anthropic from '@anthropic-ai/sdk';
import { calculateDose, loadRuleSet, MOH_DOSING_RULES } from '@rytm/dosing';
import type { RuleSet, SourceValidity } from '@rytm/dosing';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../app.js';
import { SOURCE_REGISTRY_PATH } from '../sources/sourceRegistry.js';
import { loadDoseRuleSet } from './doseRuleSet.js';

const ORDER_1269 = '1269-20190605-dod';

const ruleSetWith = (validity: SourceValidity) => async (): Promise<RuleSet> =>
  loadRuleSet(MOH_DOSING_RULES, new Map([[ORDER_1269, validity]]));

const postDose = async (body: unknown, getRuleSet = ruleSetWith('unknown')): Promise<{ status: number; json: unknown }> => {
  const app = createApp(new Anthropic({ apiKey: 'test-key' }), { grounded: null, getRuleSet });
  const response = await app.request('/dose', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
};

test('a valid rule id and weight return the calculator outcome with source link and rule-set date', async () => {
  const { status, json } = await postDose({ ruleId: 'dexamethasone-croup-po', weightKg: 12 });
  const expected = calculateDose(await ruleSetWith('unknown')(), { drug: 'дексаметазон', indication: 'круп', route: 'po', weightKg: 12 });
  const expectedBody: unknown = JSON.parse(
    JSON.stringify({
      ...expected,
      weightKg: 12,
      sourceUrl: 'https://moz.gov.ua/uploads/2/12737-dn_20190605_1269_dod.pdf#page=133',
      sourceTitle: 'ЕКСТРЕНА МЕДИЧНА ДОПОМОГА: ДОГОСПІТАЛЬНИЙ ЕТАП. НОВИЙ КЛІНІЧНИЙ ПРОТОКОЛ',
      ruleSetDate: '2026-11-18',
    }),
  );
  assert.equal(status, 200);
  assert.equal(expected.kind, 'dose');
  assert.deepEqual(json, expectedBody);
});

test('calculator rejections are a 200 outcome, never a number', async () => {
  assert.deepEqual(await postDose({ ruleId: 'dexamethasone-croup-po', weightKg: 350 }), {
    status: 200,
    json: { kind: 'rejected', reason: 'invalid_weight' },
  });
  assert.deepEqual((await postDose({ ruleId: 'dexamethasone-croup-im', weightKg: 12.345 })).json, { kind: 'rejected', reason: 'invalid_weight' });
  assert.deepEqual((await postDose({ ruleId: 'removed-rule-id', weightKg: 12 })).json, { kind: 'rejected', reason: 'no_rule' });
  assert.deepEqual((await postDose({ ruleId: 'dexamethasone-croup-po', weightKg: 12 }, ruleSetWith('superseded'))).json, {
    kind: 'rejected',
    reason: 'source_not_in_force',
  });
});

test('a body that is not { ruleId: string, weightKg: number } is a 400', async () => {
  const expected = { status: 400, json: { error: 'Body must be an object with a string "ruleId" and a number "weightKg"' } };
  assert.deepEqual(await postDose({ ruleId: 'dexamethasone-croup-po', weightKg: '12' }), expected);
  assert.deepEqual(await postDose({ ruleId: '', weightKg: 12 }), expected);
  assert.deepEqual(await postDose(null), expected);
});

test('a rule set that fails to load is a 503 with a Ukrainian message and no dose', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  const failing = async (): Promise<RuleSet> => {
    throw new Error('synthetic failure');
  };
  assert.deepEqual(await postDose({ ruleId: 'dexamethasone-croup-po', weightKg: 12 }, failing), {
    status: 503,
    json: { error: 'Калькулятор тимчасово недоступний. Спробуйте ще раз.' },
  });
});

test('the backend rule set loads every rule with validities from registry.json', async () => {
  const ruleSet = await loadDoseRuleSet(SOURCE_REGISTRY_PATH);
  assert.equal(ruleSet.rules.length + ruleSet.rulesWithUnusableSource.length, MOH_DOSING_RULES.length);
});
