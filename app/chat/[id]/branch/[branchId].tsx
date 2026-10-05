import { useLocalSearchParams } from 'expo-router';
import BranchDetail from '../../../../src/features/conversations/BranchDetail';

/**
 * Branch route. The branch id alone is enough because the screen resolves its
 * own conversation for the back navigation, rather than trusting a second id
 * from the URL that could disagree with it.
 */
export default function BranchRoute() {
  const { branchId } = useLocalSearchParams<{ branchId: string }>();
  if (!branchId) return null;
  return <BranchDetail branchId={branchId} />;
}