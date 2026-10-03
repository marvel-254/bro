import { useLocalSearchParams } from 'expo-router';
import ConversationDetail from '../../../src/features/conversations/ConversationDetail';

export default function ChatDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ConversationDetail conversationId={id} />;
}