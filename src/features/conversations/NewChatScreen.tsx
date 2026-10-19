import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { usePeople } from "../../lib/people-context";
import {
  createDirectConversation,
  createGroupConversation,
} from "../../lib/conversations";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * New chat — pick a person from your circle to start (or resume) a direct
 * conversation, or flip into group mode and name a group of several people.
 * Uses the same roster as Who's Around until friendships exist.
 */

export default function NewChatScreen() {
  const router = useRouter();
  const { people, loading, error, refresh } = usePeople();
  const [query, setQuery] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filtered = query.trim()
    ? people.filter(
        (person) =>
          person.displayName.toLowerCase().includes(query.toLowerCase()) ||
          (person.username ?? "").toLowerCase().includes(query.toLowerCase()),
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
        Alert.alert("Could not start chat", result.error);
      }
    },
    [router],
  );

  const toggleSelect = useCallback((userId: string) => {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }, []);

  const leaveGroupMode = useCallback(() => {
    setGroupMode(false);
    setGroupName("");
    setSelected([]);
  }, []);

  const createGroup = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    const result = await createGroupConversation(groupName, selected);
    setCreating(false);
    if (result.ok) {
      router.replace(`/chat/${result.conversationId}`);
    } else {
      Alert.alert("Could not create group", result.error);
    }
  }, [creating, groupName, selected, router]);

  const renderPerson = ({ item }: { item: (typeof people)[number] }) => {
    const isSelected = selected.includes(item.userId);
    const busy = starting === item.userId;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() =>
          groupMode ? toggleSelect(item.userId) : void start(item.userId)
        }
        disabled={busy}
        accessibilityRole={groupMode ? "checkbox" : "button"}
        accessibilityState={groupMode ? { checked: isSelected } : undefined}
        accessibilityLabel={
          groupMode
            ? `${isSelected ? "Deselect" : "Select"} ${item.displayName}`
            : `Message ${item.displayName}`
        }
      >
        <Avatar
          uri={item.avatarUrl}
          name={item.displayName}
          size={46}
          presence={item.presence}
        />
        <View style={styles.rowBody}>
          <Text style={styles.rowName}>{item.displayName}</Text>
          <Text style={styles.rowHandle}>@{item.username ?? "user"}</Text>
        </View>
        {groupMode ? (
          <Ionicons
            name={isSelected ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={isSelected ? COLORS.primary : COLORS.semantic.textDim}
          />
        ) : (
          <Ionicons
            name="chatbubble-outline"
            size={20}
            color={COLORS.semantic.textDim}
          />
        )}
      </TouchableOpacity>
    );
  };

  const canCreate = groupName.trim().length > 0 && selected.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (groupMode ? leaveGroupMode() : router.back())}
          accessibilityRole="button"
          accessibilityLabel={groupMode ? "Cancel new group" : "Back"}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {groupMode ? "New group" : "New chat"}
        </Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => {
            if (groupMode) {
              leaveGroupMode();
            } else {
              setGroupMode(true);
              setQuery("");
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={groupMode ? "Cancel" : "New group"}
        >
          <Ionicons
            name={groupMode ? "close" : "people-outline"}
            size={22}
            color={COLORS.primary}
          />
        </TouchableOpacity>
      </View>

      {groupMode ? (
        <View style={styles.groupNameBar}>
          <Ionicons name="pricetag-outline" size={18} color={COLORS.semantic.textDim} />
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name"
            placeholderTextColor={COLORS.semantic.textDim}
            value={groupName}
            onChangeText={setGroupName}
            maxLength={80}
            accessibilityLabel="Group name"
          />
        </View>
      ) : null}

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
          icon={
            <Ionicons
              name="people-outline"
              size={40}
              color={COLORS.semantic.textDim}
            />
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.userId}
          renderItem={renderPerson}
          contentContainerStyle={styles.listContent}
        />
      )}

      {groupMode ? (
        <View style={styles.groupFooter}>
          <TouchableOpacity
            style={[
              styles.createButton,
              !canCreate && styles.createButtonDisabled,
            ]}
            onPress={() => void createGroup()}
            disabled={!canCreate || creating}
            accessibilityRole="button"
            accessibilityLabel="Create group"
          >
            <Text style={styles.createButtonText}>
              {creating
                ? "Creating…"
                : selected.length > 0
                  ? `Create group (${selected.length})`
                  : "Create group"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceLg,
    paddingBottom: SPACING.spaceMd,
  },
  headerTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.semantic.textPrimary,
    flex: 1,
  },
  headerAction: {
    padding: SPACING.spaceXs,
  },
  groupNameBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.semantic.ghostBorder,
    borderRadius: RADIUS.sm,
  },
  groupNameInput: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textPrimary,
    paddingVertical: SPACING.spaceMd,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    fontWeight: "600",
  },
  rowHandle: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.semantic.textDim,
    fontFamily: "monospace",
  },
  groupFooter: {
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceMd,
    paddingBottom: SPACING.spaceXl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.semantic.ghostBorderLight,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
  },
  createButtonDisabled: {
    opacity: 0.4,
  },
  createButtonText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onPrimary,
  },
});
