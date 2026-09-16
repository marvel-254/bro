import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../theme';

export function VoiceMemoCard() {
  return (
    <View style={styles.container}>
      <View style={styles.leftCol}>
        <View style={styles.iconWrap}>
          <Ionicons name="mic" size={18} color={COLORS.onPrimary} />
        </View>
        <View style={styles.info}>
          <Text style={styles.title}>Spatial Audio Specs</Text>
          <Text style={styles.subtitle}>Sarah Kimani • Voice memo</Text>
        </View>
      </View>
      <View style={styles.waveform}>
        {[0.4, 0.7, 1.0, 0.6, 0.8, 0.5, 0.9, 0.55, 0.75, 0.45].map((h, i) => (
          <View key={i} style={[styles.bar, { height: 4 + h * 16 }]} />
        ))}
      </View>
      <TouchableOpacity style={styles.playBtn} activeOpacity={0.8}>
        <Ionicons name="play" size={14} color={COLORS.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 16,
    marginBottom: 10,
  },
  leftCol: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    color: COLORS.onSurface,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Outfit',
    marginBottom: 2,
  },
  subtitle: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontFamily: 'Geist',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    marginHorizontal: 12,
  },
  bar: {
    width: 3,
    borderRadius: 9999,
    backgroundColor: 'rgba(0, 240, 255, 0.5)',
  },
  playBtn: {
    width: 30,
    height: 30,
    borderRadius: 9999,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
});