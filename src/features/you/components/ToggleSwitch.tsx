import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { COLORS } from '../../../theme';

interface ToggleSwitchProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
}

export function ToggleSwitch({ label, value, onValueChange, description }: ToggleSwitchProps) {
  const [anim] = useState(new Animated.Value(value ? 1 : 0));

  const handlePress = () => {
    const next = !value;
    Animated.timing(anim, {
      toValue: next ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    onValueChange(next);
  };

  const trackX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  const thumbScale = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.15],
  });

  const glowOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.6],
  });

  const thumbColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.onSurfaceVariant, COLORS.tertiaryContainer],
  });

  const trackBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.08)', 'rgba(0, 249, 132, 0.25)'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <TouchableOpacity activeOpacity={0.8} onPress={handlePress}>
        <Animated.View style={[styles.track, { backgroundColor: trackBg }]}>
          <Animated.View
            style={[
              styles.glow,
              { transform: [{ translateX: trackX }], opacity: glowOpacity },
            ]}
          />
          <Animated.View
            style={[
              styles.thumb,
              { transform: [{ scale: thumbScale }], backgroundColor: thumbColor },
            ]}
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surfaceContainer,
    borderRadius: 9999,
    marginBottom: 10,
  },
  info: {
    flex: 1,
    marginRight: 16,
  },
  label: {
    color: COLORS.onSurface,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist',
  },
  description: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'Geist',
  },
  track: {
    width: 52,
    height: 28,
    borderRadius: 9999,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: COLORS.tertiaryContainer,
    left: 2,
  },
  thumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 9999,
    shadowColor: COLORS.tertiaryContainer,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.9,
    elevation: 4,
  },
});