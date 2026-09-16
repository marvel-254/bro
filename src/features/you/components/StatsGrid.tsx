import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';

interface StatItem {
  value: string;
  label: string;
}

interface StatsGridProps {
  items: StatItem[];
}

export function StatsGrid({ items }: StatsGridProps) {
  return (
    <View style={styles.container}>
      {items.map((item, index) => (
        <View key={index} style={styles.item}>
          <Text style={styles.value}>{item.value}</Text>
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 16,
    marginTop: 8,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: COLORS.primaryContainer,
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Outfit',
    marginBottom: 4,
  },
  label: {
    color: COLORS.onSurfaceVariant,
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    fontFamily: 'Geist',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});