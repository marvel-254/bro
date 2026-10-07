import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { postStatus, STATUS_TTL_HOURS } from "../../lib/statuses";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
};

/** Compose a status: a line of text, or one photo. Both vanish after 24h. */
export default function StatusComposer({ visible, onClose, onPosted }: Props) {
  const [body, setBody] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setBody("");
    setPhotoUri(null);
    setBusy(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to share a status.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (picked.canceled) return;
    setPhotoUri(picked.assets[0].uri);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (photoUri) {
        await postStatus({ kind: "photo", localUri: photoUri });
      } else {
        await postStatus({ kind: "text", body });
      }
      close();
      onPosted();
    } catch (error) {
      Alert.alert(
        "Could not post",
        error instanceof Error ? error.message : "Try again.",
      );
      setBusy(false);
    }
  };

  const canPost = !busy && (photoUri ? true : body.trim().length > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>New status</Text>
            <Pressable
              onPress={close}
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

          {photoUri ? (
            <View style={styles.preview}>
              <Image source={{ uri: photoUri }} style={styles.previewImage} />
              <Pressable
                onPress={() => setPhotoUri(null)}
                style={styles.previewClear}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            </View>
          ) : null}

          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="What's happening?"
            placeholderTextColor={COLORS.outline}
            style={styles.input}
            multiline
            maxLength={300}
            accessibilityLabel="Status text"
          />

          <View style={styles.actions}>
            <Pressable
              onPress={() => void pickPhoto()}
              style={styles.ghostBtn}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
            >
              <Ionicons
                name="image-outline"
                size={20}
                color={COLORS.onSurface}
              />
              <Text style={styles.ghostText}>Photo</Text>
            </Pressable>

            <Pressable
              onPress={() => void submit()}
              disabled={!canPost}
              accessibilityRole="button"
              accessibilityLabel="Post status"
              style={[styles.postBtn, !canPost && styles.postBtnDisabled]}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.onPrimary} />
              ) : (
                <Text style={styles.postText}>Post</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.note}>
            Statuses disappear after {STATUS_TTL_HOURS} hours.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingHorizontal: SPACING.gutter,
    paddingTop: SPACING.spaceMd,
    paddingBottom: SPACING.spaceXl,
    gap: SPACING.spaceSm,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    minHeight: 96,
    textAlignVertical: "top",
  },
  preview: {
    height: 160,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    backgroundColor: COLORS.semantic.surfaceLevel2,
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  previewClear: {
    position: "absolute",
    top: SPACING.spaceXs,
    right: SPACING.spaceXs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceMd,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.semantic.surfaceLevel2,
    minHeight: 48,
  },
  ghostText: {
    ...TYPOGRAPHY.labelMD,
    color: COLORS.onSurface,
  },
  postBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryContainer,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.spaceMd,
    minHeight: 48,
  },
  postBtnDisabled: {
    opacity: 0.4,
  },
  postText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.onPrimary,
  },
  note: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
  },
});
