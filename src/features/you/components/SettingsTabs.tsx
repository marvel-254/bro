import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../../../theme';

interface SettingsTabsProps {
  tabs: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function SettingsTabs({ tabs, activeIndex, onSelect }: SettingsTabsProps) {
  return (
    <View style={styles.container}>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex;
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, isActive ? styles.tabActive : styles.tabInactive]}
            activeOpacity={0.8}
            onPress={() => onSelect(index)}
          >
            <Text style={[styles.tabText, isActive ? styles.tabTextActive : styles.tabTextInactive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: COLORS.surfaceContainer,
    padding: 4,
    borderRadius: 9999,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9999,
  },
  tabActive: {
    backgroundColor: COLORS.primaryContainer,
    shadowColor: COLORS.primaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0.4,
    elevation: 4,
  },
  tabInactive: {
    backgroundColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist',
  },
  tabTextActive: {
    color: COLORS.onPrimary,
  },
  tabTextInactive: {
    color: COLORS.onSurfaceVariant,
  },
});