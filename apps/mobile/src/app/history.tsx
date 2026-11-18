import { ScreenHead } from '@/components/screen-head';
import { HistoryScreen } from '@/features/history/components/history-screen';
import { HISTORY_COPY } from '@/features/history/constants';

export default function HistoryRoute() {
  return (
    <>
      <ScreenHead screenTitle={HISTORY_COPY.screenTitle} />
      <HistoryScreen />
    </>
  );
}
