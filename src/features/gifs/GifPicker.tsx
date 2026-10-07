import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import { searchGifs, type Gif } from "../../lib/gifs";

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (gif: Gif) => void;
};

/** Rows of three, which is what a thumb fits comfortably on a phone. */
const COLUMNS = 3;
const PAGE_SIZE = 30;

/**
 * WhatsApp-style GIF picker over our own library.
 *
 * Search is server-side so it stays fast as the corpus grows, and an empty
 * library says so plainly rather than showing an endless spinner.
 */
export default function GifPicker({ visible, onClose, onPick }: Props) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const rows = await searchGifs(q, { limit: PAGE_SIZE });
      setGifs(rows);
    } catch {
      setGifs([]);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  // Debounced so typing does not fire a query per keystroke.
  useEffect(() => {
    if (!visible) return;
    const handle = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(handle);
  }, [visible, query, load]);

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setGifs([]);
      setLoaded(false);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.head}>
            <Text style={styles.title}>GIFs</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close gif picker"
            >
              <Ionicons name="close" size={24} color={COLORS.onSurface} />
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={COLORS.outline} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search GIFs"
              placeholderTextColor={COLORS.outline}
              style={styles.search}
              autoFocus
              returnKeyType="search"
              accessibilityLabel="Search GIFs"
            />
          </View>

          {loading && gifs.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.primaryContainer} />
            </View>
          ) : loaded && gifs.length === 0 ? (
            <View style={styles.center}>
              <Ionicons
                name="film-outline"
                size={36}
                color={COLORS.semantic.textDim}
              />
              <Text style={styles.emptyTitle}>
                {query ? "Nothing matched" : "No GIFs yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {query
                  ? "Try a different word."
                  : "The library is empty. GIFs have to be curated into it first."}
              </Text>
            </View>
          ) : (
            <FlatList
              key={COLUMNS}
              data={gifs}
              numColumns={COLUMNS}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onPick(item)}
                  style={styles.cell}
                  accessibilityRole="button"
                  accessibilityLabel={item.title || "Send GIF"}
                >
                  <Image
                    source={{ uri: item.url }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                </Pressable>
              )}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.semantic.canvasRoot,
  },
  safe: {
    flex: 1,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceSm,
    marginHorizontal: SPACING.gutter,
    marginBottom: SPACING.spaceSm,
    paddingHorizontal: SPACING.spaceMd,
    backgroundColor: COLORS.semantic.surfaceLevel2,
    borderRadius: RADIUS.full,
  },
  search: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    paddingVertical: SPACING.spaceSm,
  },
  grid: {
    padding: SPACING.spaceXs,
    gap: SPACING.spaceXs,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    backgroundColor: COLORS.semantic.surfaceLevel2,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.spaceSm,
    padding: SPACING.gutter,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  emptyBody: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.semantic.textDim,
    textAlign: "center",
  },
});
