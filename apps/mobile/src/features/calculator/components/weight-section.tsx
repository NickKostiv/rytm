import type { ComponentRef, Ref } from 'react';
import type { TextInput, View } from 'react-native';

import { WeightPresets } from '@/features/calculator/components/weight-presets';
import { CALCULATOR_COPY } from '@/features/calculator/constants';
import { parseCalculatorWeight } from '@/features/calculator/parse-calculator-weight';
import { WeightField } from '@/features/chat/components/weight-field';
import { DoseCardHeader } from '@/features/dosing/components/dose-card-header';

type WeightSectionProps = {
  headerRef: Ref<ComponentRef<typeof View>>;
  inputRef: Ref<ComponentRef<typeof TextInput>>;
  weightText: string;
  error: string | null;
  onChange: (text: string) => void;
  onPickPreset: (weightKg: number) => void;
};

export function WeightSection({
  headerRef,
  inputRef,
  weightText,
  error,
  onChange,
  onPickPreset,
}: WeightSectionProps) {
  return (
    <>
      <WeightField
        label={<DoseCardHeader ref={headerRef} title={CALCULATOR_COPY.weightTitle} />}
        inputRef={inputRef}
        value={weightText}
        error={error}
        hint={null}
        isEditable
        onChange={onChange}
      />
      <WeightPresets
        selectedWeightKg={parseCalculatorWeight(weightText).weightKg}
        onPick={onPickPreset}
      />
    </>
  );
}
