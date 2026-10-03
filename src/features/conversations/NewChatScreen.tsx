import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../theme';
import { Avatar } from '../../components/ui/Avatar';
import { usePeople } from '../../lib/people-context';
import { createDirectConversation } from '../../lib/conversations';
import { LoadingState, ErrorState, EmptyState } from '../../components/feedback/States';

/**
 * New chat — pick a person from your circle to start (or resume) a direct
 * conversation. Uses the same roster as Who's Around until friendships exist.
 */

export default function NewChatScreen() {
  const router = useRouter();
  const { people, loading, error, refresh } = usePeople();
  const [query, setQuery] = useState('');
  const [starting, setStarting] = useState<string | null>(null);

  const filtered = query.trim()
    ? people.filter((person) =>
        person.displayName.toLowerCase().includes(query.toLowerCase()) ||
        (person.username ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : people;

  const start = useCallback(
    async (peerId: string) => {
      setStarting(peerId);
      const result = await createDirectConversation(peerId);
      setStarting(null);
      if (result.ok) {
        router.replace(`/chat/${result.conversationId}`);
      } else {
        Alert.alert('Could not start chat', result.error);
      }
    },
    [router],
  );

  const renderPerson = ({ item }: { item: (typeof people)[number] }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => void start(item.userId)}
      disabled={starting === item.userId}
      accessibilityRole="button"
      accessibilityLabel={`Message ${item.displayName}`}
    >
      <Avatar
        uri={item.avatarUrl}
        name={item.displayName}
        size={46}
        presence={item.presence}
      />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{item.displayName}</Text>
        <Text style={styles.rowHandle}>@{item.username ?? 'user'}</Text>
      </View>
      <Ionicons name="chatbubble-outline" size={20} color={COLORS.semantic.textDim} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New chat</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={COLORS.semantic.textDim} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your circle..."
          placeholderTextColor={COLORS.semantic.textDim}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <LoadingState message="Loading your circle..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          message="Nobody in your circle yet. Start a conversation from a profile to add people."
          icon={<Ionicons name="people-outline" size={40} color={COLORS.semantic.textDim} />}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.userId}
          renderItem={renderPerson}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceLg,
    paddingBottom: SPACING.spaceMd,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.spaceMd,
    paddingHorizontal: SPACING.spaceMd,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    borderRadius: RADIUS.sm,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    paddingVertical: SPACING.spaceMd,
  },
  listContent: {
    paddingHorizontal: SPACING.gutter,
    paddingBottom: SPACING.spaceXl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceMd,
    paddingVertical: SPACING.spaceMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.semantic.ghostBorderLight,
  },
  rowBody: {
    flex: 1,
  },
  rowName: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    fontWeight: '600',
  },
  rowHandle: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: 'monospace',
  },
});