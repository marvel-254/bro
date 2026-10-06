import { View, Text } from 'react-native';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/lib/auth-context';
import { COLORS } from '../src/theme';

function RedirectHandler() {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? '/(tabs)' : '/(auth)/welcome');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
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