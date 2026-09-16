import { View, Text } from 'react-native';
import { Tab, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/theme';

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="pulse" size={22} color={focused ? COLORS.primaryContainer : color} />
          ),
          tabBarLabel: 'Pulse',
        }}
      />
      <Tabs.Screen
        name="people"
        options={{
          title: 'People',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="people" size={22} color={focused ? COLORS.primaryContainer : color} />
          ),
          tabBarLabel: 'People',
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: () => (
            <Ionicons name="add-circle" size={28} color={COLORS.primaryContainer} />
          ),
          tabBarLabel: '',
        }}
      />
      <Tabs.Screen
        name="spaces"
        options={{
          title: 'Spaces',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="chatbubble-ellipses" size={22} color={focused ? COLORS.primaryContainer : color} />
          ),
          tabBarLabel: 'Spaces',
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name="person" size={22} color={focused ? COLORS.primaryContainer : color} />
          ),
          tabBarLabel: 'You',
        }}
      />
    </Tabs>
  );
}