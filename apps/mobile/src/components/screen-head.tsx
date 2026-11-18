import Head from 'expo-router/head';

import { COPY } from '@/features/chat/constants';

type ScreenHeadProps = {
  screenTitle?: string;
};

export function ScreenHead({ screenTitle }: ScreenHeadProps) {
  const title = screenTitle ? `${screenTitle} — ${COPY.appTitle}` : COPY.appTitle;
  return (
    <Head>
      <title>{title}</title>
    </Head>
  );
}
