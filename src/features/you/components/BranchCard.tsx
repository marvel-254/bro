import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SEMANTIC_COLORS } from '../../../theme';

interface BranchCardProps {
  spaceName: string;
  branchTitle: string;
  transmissionCount: string;
  isBookmarked?: boolean;
}

export function BranchCard({
  spaceName,
  branchTitle,
  transmissionCount,
  isBookmarked = true,
}: BranchCardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <View style={styles.iconWrap}>
          <Ionicons name="git-branch" size={18} color={COLORS.secondaryContainer} />
        </View>
        <View style={styles.info}>
          <Text style={styles.spaceName} numberOfLines={1}>
            {spaceName}
          </Text>
          <Text style={styles.branchTitle} numberOfLines={1}>
            {branchTitle}
          </Text>
          <Text style={styles.transmissionCount}>{transmissionCount} transmissions</Text>
        </View>
      </View>
      <TouchableOpacity activeOpacity={0.8}>
        <Ionicons
          name={isBookmarked ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={isBookmarked ? COLORS.primaryContainer : COLORS.onSurfaceVariant}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 16,
    marginBottom: 10,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(107, 19, 175, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  spaceName: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontFamily: 'Geist',
    marginBottom: 2,
  },
  branchTitle: {
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Outfit',
    marginBottom: 2,
  },
  transmissionCount: {
    color: SEMANTIC_COLORS.textDim,
    fontSize: 11,
    fontFamily: 'Geist',
  },
});