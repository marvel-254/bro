import { View, Text } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { COLORS } from '@/theme';

function RedirectHandler() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) {
      router.replace(isSignedIn ? '/(tabs)' : '/(auth)/welcome');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.semantic.canvasRoot }}>
        <Text style={{ color: COLORS.onSurface }}>Loading...</Text>
      </View>
    );
  }

  return null;
}

export default function Index() {
  return <RedirectHandler />;
}