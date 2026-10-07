import { Tabs, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/theme';

/**
 * The `+` is a raised center action, not a tab — it opens the Create screen
 * rather than switching to one. That matches docs/research/dashboard-layout-A.md.
 */
function CreateAction() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/create')}
      accessibilityRole="button"
      accessibilityLabel="Create"
      style={{ top: -14, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.primaryContainer,
        }}
      >
        <Ionicons name="add" size={26} color={COLORS.onPrimary} />
      </View>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.surfaceTint,
        tabBarInactiveTintColor: COLORS.semantic.textDim,
        tabBarStyle: {
          backgroundColor: COLORS.semantic.canvasRoot,
          borderTopColor: COLORS.semantic.ghostBorderLight,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarButton: () => <CreateAction />,
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'Bros',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
      {/* v1 nav is frozen at Home / Chats / Bros / Me. Spaces stays routable
          but hidden. Create sits between Chats and Bros as a raised `+` --
          a button rather than a tab, so it never reads as a fifth
          destination. Order below is the tab bar order: it follows the JSX. */}
      <Tabs.Screen name="spaces" options={{ href: null }} />
    </Tabs>
  );
}