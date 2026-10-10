import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from "../../theme";
import * as ImagePicker from "expo-image-picker";
import {
  fetchMemesPage,
  isMemeLibraryConfigured,
  isMemeUploadConfigured,
  downloadMeme,
  uploadMeme,
  MEME_PAGE_SIZE,
  type Meme,
} from "../../lib/memes";
import { hasMoreMemes, mergeMemePage } from "../../lib/meme-queries";

type Props = {
  /** Called with the chosen meme, for "use this in a chat". */
  onUseMeme?: (meme: Meme) => void;
  /** Called after an upload lands, so the parent can refetch. */
  onChanged?: () => void;
};

/**
 * The meme feed, infinite-scrolled.
 *
 * Replaces a single "meme of the moment" card backed by imgflip. The feed is
 * keyed on id rather than trusting page boundaries: new uploads arrive while
 * you are scrolling, so offset paging can repeat a row, and a feed that shows
 * the same meme twice looks broken.
 */
export default function MemeFeed({ onUseMeme, onChanged }: Props) {
  const [memes, setMemes] = useState<Meme[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const seen = useRef(new Set<string>());
  // Guards against two onEndReached calls racing: FlatList fires it repeatedly
  // while the list is still tall, which would double-request every page.
  const inFlight = useRef(false);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    seen.current.clear();
    try {
      const page = await fetchMemesPage(0, MEME_PAGE_SIZE);
      for (const meme of page.memes) seen.current.add(meme.id);
      setMemes(page.memes);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load memes",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isMemeLibraryConfigured()) {
      setLoading(false);
      return;
    }
    void loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (inFlight.current || !hasMore || loading) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchMemesPage(memes.length, MEME_PAGE_SIZE);
      setMemes((prev) => {
        const added = mergeMemePage(prev, page.memes);
        const addedCount = added.length - prev.length;
        setHasMore(hasMoreMemes(page.memes.length, MEME_PAGE_SIZE, addedCount));
        return added;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
      inFlight.current = false;
    }
  }, [hasMore, loading, memes.length]);

  /**
   * Pick an image and send it to the Worker.
   *
   * The picked file is not added to the list optimistically: the Worker
   * decides the storage key and writes the catalogue row, so guessing at a row
   * here would show a meme that might have been rejected or rate-limited.
   */
  const onDownload = useCallback(async (meme: Meme) => {
    if (!meme.url || saving) return;
    setSaving(meme.id);
    setError(null);
    try {
      const result = await downloadMeme(meme);
      if (!result.ok) setError(result.error);
    } finally {
      setSaving(null);
    }
  }, [saving]);

  const onUpload = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadError("BRO needs permission to reach your photos.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (picked.canceled) return;

    setUploading(true);
    setUploadError(null);
    try {
      const asset = picked.assets[0];
      const result = await uploadMeme(
        { uri: asset.uri, type: asset.mimeType },
        asset.fileName?.replace(/\.[^.]+$/, "") ?? "",
      );
      if (!result.ok) {
        setUploadError(result.error);
        return;
      }
      await loadFirstPage;
      onChanged?.();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Could not upload that.",
      );
    } finally {
      setUploading(false);
    }
  }, [loadFirstPage, onChanged]);

  const renderItem = useCallback(
    ({ item }: { item: Meme }) => (
      <View style={styles.card}>
        {item.url ? (
          <Image
            source={{ uri: item.url }}
            style={[styles.image, aspectStyle(item)]}
            resizeMode="contain"
            accessibilityLabel={item.title || "Meme"}
          />
        ) : (
          <View style={[styles.image, styles.imageMissing]}>
            <Ionicons name="image-outline" size={28} color={COLORS.outline} />
          </View>
        )}
        <View style={styles.cardFoot}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title || "Untitled"}
          </Text>
          <View style={styles.cardActions}>
            {onUseMeme ? (
              <Pressable
                onPress={() => onUseMeme(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Use ${item.title} in a chat`}
              >
                <Ionicons name="send" size={17} color={COLORS.primaryContainer} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => void onDownload(item)}
              disabled={saving === item.id}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Download ${item.title}`}
            >
              {saving === item.id ? (
                <ActivityIndicator size="small" color={COLORS.outline} />
              ) : (
                <Ionicons
                  name="download-outline"
                  size={16}
                  color={COLORS.outline}
                />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    ),
    [onUseMeme, onDownload, saving],
  );

  const footer = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={COLORS.primaryContainer} />
        </View>
      );
    }
    if (!hasMore && memes.length > 0) {
      return <Text style={styles.endText}>That is everything.</Text>;
    }
    return null;
  }, [loadingMore, hasMore, memes.length]);

  if (!isMemeLibraryConfigured()) return null;

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Memes</Text>
        {isMemeUploadConfigured() ? (
          <Pressable
            onPress={() => void onUpload()}
            disabled={uploading}
            hitSlop={10}
            style={styles.uploadButton}
            accessibilityRole="button"
            accessibilityLabel="Upload a meme"
          >
            {uploading ? (
              <ActivityIndicator size="small" color={COLORS.onPrimary} />
            ) : (
              <Ionicons name="add" size={16} color={COLORS.onPrimary} />
            )}
          </Pressable>
        ) : null}
      </View>

      {uploadError ? <Text style={styles.uploadError}>{uploadError}</Text> : null}

      {loading ? (
        <View style={styles.footer}>
          <ActivityIndicator color={COLORS.primaryContainer} />
        </View>
      ) : error && memes.length === 0 ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void loadFirstPage()}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel="Try loading memes again"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : memes.length === 0 ? (
        <Text style={styles.endText}>
          No memes yet. Be the first to upload one.
        </Text>
      ) : (
        <FlatList
          data={memes}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListFooterComponent={footer}
          onEndReachedThreshold={0.6}
          onEndReached={() => void loadMore()}
          // The feed lives inside Pulse's ScrollView, so it must not scroll
          // itself — otherwise it steals the gesture on the home screen.
          scrollEnabled={false}
          initialNumToRender={4}
          windowSize={5}
          removeClippedSubviews
        />
      )}

    </View>
  );
}

/**
 * Size each meme to its real shape.
 *
 * The card used to force `aspectRatio: 1` with `resizeMode="cover"`, which
 * cropped every non-square meme and cut the caption text straight off — the
 * one part of a meme anybody reads. The catalogue already stores width and
 * height, so the shape is known and there was no reason to guess.
 *
 * Tall memes are still capped, so a 2:5 template does not push the rest of
 * the feed off the screen.
 */
const MAX_IMAGE_RATIO = 1.4;

function aspectStyle(meme: Meme) {
  const ratio =
    meme.width > 0 && meme.height > 0 ? meme.height / meme.width : 1;
  return { aspectRatio: Math.min(Math.max(ratio, 0.5), MAX_IMAGE_RATIO) };
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceSm,
    gap: SPACING.spaceXs,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  uploadButton: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
  },
  uploadError: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.error,
  },
  title: {
    ...TYPOGRAPHY.headlineSM,
    color: COLORS.onSurface,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceXs,
    backgroundColor: COLORS.semantic.surfaceLevel2,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
  },
  search: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
  },
  card: {
    backgroundColor: COLORS.semantic.surfaceLevel1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    marginBottom: SPACING.spaceSm,
  },
  image: {
    width: "100%",
    backgroundColor: COLORS.semantic.surfaceLevel2,
  },
  imageMissing: {
    alignItems: "center",
    justifyContent: "center",
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    gap: SPACING.spaceSm,
  },
  cardTitle: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.onSurface,
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.spaceMd,
  },
  footer: {
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
  },
  endText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
    textAlign: "center",
    paddingVertical: SPACING.spaceSm,
  },
  errorBox: {
    paddingVertical: SPACING.spaceMd,
    alignItems: "center",
    gap: SPACING.spaceSm,
  },
  errorText: {
    ...TYPOGRAPHY.bodyMD,
    color: COLORS.error,
    textAlign: "center",
  },
  retry: {
    paddingHorizontal: SPACING.spaceLg,
    paddingVertical: SPACING.spaceSm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  retryText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.primaryContainer,
  },
  thanksText: {
    ...TYPOGRAPHY.bodySM,
    color: COLORS.semantic.textDim,
    textAlign: "center",
  },
});
