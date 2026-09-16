import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SEMANTIC_COLORS, SPACING, RADIUS } from '../../../theme';

interface PulseSignatureProps {
  signal?: number;
}

export function PulseSignature({ signal = 0 }: PulseSignatureProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="pulse" size={16} color={COLORS.primaryContainer} />
      <View style={[styles.pulseBar, { opacity: 0.3 + (signal % 7) * 0.1 }]} />
      <Text style={styles.label}>SIGNAL {signal.toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.spaceSm,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: RADIUS.DEFAULT,
  },
  pulseBar: {
    width: 48,
    height: 2,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 1,
  },
  label: {
    fontSize: 9,
    color: SEMANTIC_COLORS.textDim,
    fontFamily: 'Geist',
    letterSpacing: 0.5,
  },
});