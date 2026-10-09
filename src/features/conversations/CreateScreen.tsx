import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import {
  createDiscussion,
  DISCUSSION_TITLE_MAX,
  DISCUSSION_BODY_MAX,
} from "../../lib/discussions";

/**
 * Create — the `+` sheet.
 *
 * One flow: start a discussion. Anyone can start one and anyone can contribute,
 * so the only things worth asking for are a title and, optionally, some context.
 * There is no time, no place and no category any more — those were plans, and
 * they made this a form to fill in rather than an idea to put down.
 */

export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setCreating(true);
    setError(null);

    const result = await createDiscussion({ title, body });
    setCreating(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTitle("");
    setBody("");
    router.push("/(tabs)");
    Alert.alert(
      "Posted",
      "Anyone on BRO can add to it. Not just people you follow.",
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + SPACING.spaceMd },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Start a discussion</Text>
        <View style={styles.closeBtn} />
      </View>

      <Text style={styles.label}>What is it about</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="What should everyone weigh in on?"
        placeholderTextColor={COLORS.onSurfaceVariant}
        maxLength={DISCUSSION_TITLE_MAX}
        accessibilityLabel="Discussion title"
      />

      <Text style={styles.label}>
        Say more <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        style={[styles.input, styles.bodyInput]}
        value={body}
        onChangeText={setBody}
        placeholder="Add context so people can actually contribute."
        placeholderTextColor={COLORS.onSurfaceVariant}
        multiline
        maxLength={DISCUSSION_BODY_MAX}
        accessibilityLabel="Opening post"
      />

      {error ? <Text style={styles.formError}>{error}</Text> : null}

      <TouchableOpacity
        style={[
          styles.submit,
          (creating || !title.trim()) && styles.submitDisabled,
        ]}
        onPress={() => void submit()}
        disabled={creating || !title.trim()}
        accessibilityRole="button"
        accessibilityLabel="Post discussion"
      >
        <Text style={styles.submitText}>
          {creating ? "Posting..." : "Put it out there"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        Open to everyone on BRO. One contribution each, edit it any time.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingHorizontal: SPACING.spaceMd,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceXs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceSm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    fontWeight: "700",
    color: COLORS.onSurface,
  },
  label: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "600",
    color: COLORS.onSurface,
    marginTop: SPACING.spaceSm,
  },
  optional: {
    color: COLORS.onSurfaceVariant,
    fontWeight: "400",
  },
  input: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceContainer,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  bodyInput: {
    minHeight: 108,
    textAlignVertical: "top",
  },
  kindRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceXs,
  },
  kindChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  kindChipActive: {
    borderColor: COLORS.primaryContainer,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  kindText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurfaceVariant,
  },
  kindTextActive: {
    color: COLORS.primaryContainer,
    fontWeight: "700",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceXs,
  },
  presetChip: {
    paddingHorizontal: SPACING.spaceSm,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  startsNote: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.primaryContainer,
  },
  formError: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  submit: {
    marginTop: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryContainer,
    alignItems: "center",
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitText: {
    ...TYPOGRAPHY.labelLG,
    fontWeight: "700",
    color: COLORS.onPrimary,
  },
  note: {
    ...TYPOGRAPHY.labelSM,
    color: COLORS.onSurfaceVariant,
    textAlign: "center",
    marginTop: SPACING.spaceXs,
  },
});
