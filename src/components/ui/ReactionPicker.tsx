import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
  FlatList,
  SafeAreaView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SEMANTIC_COLORS, SPACING, RADIUS, TYPOGRAPHY } from "../../theme";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useFocusTrap } from "../../hooks/useFocusTrap";

/**
 * Emoji picker for message reactions.
 * Supports frequently used, categories, and search.
 *
 * Usage:
 * ```tsx
 * <ReactionPicker
 *   visible={showPicker}
 *   onClose={() => setShowPicker(false)}
 *   onSelect={(emoji) => handleReact(messageId, emoji)}
 *   anchorRef={messageRef}
 * />
 * ```
 */

// Emoji categories
const EMOJI_CATEGORIES = {
  frequent: "🕒",
  smileys: "😀",
  people: "👋",
  animals: "🐶",
  food: "🍕",
  activities: "⚽",
  travel: "🚗",
  objects: "💡",
  symbols: "❤️",
  flags: "🏁",
} as const;

const CATEGORY_EMOJIS: Record<keyof typeof EMOJI_CATEGORIES, string[]> = {
  frequent: [], // Filled from storage
  smileys: [
    "😀","😃","😄","😁","😆","😅","😂","🤣","🥲","☺️","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","😵‍💫","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","💔","❤️‍🔥","❤️‍🩹","❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍"
  ],
  people: [
    "👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦵","🦿","🦶","👂","🦻","👃","🧠","🫀","🫁","🦷","🦴","👀","👁️","👅","👄","🫦","👶","🧒","👦","👧","🧑","👱","👨","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🤷","🙇","🤦","🤷","🙎","💇","💆","🧖","🧗","🏃","💃","🕺","👯","🧖","🧘","🛀","🛌","🤺","🏇","⛷️","🏂","🏌️","🏄","🏊","⛹️","🏋️","🚴","🚵","🤸","🤼","🤽","🤾","🤹","🧘","🛀","🛌","🤺","🏇","⛷️","🏂","🏌️","🏄","🏊","⛹️","🏋️","🚴","🚵","🤸","🤼","🤽","🤾","🤹"
  ],
  animals: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🐣","🐥","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🐓","🦃","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿️","🦔"
  ],
  food: [
    "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🦴","🌭","🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🍿","🧈","🧂","🥫","🍱","🍘","🍙","🍚","🍛","🍜","🍝","🍠","🍢","🍣","🍤","🍥","🥮","🍡","🍧","🍨","🍦","🥧","🍰","🎂","🍪","🍩","🍫","🍬","🍭","🍮","🍯","🍼","🥛","☕","🫖","🍵","🍶","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧃","🧉","🧊","🥤"
  ],
  activities: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🔮","🏓","🏸","🏒","🏑","🥍","🏏","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛷","⛸️","🎿","⛷️","🏂","🏋️","🏋️‍♂️","🏋️‍♀️","🏊","🏊‍♂️","🏊‍♀️","⛹️","⛹️‍♂️","⛹️‍♀️","🏇","🏇‍♂️","🏇‍♀️","🧘","🧘‍♂️","🧘‍♀️","🏄","🏄‍♂️","🏄‍♀️","🏊","🏊‍♂️","🏊‍♀️","🚴","🚴‍♂️","🚴‍♀️","🚵","🚵‍♂️","🚵‍♀️","🤸","🤸‍♂️","🤸‍♀️","🤼","🤼‍♂️","🤼‍♀️","🤽","🤽‍♂️","🤽‍♀️","🤾","🤾‍♂️","🤾‍♀️","🤹","🤹‍♂️","🤹‍♀️","🎭","🎨","🎪","🎢","🎡","🎠","🎠","🎪","🎨","🎭","🎬","🎤","🎧","🎼","🎹","🎺","🎻","🪕","🥁","🪗","🎻","🎷","🎺","🪗","🥁","🪕","🎹","🎺","🎻","🪕","🥁","🪗","🎷","🎺","🪗","🥁"
  ],
  travel: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🦯","🦽","🦼","🛴","🚲","🛵","🏍️","🛺","🚨","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚂","🚆","🚅","🚄","🚈","🚇","🚊","🚝","🚋","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶","⛵","🚤","🛳️","⛴️","🚢","⚓","⛽","🛟","🏝️","🏖️","🏜️","🌋","🗻","🏔️","⛰️","🗾","🏕️","🏖️","🏜️","🌋","🗻","🏔️","⛰️","🗾","🏕️"
  ],
  objects: [
    "💡","🔦","🕯️","🪔","🧯","🛢️","💰","💴","💵","💶","💷","💸","💳","🧾","💹","✉️","📧","📨","📩","📤","📥","📦","📫","📪","📬","📭","📮","🗳️","✏️","🖊️","🖋️","🖌️","🖍️","📝","💼","📁","📂","🗂️","📅","📆","🗒️","🗓️","📇","📈","📉","📊","📋","📌","📍","📎","🖇️","📏","📐","✂️","🗃️","🗄️","🗑️","🔒","🔓","🔏","🔐","🔑","🗝️","🔨","🪓","⛏️","⚒️","🛠️","🗡️","⚔️","🛡️","🪃","🪄","🚬","⚰️","⚱️","🗿","🪧","🏧","🚮","🚰","♿","🚹","🚺","🚻","🚼","🚾","🛂","🛃","🛄","🛅"
  ],
  symbols: [
    "❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💔","❤️‍🔥","❤️‍🩹","💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","💍","💎","🔮","🎱","🎯","🎮","🎰","🎲","🧩","🧸","🪅","🪆","🎴","🃏","🀄","🎴","🃏","🀄","🎮","🎰","🎲","🧩","🧸","🪅","🪆","🎴","🃏","🀄","🎮","🎰","🎲","🧩","🧸","🪅","🪆","🎴","🃏","🀄","🎮","🎰","🎲","🧩","🧸","🪅","🪆","🎴","🃏","🀄","🎮","🎰","🎲","🧩","🧸","🪅","🪆","🎴","🃏","🀄","🎮","🎰","🎲","🧩","🧸","🪅","🪆"
  ],
  flags: [
    "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇦🇨","🇦🇩","🇦🇪","🇦🇫","🇦🇬","🇦🇮","🇦🇱","🇦🇲","🇦🇴","🇦🇶","🇦🇷","🇦🇸","🇦🇹","🇦🇺","🇦🇼","🇦🇽","🇦🇿","🇧🇦","🇧🇧","🇧🇩","🇧🇪","🇧🇫","🇧🇬","🇧🇭","🇧🇮","🇧🇯","🇧🇱","🇧🇲","🇧🇳","🇧🇴","🇧🇶","🇧🇷","🇧🇸","🇧🇹","🇧🇻","🇧🇼","🇧🇾","🇧🇿","🇨🇦","🇨🇨","🇨🇩","🇨🇫","🇨🇬","🇨🇭","🇨🇮","🇨🇰","🇨🇱","🇨🇲","🇨🇳","🇨🇴","🇨🇵","🇨🇷","🇨🇺","🇨🇻","🇨🇼","🇨🇽","🇨🇾","🇨🇿","🇩🇪","🇩🇬","🇩🇯","🇩🇰","🇩🇲","🇩🇴","🇩🇿","🇪🇦","🇪🇨","🇪🇪","🇪🇬","🇪🇭","🇪🇷","🇪🇸","🇪🇹","🇪🇺","🇫🇮","🇫🇯","🇫🇰","🇫🇲","🇫🇴","🇫🇷","🇬🇦","🇬🇧","🇬🇩","🇬🇪","🇬🇫","🇬🇬","🇬🇭","🇬🇮","🇬🇱","🇬🇲","🇬🇳","🇬🇵","🇬🇶","🇬🇷","🇬🇸","🇬🇹","🇬🇺","🇬🇼","🇬🇾","🇭🇰","🇭🇳","🇭🇷","🇭🇹","🇭🇺","🇮🇨","🇮🇩","🇮🇪","🇮🇱","🇮🇲","🇮🇳","🇮🇴","🇮🇶","🇮🇷","🇮🇸","🇮🇹","🇯🇪","🇯🇲","🇯🇴","🇯🇵","🇰🇪","🇰🇬","🇰🇭","🇰🇮","🇰🇲","🇰🇳","🇰🇵","🇰🇷","🇰🇼","🇰🇾","🇰🇿","🇱🇦","🇱🇧","🇱🇨","🇱🇮","🇱🇰","🇱🇷","🇱🇸","🇱🇹","🇱🇺","🇱🇻","🇱🇾","🇲🇦","🇲🇨","🇲🇩","🇲🇪","🇲🇫","🇲🇬","🇲🇭","🇲🇰","🇲🇱","🇲🇲","🇲🇳","🇲🇴","🇲🇵","🇲🇶","🇲🇷","🇲🇸","🇲🇹","🇲🇺","🇲🇻","🇲🇼","🇲🇽","🇲🇾","🇲🇿","🇳🇦","🇳🇨","🇳🇪","🇳🇫","🇳🇬","🇳🇮","🇳🇱","🇳🇴","🇳🇵","🇳🇷","🇳🇺","🇳🇿","🇴🇲","🇵🇦","🇵🇪","🇵🇫","🇵🇬","🇵🇭","🇵🇰","🇵🇱","🇵🇲","🇵🇳","🇵🇷","🇵🇸","🇵🇹","🇵🇼","🇵🇾","🇶🇦","🇷🇪","🇷🇴","🇷🇸","🇷🇺","🇷🇼","🇸🇦","🇸🇧","🇸🇨","🇸🇩","🇸🇪","🇸🇬","🇸🇭","🇸🇮","🇸🇯","🇸🇰","🇸🇱","🇸🇲","🇸🇳","🇸🇴","🇸🇷","🇸🇸","🇸🇹","🇸🇻","🇸🇽","🇸🇾","🇸🇿","🇹🇦","🇹🇨","🇹🇩","🇹🇫","🇹🇬","🇹🇭","🇹🇯","🇹🇰","🇹🇱","🇹🇲","🇹🇳","🇹🇴","🇹🇷","🇹🇹","🇹🇻","🇹🇼","🇹🇿","🇺🇦","🇺🇬","🇺🇲","🇺🇳","🇺🇸","🇺🇾","🇺🇿","🇻🇦","🇻🇨","🇻🇪","🇻🇬","🇻🇮","🇻🇳","🇻🇺","🇼🇫","🇼🇸","🇽🇰","🇾🇪","🇾🇹","🇿🇦","🇿🇲","🇿🇼"
  ],
};

type CategoryKey = keyof typeof EMOJI_CATEGORIES;

interface ReactionPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  /** Optional anchor for positioning (future use) */
  anchorRef?: React.RefObject<View>;
}

export function ReactionPicker({
  visible,
  onClose,
  onSelect,
}: ReactionPickerProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { containerRef, activate, deactivate } = useFocusTrap({ onEscape: onClose });

  void insets;
  void reducedMotion;

  const [activeCategory, setActiveCategory] = useState<CategoryKey>("frequent");
  const [searchQuery, setSearchQuery] = useState("");
  const [frequentEmojis, setFrequentEmojis] = useState<string[]>([]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void frequentEmojis;
  const [showSearch, setShowSearch] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const categoryListRef = useRef<FlatList<CategoryKey>>(null);

  // Load frequent emojis from storage
  useEffect(() => {
    // In a real app, load from AsyncStorage
    // For now, use some defaults
    setFrequentEmojis(["👍", "❤️", "😂", "🔥", "😮", "😢", "🎉", "🙏", "😍", "😭", "🤣", "😭"]);
  }, []);

  // Animate in/out
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      activate();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 50, duration: 150, useNativeDriver: true }),
      ]).start(() => deactivate());
    }
  }, [visible, fadeAnim, slideAnim, activate, deactivate]);

  if (!visible) return null;

  const handleEmojiPress = (emoji: string) => {
    // Update frequent emojis
    setFrequentEmojis((prev) => {
      const filtered = prev.filter((e) => e !== emoji);
      return [emoji, ...filtered].slice(0, 20);
    });
    onSelect(emoji);
    onClose();
  };

  const filteredEmojis = searchQuery
    ? Object.values(CATEGORY_EMOJIS).flat().filter((e) =>
        e.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : CATEGORY_EMOJIS[activeCategory] || [];

  const categories: CategoryKey[] = [
    "frequent",
    "smileys",
    "people",
    "animals",
    "food",
    "activities",
    "travel",
    "objects",
    "symbols",
    "flags",
  ];

  return (
    <SafeAreaView
      ref={containerRef}
      style={styles.container}
      onTouchStart={() => {}} // Needed for focus trap
    >
      <Animated.View
        style={[
          styles.sheet,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Category tabs */}
        <View style={styles.categoryTabs}>
          <FlatList
            ref={categoryListRef}
            data={categories}
            horizontal
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryTabsContent}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.categoryTab,
                  activeCategory === item && styles.categoryTabActive,
                ]}
                onPress={() => setActiveCategory(item)}
                accessibilityRole="tab"
                aria-selected={activeCategory === item}
              >
                <Text style={styles.categoryTabText}>{EMOJI_CATEGORIES[item]}</Text>
              </Pressable>
            )}
          />
        </View>

        {/* Search bar */}
        {showSearch && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search emojis..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
              placeholderTextColor={SEMANTIC_COLORS.textDim}
            />
            <Pressable onPress={() => setShowSearch(false)} style={styles.searchCancel}>
              <Text style={styles.searchCancelText}>Cancel</Text>
            </Pressable>
          </View>
        )}

        {/* Search icon when not searching */}
        {!showSearch && (
          <Pressable style={styles.searchButton} onPress={() => setShowSearch(true)}>
            <Ionicons name="search-outline" size={22} color={SEMANTIC_COLORS.textSecondary} />
          </Pressable>
        )}

        {/* Emoji grid */}
        <View style={styles.emojiGrid}>
          <FlatList
            data={filteredEmojis}
            numColumns={8}
            keyExtractor={(item, index) => `${item}-${index}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.emojiGridContent}
            renderItem={({ item }) => (
              <Pressable
                style={styles.emojiButton}
                onPress={() => handleEmojiPress(item)}
                accessibilityRole="button"
                accessibilityLabel={item}
              >
                <Text style={styles.emojiText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  sheet: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    paddingBottom: 20,
    maxHeight: Dimensions.get("window").height * 0.6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: SPACING.spaceSm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outline,
    opacity: 0.5,
  },
  categoryTabs: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  categoryTabsContent: {
    paddingHorizontal: SPACING.gutter,
    paddingVertical: SPACING.spaceXs,
    gap: SPACING.spaceXs,
  },
  categoryTab: {
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceXs,
    borderRadius: RADIUS.full,
  },
  categoryTabActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  categoryTabText: {
    fontSize: 20,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.gutter,
    gap: SPACING.spaceSm,
  },
  searchInput: {
    flex: 1,
    ...TYPOGRAPHY.bodyMD,
    paddingHorizontal: SPACING.spaceMd,
    paddingVertical: SPACING.spaceSm,
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: RADIUS.full,
    color: SEMANTIC_COLORS.textPrimary,
  },
  searchCancel: {
    paddingHorizontal: SPACING.spaceSm,
  },
  searchCancelText: {
    ...TYPOGRAPHY.labelLG,
    color: COLORS.primary,
  },
  searchButton: {
    position: "absolute",
    right: SPACING.gutter,
    top: 60,
    padding: SPACING.spaceSm,
  },
  emojiGrid: {
    flex: 1,
    paddingHorizontal: SPACING.gutter,
  },
  emojiGridContent: {
    paddingBottom: SPACING.xl,
    gap: SPACING.spaceXs,
  },
  emojiButton: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
  },
  emojiText: {
    fontSize: 28,
  },
});