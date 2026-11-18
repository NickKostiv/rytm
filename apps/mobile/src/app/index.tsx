import { ScreenHead } from '@/components/screen-head';
import { ChatScreen } from '@/features/chat/components/chat-screen';

export default function IndexRoute() {
  return (
    <>
      <ScreenHead />
      <ChatScreen />
    </>
  );
}
