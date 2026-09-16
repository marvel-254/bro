import { View, Text } from 'react-native';

export default function CreateScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#090A0F' }}>
      <Text style={{ color: '#F2F5F9', fontSize: 18, fontWeight: '600' }}>Create</Text>
    </View>
  );
}