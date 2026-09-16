import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../theme';

interface AvatarProps {
  uri?: string;
  name?: string;
  size?: number;
  status?: 'online' | 'offline' | 'away';
  style?: object;
}

export function Avatar({ uri, name, size = 40, status, style }: AvatarProps) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, style]}>
      {uri ? (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.text, { fontSize: size * 0.35, color: COLORS.onSurface }]}>
            {initials}
          </Text>
        </View>
      ) : (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={[styles.text, { fontSize: size * 0.35, color: COLORS.onSurface }]}>
            {initials}
          </Text>
        </View>
      )}
      {status && (
        <View
          style={[
            styles.status,
            {
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: size * 0.1,
              backgroundColor:
                status === 'online' ? COLORS.tertiaryContainer : COLORS.outlineVariant,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  text: {
    fontWeight: '600',
  },
  status: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
});