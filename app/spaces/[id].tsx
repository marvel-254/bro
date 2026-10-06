import { useLocalSearchParams } from 'expo-router';
import SpaceDetail from '../../src/features/spaces/SpaceDetail';

export default function SpaceDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id) return null;
  return <SpaceDetail spaceId={id} />;
}