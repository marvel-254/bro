import { COLORS } from '../src/theme';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../src/lib/auth-context';
import { PresenceProvider } from '../src/lib/presence-context';
import { PeopleProvider } from '../src/lib/people-context';
import { ActivityBadgeProvider } from '../src/lib/activity-badge-context';
import { CallProvider } from '../src/lib/call-context';
import IncomingCallOverlay from '../src/features/calls/IncomingCallOverlay';
import { InviteProvider } from '../src/lib/invite-context';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from '../src/components/feedback/ErrorBoundary';

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
      {/* Outermost on purpose: a throw inside any provider below would
          otherwise take the whole tree down and render nothing at all. */}
      <ErrorBoundary>
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
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}