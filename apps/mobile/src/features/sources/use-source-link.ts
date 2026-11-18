import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { SOURCE_COPY } from '@/features/sources/constants';

type OpenState = { status: 'idle' } | { status: 'opening' } | { status: 'failed'; message: string };

type SourceLink = {
  url: string;
  isAllowed: (url: string) => boolean;
  blockedMessage: string;
};

export function useSourceLink({ url, isAllowed, blockedMessage }: SourceLink) {
  const [openState, setOpenState] = useState<OpenState>({ status: 'idle' });
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const openLink = async () => {
    if (openState.status === 'opening') return;
    if (!isAllowed(url)) {
      setOpenState({ status: 'failed', message: blockedMessage });
      return;
    }
    setOpenState({ status: 'opening' });
    try {
      await openBrowserAsync(url);
      if (isMountedRef.current) setOpenState({ status: 'idle' });
    } catch {
      if (isMountedRef.current) setOpenState({ status: 'failed', message: SOURCE_COPY.sourceOpenFailed });
    }
  };

  return { openState, openLink };
}
