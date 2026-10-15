import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SEMANTIC_COLORS, SPACING, TYPOGRAPHY } from "../../theme";
import { getSpaceGifs, type Gif } from "../../lib/gifs";

type Status = "loading" | "ready" | "error";

type Props = {
  visible: boolean;
  spaceId: string;
  spaceName: string;
  onClose: () => void;
  onPick: (gif: Gif) => void;
};

/**
 * GIFs shared anywhere inside a Space.
 *
 * This is deliberately a gallery of what this Space has already used rather
 * than a second GIF search surface: anyone in the Space can open the GifPicker
 * to search, whereas what belongs here is the Space's own shared vocabulary.
 * Reinventing search next door to the composer is duplication, not value.
 */
export default function SpaceGifsModal({
  visible,
  spaceId,
  spaceName,
  onClose,
  onPick,
}: Props) {
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setStatus("loading");
    void getSpaceGifs(spaceId)
      .then((rows) => {
        if (cancelled) return;
        setGifs(rows);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [visible, spaceId]);

  const renderBody = useCallback(() => {
    if (status === "loading") {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      );
    }

    if (status === "error") {
      return (
        <View style={styles.centered}>
          <Ionicons
            name="cloud-offline-outline"
            size={28}
            color={SEMANTIC_COLORS.textDim}
          />
          <Text style={styles.emptyTitle}>Could not load GIFs</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
        </View>
      );
    }

    if (gifs.length === 0) {
      return (
        <View style={styles.centered}>
          <Ionicons
            name="images-outline"
            size={28}
            color={SEMANTIC_COLORS.textDim}
          />
          <Text style={styles.emptyTitle}>No GIFs in this Space yet</Text>
          <Text style={styles.emptyBody}>
            Anything sent in a {spaceName} conversation shows up here to reuse.
          </Text>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.grid}>
        {gifs.map((gif) => (
          <Pressable
            key={gif.id}
            onPress={() => onPick(gif)}
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel={`Send ${gif.title}`}
          >
            <Image
              source={{ uri: gif.url }}
              style={styles.thumb}
              resizeMode="cover"
              accessibilityLabel={gif.title}
            />
          </Pressable>
        ))}
      </ScrollView>
    );
  }, [gifs, onPick, spaceName, status]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {spaceName} GIFs
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={SEMANTIC_COLORS.textDim} />
            </Pressable>
          </View>
          {renderBody()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: "75%",
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: SPACING.spaceLg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceMd,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.semantic.ghostBorderLight,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
    flex: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.spaceSm,
    padding: SPACING.spaceMd,
  },
  cell: {
    width: "31.5%",
    aspectRatio: 1,
  },
  thumb: {
    width: "100%",
    height: "100%",
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.spaceXl,
    paddingHorizontal: SPACING.spaceMd,
    gap: SPACING.spaceSm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: SEMANTIC_COLORS.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    ...TYPOGRAPHY.bodySM,
    color: SEMANTIC_COLORS.textDim,
    textAlign: "center",
  },
});