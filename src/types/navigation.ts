export type TabParamList = {
  pulse: undefined;
  people: undefined;
  create: undefined;
  spaces: undefined;
  you: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  Auth: undefined;
  ConversationDetail: { conversationId: string };
  SpaceDetail: { spaceId: string };
  Profile: { userId?: string };
  BranchDetail: { conversationId: string; branchId: string };
  Search: undefined;
};