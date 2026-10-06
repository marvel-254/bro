import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  isSearchable,
  searchEverything,
  totalResults,
  EMPTY_RESULTS,
  type SearchResults,
} from "../../lib/search";
import { EmptyState } from "../../components/feedback/States";

/**
 * Global search across people, spaces, conversations and messages.
 *
 * Debounced so a burst of keystrokes does not fire four queries each. Each
 * category renders as its own section and a category that returned nothing is
 * omitted entirely rather than showing an empty header.
 */

const DEBOUNCE_MS = 300;

function relativeLabel(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function SearchScreen() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Keeps the in-flight search identifiable so a stale response cannot
  // overwrite a newer one when the user types quickly.
  const requestId = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (text: string) => {
    if (!isSearchable(text)) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      setHasSearched(false);
      setError(null);
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    setSearching(true);

    try {
      const found = await searchEverything(text);
      if (requestId.current !== id) return;
      setResults(found);
      setError(null);
      setHasSearched(true);
    } catch (err) {
      if (requestId.current !== id) return;
      setError(err instanceof Error ? err.message : "Search failed");
      setHasSearched(true);
    } finally {
      if (requestId.current === id) {
        setSearching(false);
      }
    }
  }, []);

  const onChange = useCallback(
    (text: string) => {
      setQuery(text);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(
        () => void runSearch(text),
        DEBOUNCE_MS,
      );
    },
    [runSearch],
  );

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  const total = useMemo(() => totalResults(results), [results]);

  const startChatWith = useCallback(
    async (personId: string) => {
      const { createDirectConversation } = await import(
        "../../lib/conversations"
      );
      const created = await createDirectConversation(personId);
      if (created.ok) {
        router.push(`/chat/${created.conversationId}`);
      } else {
        setError(created.error);
      }
    },
    [router],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.onSurfaceVariant} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={onChange}
          placeholder="People, spaces, chats, messages"
          placeholderTextColor={COLORS.onSurfaceVariant}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search BRO"
        />
        {searching ? (
          <ActivityIndicator size="small" color={COLORS.primaryContainer} />
        ) : null}
        {query.length > 0 && !searching ? (
          <TouchableOpacity
            onPress={() => onChange("")}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons
              name="close-circle"
              size={16}
              color={COLORS.onSurfaceVariant}
            />
          </TouchableOpacity>
        ) : null}
      </View>

      {!isSupabaseConfigured ? (
        <EmptyState
          message="Backend not configured. Set the Supabase URL and anon key to search."
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => void runSearch(query)}
            accessibilityRole="button"
          >
            <Text style={styles.retry}>Run it back</Text>
          </TouchableOpacity>
        </View>
      ) : !isSearchable(query) ? (
        <EmptyState
          message="Search people, spaces, chats and messages."
          icon={
            <Ionicons
              name="search-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : hasSearched && total === 0 && !searching ? (
        <EmptyState
          message="idek what that is cuz. Try another name fr."
          icon={
            <Ionicons
              name="help-circle-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : (
        <ScrollView
          style={styles.results}
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {results.people.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>People</Text>
              {results.people.map((person) => (
                <TouchableOpacity
                  key={person.id}
                  style={styles.row}
                  onPress={() => void startChatWith(person.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Message ${person.displayName}`}
                >
                  <Avatar
                    name={person.displayName}
                    uri={person.avatarUrl}
                    size={38}
                  />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {person.displayName}
                    </Text>
                    {person.username ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        @{person.username}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name="chatbubble-outline"
                    size={18}
                    color={COLORS.onSurfaceVariant}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {results.spaces.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spaces</Text>
              {results.spaces.map((space) => (
                <TouchableOpacity
                  key={space.id}
                  style={styles.row}
                  onPress={() => router.push(`/spaces/${space.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open space ${space.name}`}
                >
                  <Avatar name={space.name} uri={space.avatarUrl} size={38} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {space.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {space.description ?? `${space.memberCount} in`}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.onSurfaceVariant}
                  />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {results.conversations.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Chats</Text>
              {results.conversations.map((conversation) => (
                <TouchableOpacity
                  key={conversation.id}
                  style={styles.row}
                  onPress={() => router.push(`/chat/${conversation.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat ${conversation.title}`}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {conversation.title}
                    </Text>
                    {conversation.preview ? (
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {conversation.preview}
                      </Text>
                    ) : null}
                  </View>
                  {conversation.unreadCount > 0 ? (
                    <View style={styles.unreadPill}>
                      <Text style={styles.unreadText}>
                        {conversation.unreadCount}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.rowMeta}>
                      {relativeLabel(conversation.lastMessageAt)}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {results.messages.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Messages</Text>
              {results.messages.map((message) => (
                <TouchableOpacity
                  key={message.messageId}
                  style={styles.row}
                  onPress={() => router.push(`/chat/${message.conversationId}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open message from ${message.senderName ?? "someone"}`}
                >
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {message.senderName ?? "Someone"}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                      {message.content}
                    </Text>
                  </View>
                  <Text style={styles.rowMeta}>
                    {relativeLabel(message.createdAt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceXs,
  },
  title: {
    ...TYPOGRAPHY.headlineMD,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    margin: SPACING.spaceMd,
    paddingHorizontal: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  input: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    paddingVertical: SPACING.spaceXs,
  },
  results: {
    flex: 1,
  },
  resultsContent: {
    paddingBottom: SPACING.spaceXl,
  },
  section: {
    marginBottom: SPACING.spaceSm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: SPACING.spaceMd,
    marginBottom: SPACING.spaceXs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    ...TYPOGRAPHY.bodyMD,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  rowMeta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  unreadPill: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
  },
  unreadText: {
    ...TYPOGRAPHY.labelSM,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
  errorWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceSm,
    padding: SPACING.spaceXl,
  },
  errorText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.error,
    textAlign: "center",
  },
  retry: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.primaryContainer,
  },
});
