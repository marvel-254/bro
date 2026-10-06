import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { Avatar } from "../../components/ui/Avatar";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  fetchMySpaces,
  fetchDiscoverableSpaces,
  joinSpace,
  leaveSpace,
  createSpace,
  subscribeToSpaces,
  SPACE_NAME_MAX,
  SPACE_DESCRIPTION_MAX,
  type SpaceSummary,
} from "../../lib/spaces";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "../../components/feedback/States";

/**
 * Spaces — communities that organise conversations.
 *
 * Two lists: the ones you are in, and public ones you have not joined. Member
 * counts are only readable for spaces you belong to (RLS hides space_members
 * otherwise), so `memberCount === null` renders as an em dash rather than a
 * fabricated zero.
 */

type Tab = "mine" | "discover";

export default function SpacesScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("mine");
  const [mine, setMine] = useState<SpaceSummary[]>([]);
  const [discover, setDiscover] = useState<SpaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (asRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [mySpaces, discoverable] = await Promise.all([
        fetchMySpaces(),
        fetchDiscoverableSpaces(),
      ]);
      setMine(mySpaces);
      setDiscover(discoverable);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load spaces");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    void load();
    const unsubscribe = subscribeToSpaces({ onChange: () => void load(true) });
    return unsubscribe;
  }, [load]);

  const onJoin = useCallback(async (space: SpaceSummary) => {
    setBusyId(space.id);
    const result = await joinSpace(space.id);
    setBusyId(null);
    if (!result.ok) {
      Alert.alert("Could not join", result.error ?? "Try again in a bit.");
      return;
    }
    // Moving the space from Discover into My keeps both lists honest without
    // a full refetch.
    setDiscover((rows) => rows.filter((row) => row.id !== space.id));
    setMine((rows) => [
      { ...space, myRole: "member", memberCount: 1 },
      ...rows,
    ]);
  }, []);

  const onLeave = useCallback(async (space: SpaceSummary) => {
    setBusyId(space.id);
    const result = await leaveSpace(space.id);
    setBusyId(null);
    if (!result.ok) {
      Alert.alert("Could not leave", result.error ?? "Try again in a bit.");
      return;
    }
    setMine((rows) => rows.filter((row) => row.id !== space.id));
    setDiscover((rows) => [space, ...rows]);
  }, []);

  const submitCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    const result = await createSpace({ name, description, isPublic });
    setCreating(false);

    if (!result.ok) {
      setCreateError(result.error);
      return;
    }
    setComposerOpen(false);
    setName("");
    setDescription("");
    setTab("mine");
    setMine((rows) => [result.space, ...rows]);
  }, [name, description, isPublic]);

  const list = tab === "mine" ? mine : discover;

  const renderSpace = (space: SpaceSummary) => {
    const isMine = space.myRole !== null;
    const busy = busyId === space.id;

    return (
      <View key={space.id} style={styles.card}>
        <TouchableOpacity
          style={styles.cardHead}
          onPress={() => router.push("/chat")}
          accessibilityRole="button"
          accessibilityLabel={`Open ${space.name}`}
        >
          <Avatar name={space.name} uri={space.avatarUrl} size={40} />
          <View style={styles.cardHeadBody}>
            <Text style={styles.cardName} numberOfLines={1}>
              {space.name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {space.myRole
                ? `${space.myRole}`
                : space.isPublic
                  ? "Public"
                  : "Private"}
              {space.memberCount === null
                ? " · members hidden"
                : ` · ${space.memberCount} in`}
            </Text>
          </View>
        </TouchableOpacity>

        {space.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {space.description}
          </Text>
        ) : null}

        <View style={styles.cardActions}>
          {isMine ? (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => void onLeave(space)}
              disabled={busy || space.myRole === "owner"}
              accessibilityRole="button"
              accessibilityLabel={`Leave ${space.name}`}
            >
              <Text
                style={[
                  styles.secondaryBtnText,
                  space.myRole === "owner" && styles.btnDisabled,
                ]}
              >
                {space.myRole === "owner"
                  ? "You own this"
                  : busy
                    ? "..."
                    : "Leave"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void onJoin(space)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`Join ${space.name}`}
            >
              <Text style={styles.primaryBtnText}>
                {busy ? "..." : "Tap in"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spaces</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            setCreateError(null);
            setComposerOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Create a space"
        >
          <Ionicons name="add" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(["mine", "discover"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.tab, tab === value && styles.tabActive]}
            onPress={() => setTab(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === value }}
          >
            <Text
              style={[styles.tabText, tab === value && styles.tabTextActive]}
            >
              {value === "mine" ? "Your spaces" : "Discover"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!isSupabaseConfigured ? (
        <EmptyState
          message="Backend not configured. Set the Supabase URL and anon key to load spaces."
          icon={
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
          }
        />
      ) : loading ? (
        <LoadingState message="Loading spaces..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={COLORS.primaryContainer}
            />
          }
        >
          {list.length === 0 ? (
            <EmptyState
              message={
                tab === "mine"
                  ? "You are not in a space yet. Make one, or tap into Discover."
                  : "Nothing public to join yet fr."
              }
              icon={
                <Ionicons
                  name="planet-outline"
                  size={36}
                  color={COLORS.onSurfaceVariant}
                />
              }
            />
          ) : (
            list.map(renderSpace)
          )}
        </ScrollView>
      )}

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>New space</Text>
              <TouchableOpacity
                onPress={() => setComposerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={COLORS.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="The Crew"
              placeholderTextColor={COLORS.onSurfaceVariant}
              maxLength={SPACE_NAME_MAX}
              accessibilityLabel="Space name"
            />

            <Text style={styles.fieldLabel}>What is it about</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Bravos, build nights, match talk."
              placeholderTextColor={COLORS.onSurfaceVariant}
              multiline
              maxLength={SPACE_DESCRIPTION_MAX}
              accessibilityLabel="Space description"
            />

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsPublic((value) => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isPublic }}
            >
              <Text style={styles.toggleLabel}>
                Public — anyone can find and join
              </Text>
              <View style={[styles.checkbox, isPublic && styles.checkboxOn]}>
                {isPublic ? (
                  <Ionicons
                    name="checkmark"
                    size={14}
                    color={COLORS.onPrimary}
                  />
                ) : null}
              </View>
            </TouchableOpacity>

            {createError ? (
              <Text style={styles.formError}>{createError}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryBtn, styles.submitBtn]}
              onPress={() => void submitCreate()}
              disabled={creating || name.trim().length === 0}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>
                {creating ? "Setting up..." : "Make it"}
              </Text>
            </TouchableOpacity>

            <Text style={styles.formNote}>
              One field and you are in. No cleanup fr.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceXs,
  },
  title: {
    ...TYPOGRAPHY.headlineMD,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  tabs: {
    flexDirection: "row",
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceMd,
    paddingTop: SPACING.spaceSm,
  },
  tab: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  tabActive: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderColor: COLORS.primaryContainer,
  },
  tabText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  tabTextActive: {
    color: COLORS.primaryContainer,
    fontWeight: "700",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: SPACING.spaceMd,
    gap: SPACING.spaceSm,
    paddingBottom: SPACING.spaceXl,
  },
  card: {
    padding: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    gap: SPACING.spaceXs,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  cardHeadBody: {
    flex: 1,
  },
  cardName: {
    ...TYPOGRAPHY.bodyMD,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  cardMeta: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  cardDesc: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurfaceVariant,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  primaryBtn: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryContainer,
  },
  primaryBtnText: {
    ...TYPOGRAPHY.labelMD,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
  secondaryBtn: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  secondaryBtnText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  modalSheet: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
    padding: SPACING.spaceMd,
    gap: SPACING.spaceXs,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceXs,
  },
  modalTitle: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  fieldLabel: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
  },
  input: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.spaceXs,
  },
  toggleLabel: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.onSurface,
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primaryContainer,
  },
  formError: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  submitBtn: {
    marginTop: SPACING.spaceXs,
    alignItems: "center",
    paddingVertical: SPACING.spaceSm,
  },
  formNote: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    textAlign: "center",
  },
});
