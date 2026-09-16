import { COLORS } from '@/theme';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { ClerkProvider } from '@clerk/clerk-expo';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <View style={{ flex: 1, backgroundColor: COLORS.semantic.canvasRoot }}>
        <StatusBar style="light" />
        {children}
      </View>
    </ClerkProvider>
  );
}