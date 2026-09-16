import { router } from 'expo-router';
import { TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme';

export default function ScreenHeader({ title, showBack = false, onBack }: { title: string; showBack?: boolean; onBack?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 }}>
      {showBack && (
        <TouchableOpacity onPress={onBack || (() => router.back())}>
          <Ionicons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.onSurface, fontSize: 18, fontWeight: '700' }}>{title}</Text>
      </View>
    </View>
  );
}
