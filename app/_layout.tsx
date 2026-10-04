import { COLORS } from '@/theme';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { PresenceProvider } from '@/lib/presence-context';
import { PeopleProvider } from '@/lib/people-context';
import { ActivityBadgeProvider } from '@/lib/activity-badge-context';
import { CallProvider } from '@/lib/call-context';
import IncomingCallOverlay from '@/features/calls/IncomingCallOverlay';
import { InviteProvider } from '@/lib/invite-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

function AppProviders({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <PresenceProvider user={user}>
      <PeopleProvider userId={user?.id ?? null}>
        <ActivityBadgeProvider userId={user?.id ?? null}>
          <CallProvider userId={user?.id ?? null}>
            {children}
            <IncomingCallOverlay />
          </CallProvider>
        </ActivityBadgeProvider>
      </PeopleProvider>
    </PresenceProvider>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <InviteProvider>
          <AuthProvider>
            <AppProviders>
              <View style={{ flex: 1, backgroundColor: COLORS.semantic.canvasRoot }}>
                <StatusBar style="light" />
                {children}
              </View>
            </AppProviders>
          </AuthProvider>
        </InviteProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}