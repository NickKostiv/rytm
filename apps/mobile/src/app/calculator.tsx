import { ScreenHead } from '@/components/screen-head';
import { CalculatorScreen } from '@/features/calculator/components/calculator-screen';
import { CALCULATOR_COPY } from '@/features/calculator/constants';

export default function CalculatorRoute() {
  return (
    <>
      <ScreenHead screenTitle={CALCULATOR_COPY.screenTitle} />
      <CalculatorScreen />
    </>
  );
}
