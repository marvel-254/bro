export type MessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  status?: 'online' | 'offline' | 'away';
  isVerified: boolean;
  createdAt: string;
}

export interface Conversation {
  id: string;
  type: 'direct' | 'group' | 'space' | 'live';
  name?: string;
  avatar?: string;
  participantIds: string[];
  lastMessageAt?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  spaceId?: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'voice';
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
  replyToMessageId?: string;
  branchId?: string;
  attachments?: Attachment[];
}

export interface ConversationBranch {
  id: string;
  conversationId: string;
  rootMessageId: string;
  participantIds: string[];
  messageCount: number;
  lastActivityAt: string;
  isPinned: boolean;
  createdAt: string;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  messageId: string;
  uri: string;
  type: 'image' | 'file' | 'video' | 'audio';
  mimeType: string;
  size: number;
  name: string;
  uploadStatus: 'pending' | 'uploading' | 'done' | 'failed';
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatar?: string;
  ownerId: string;
  memberIds: string[];
  conversationIds: string[];
  isPublic: boolean;
  createdAt: string;
}

export interface Activity {
  id: string;
  type: 'reply' | 'mention' | 'reaction' | 'join' | 'invite' | 'follow';
  actorId: string;
  targetId?: string;
  targetType?: 'conversation' | 'message' | 'space' | 'user';
  createdAt: string;
  isRead: boolean;
}

export interface Notification {
  id: string;
  activityId: string;
  userId: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  deepLink?: string;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  joinedAt: string;
  role: 'admin' | 'member';
  isMuted: boolean;
}

export interface SpaceMember {
  spaceId: string;
  userId: string;
  joinedAt: string;
  role: 'owner' | 'admin' | 'member';
}

export interface BlockedUser {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export interface SavedMessage {
  id: string;
  userId: string;
  messageId: string;
  createdAt: string;
}
