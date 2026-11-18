import { loadRuleSet, MOH_DOSING_RULES } from '@rytm/dosing';
import type { RuleSet } from '@rytm/dosing';
import { createLazyLoader } from '../lazyLoader.js';
import { readRegistry, SOURCE_REGISTRY_PATH } from '../sources/sourceRegistry.js';

export const loadDoseRuleSet = async (registryPath: string): Promise<RuleSet> => {
  const rows = await readRegistry(registryPath);
  return loadRuleSet(MOH_DOSING_RULES, new Map(rows.map(({ id, validity }) => [id, validity])));
};

export const createLazyDoseRuleSet = (): (() => Promise<RuleSet>) =>
  createLazyLoader(() => loadDoseRuleSet(SOURCE_REGISTRY_PATH));
