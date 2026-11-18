import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import { RECENT_RULES_LIMIT, RECENT_RULES_STORAGE_KEY } from '@/features/calculator/constants';

function mergeRecentRuleIds(first: string[], second: string[]): string[] {
  return [...new Set([...first, ...second])].slice(0, RECENT_RULES_LIMIT);
}

async function readRecentRuleIds(): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(RECENT_RULES_STORAGE_KEY);
    if (json === null) return [];
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function saveRecentRuleIds(ruleIds: string[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(RECENT_RULES_STORAGE_KEY, JSON.stringify(ruleIds));
    return true;
  } catch {
    return false;
  }
}

export function useRecentRules() {
  const [recentRuleIds, setRecentRuleIds] = useState<string[]>([]);
  const recentRuleIdsRef = useRef<string[]>([]);

  useEffect(() => {
    let isActive = true;
    const loadRecentRuleIds = async () => {
      const storedRuleIds = await readRecentRuleIds();
      if (!isActive) return;
      const merged = mergeRecentRuleIds(recentRuleIdsRef.current, storedRuleIds);
      recentRuleIdsRef.current = merged;
      setRecentRuleIds(merged);
    };
    void loadRecentRuleIds();
    return () => {
      isActive = false;
    };
  }, []);

  const addRecentRule = (ruleId: string) => {
    const next = mergeRecentRuleIds([ruleId], recentRuleIdsRef.current);
    recentRuleIdsRef.current = next;
    setRecentRuleIds(next);
    void saveRecentRuleIds(next);
  };

  return { recentRuleIds, addRecentRule };
}
