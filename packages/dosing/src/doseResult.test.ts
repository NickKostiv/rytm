import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDose } from '#calculateDose';
import { toDoseResultBody } from '#doseResult';
import type { DosingRule } from '#dosingRule';
import { loadRuleSet } from '#loadRuleSet';
import { MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES, MOH_RULE_SET_DATE, MOH_RULE_SOURCE_DOCUMENTS } from '#mohRuleSet';
import { syntheticRuleWithSource, SYNTHETIC_PER_KG_RULE, SYNTHETIC_SOURCE_UNKNOWN, SYNTHETIC_SOURCE_VALIDITIES } from '#syntheticRules';

const ruleSet = loadRuleSet(MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES);

const findMohRule = (ruleId: string): DosingRule => {
  const rule = MOH_DOSING_RULES.find(({ id }) => id === ruleId);
  assert.ok(rule, `missing rule ${ruleId}`);
  return rule;
};

const calculateBody = (ruleId: string, weightKg: number) => {
  const rule = findMohRule(ruleId);
  const outcome = calculateDose(ruleSet, { drug: rule.drug, indication: rule.indication, route: rule.route, weightKg });
  assert.equal(outcome.kind, 'dose');
  return outcome.kind === 'dose' ? toDoseResultBody(outcome, weightKg) : null;
};

test('dose result body carries the source page link, title and rule-set date for an uncapped dose', () => {
  const body = calculateBody('diphenhydramine-urticaria-im', 20);
  const document = MOH_RULE_SOURCE_DOCUMENTS.get(findMohRule('diphenhydramine-urticaria-im').source.registryId);
  assert.ok(body && document);
  assert.equal(body.doseMg, '20');
  assert.equal(body.isCappedAtMaximum, false);
  assert.equal(body.weightKg, 20);
  assert.equal(body.sourceUrl, `${document.url}#page=64`);
  assert.equal(body.sourceTitle, document.title);
  assert.equal(body.ruleSetDate, MOH_RULE_SET_DATE);
});

test('dose result body keeps the capped outcome unchanged', () => {
  const body = calculateBody('paracetamol-pain-po', 70);
  assert.ok(body);
  assert.equal(body.kind, 'dose');
  assert.equal(body.doseMg, '1000');
  assert.equal(body.isCappedAtMaximum, true);
  assert.equal(body.weightKg, 70);
  assert.match(body.sourceUrl, /#page=85$/);
});

test('dose result body is null when the rule source document is unknown', () => {
  const rule = syntheticRuleWithSource(SYNTHETIC_PER_KG_RULE, SYNTHETIC_SOURCE_UNKNOWN);
  const syntheticSet = loadRuleSet([rule], SYNTHETIC_SOURCE_VALIDITIES);
  const outcome = calculateDose(syntheticSet, { drug: rule.drug, indication: rule.indication, route: rule.route, weightKg: 10 });
  assert.equal(outcome.kind, 'dose');
  if (outcome.kind === 'dose') assert.equal(toDoseResultBody(outcome, 10), null);
});
