import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { useAuth } from "../../lib/auth-context";

type Props = {
  visible: boolean;
  bio: string;
  onClose: () => void;
};

/** The "About" line on your profile. Short on purpose. */
const MAX_BIO = 120;

/** Edit the About line. Same pattern as the profile sheet, one field. */
export default function EditAboutSheet({ visible, bio, onClose }: Props) {
  const { updateProfile } = useAuth();
  const [text, setText] = useState(bio);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText(bio);
      setError(null);
    }
  }, [visible, bio]);

  const trimmed = text.trim();
  const unchanged = trimmed === bio.trim();
  const canSave = !saving && !unchanged;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ bio: trimmed });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <Text style={styles.title}>About</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons
                name="close"
                size={22}
                color={COLORS.onSurfaceVariant}
              />
            </Pressable>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Something short about you"
            placeholderTextColor={COLORS.outline}
            style={styles.input}
            multiline
            maxLength={MAX_BIO}
            autoFocus
            accessibilityLabel="About"
          />

          <Text style={styles.counter}>
            {trimmed.length}/{MAX_BIO}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={save}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel="Save about"
            style={[styles.save, !canSave && styles.saveDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.onPrimary} />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheetWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceSm,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceXs,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.semantic.ghostBorderLight,
    marginBottom: SPACING.spaceSm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.spaceSm,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  input: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    backgroundColor: COLORS.semantic.surfaceLevel2,
    borderRadius: RADIUS.sm,
    padding: SPACING.spaceMd,
    minHeight: 88,
    textAlignVertical: "top",
  },
  counter: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.outline,
    alignSelf: "flex-end",
  },
  error: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  save: {
    marginTop: SPACING.spaceMd,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  saveDisabled: {
    opacity: 0.4,
  },
  saveText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
});
