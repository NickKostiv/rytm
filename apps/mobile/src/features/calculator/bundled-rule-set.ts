import {
  loadRuleSet,
  MOH_DOSING_RULES,
  MOH_OFFLINE_SOURCE_VALIDITIES,
  type RuleSet,
} from '@rytm/dosing';

export type BundledRuleSet =
  | { status: 'loaded'; ruleSet: RuleSet }
  | { status: 'empty' }
  | { status: 'failed' };

function loadBundledRuleSet(): BundledRuleSet {
  try {
    const ruleSet = loadRuleSet(MOH_DOSING_RULES, MOH_OFFLINE_SOURCE_VALIDITIES);
    return ruleSet.rules.length === 0 ? { status: 'empty' } : { status: 'loaded', ruleSet };
  } catch {
    return { status: 'failed' };
  }
}

export const BUNDLED_RULE_SET = loadBundledRuleSet();
