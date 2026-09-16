import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SEMANTIC_COLORS } from '../../../theme';

interface QuickActionsProps {
  onEditIdentity: () => void;
  onShare: () => void;
  onSpatialAudio: () => void;
}

export function QuickActions({ onEditIdentity, onShare, onSpatialAudio }: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.editBtn} activeOpacity={0.8} onPress={onEditIdentity}>
        <Ionicons name="create" size={16} color={COLORS.onPrimary} />
        <Text style={styles.editText}>Edit Identity</Text>
      </TouchableOpacity>
      <View style={styles.iconGroup}>
        <TouchableOpacity style={styles.circleBtn} activeOpacity={0.8} onPress={onShare}>
          <Ionicons name="share-social" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.circleBtn} activeOpacity={0.8} onPress={onSpatialAudio}>
          <Ionicons name="volume-high" size={20} color={COLORS.onSurface} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 16,
    gap: 12,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryContainer,
    paddingVertical: 14,
    borderRadius: 9999,
    gap: 8,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.4,
    elevation: 6,
  },
  editText: {
    color: COLORS.onPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist',
  },
  iconGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  circleBtn: {
    width: 46,
    height: 46,
    borderRadius: 9999,
    backgroundColor: COLORS.surfaceContainer,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SEMANTIC_COLORS.ghostBorder,
  },
});