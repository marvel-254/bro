import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SEMANTIC_COLORS, SPACING, RADIUS } from '../../../theme';
import type { Space } from '../../../types';

interface SpaceListItemProps {
  space: Space;
  onPress?: () => void;
}

export function SpaceListItem({ space, onPress }: SpaceListItemProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Space: ${space.name}`}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={"space" as any} size={20} color={COLORS.primaryContainer} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {space.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {space.memberIds.length} members • {space.description || 'No description'}
        </Text>
      </View>
      {space.isPublic && (
        <Ionicons name="globe" size={14} color={SEMANTIC_COLORS.textDim} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.DEFAULT,
    marginBottom: 8,
    gap: SPACING.spaceSm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(107, 19, 175, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: COLORS.onSurface,
    fontSize: 14,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  meta: {
    color: SEMANTIC_COLORS.textDim,
    fontSize: 11,
    fontFamily: 'Geist',
    marginTop: 2,
  },
});