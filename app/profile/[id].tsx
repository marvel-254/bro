import { useLocalSearchParams } from "expo-router";
import ProfileScreen from "../../src/features/profile/ProfileScreen";

export default function ProfileRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <ProfileScreen userId={id} />;
}
