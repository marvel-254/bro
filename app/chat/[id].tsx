import { useLocalSearchParams } from 'expo-router';
import ConversationDetail from '../../src/features/conversations/ConversationDetail';

export default function ChatDetailRoute() {
  const { id, gif } = useLocalSearchParams<{ id: string; gif?: string }>();
  if (!id) return null;
  // `gif` carries a GIF chosen from a Space gallery, so it is sent as soon as
  // the conversation opens rather than being silently dropped.
  return (
    <ConversationDetail
      conversationId={id}
      pendingGifId={typeof gif === 'string' && gif.length > 0 ? gif : undefined}
    />
  );
}