import type { MessageStatus, User, Message, Conversation, Attachment, ConversationBranch } from '../index';

describe('MessageStatus type', () => {
  const validStatuses: MessageStatus[] = ['pending', 'sending', 'sent', 'delivered', 'seen', 'failed'];

  it('contains all expected states', () => {
    expect(validStatuses).toEqual([
      'pending',
      'sending',
      'sent',
      'delivered',
      'seen',
      'failed',
    ]);
  });

  it('has a complete transition set', () => {
    const transitions: Record<MessageStatus, MessageStatus[]> = {
      pending: ['sending', 'failed'],
      sending: ['sent', 'failed'],
      sent: ['delivered', 'failed'],
      delivered: ['seen', 'failed'],
      seen: ['failed'],
      failed: ['pending'],
    };
    expect(Object.keys(transitions).sort()).toEqual(validStatuses.sort());
  });
});

describe('User type shape', () => {
  it('creates a valid user', () => {
    const user: User = {
      id: 'user_1',
      username: 'operator',
      displayName: 'Operator',
      isVerified: false,
      createdAt: new Date().toISOString(),
    };
    expect(user.id).toBeTruthy();
    expect(user.username).toBeTruthy();
  });
});

describe('Message type shape', () => {
  it('creates a valid message', () => {
    const message: Message = {
      id: 'msg_1',
      conversationId: 'conv_1',
      senderId: 'user_1',
      content: 'hello',
      type: 'text',
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(message.type).toBe('text');
    expect(message.status).toBe('sent');
  });

  it('supports optional replyToMessageId and branchId', () => {
    const message: Message = {
      id: 'msg_1',
      conversationId: 'conv_1',
      senderId: 'user_1',
      content: 'reply',
      type: 'text',
      status: 'sent',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      replyToMessageId: 'msg_0',
      branchId: 'branch_1',
    };
    expect(message.replyToMessageId).toBe('msg_0');
    expect(message.branchId).toBe('branch_1');
  });
});

describe('Conversation type shape', () => {
  it('creates a valid direct conversation', () => {
    const conv: Conversation = {
      id: 'conv_1',
      type: 'direct',
      participantIds: ['user_1', 'user_2'],
      createdAt: new Date().toISOString(),
    };
    expect(conv.type).toBe('direct');
  });

  it('creates a valid group conversation', () => {
    const conv: Conversation = {
      id: 'conv_2',
      type: 'group',
      name: 'Design Team',
      participantIds: ['user_1', 'user_2', 'user_3'],
      createdAt: new Date().toISOString(),
    };
    expect(conv.name).toBe('Design Team');
  });
});

describe('Attachment type shape', () => {
  it('creates a valid image attachment', () => {
    const attachment: Attachment = {
      id: 'att_1',
      messageId: 'msg_1',
      uri: 'file:///image.jpg',
      type: 'image',
      mimeType: 'image/jpeg',
      size: 1024,
      name: 'image.jpg',
      uploadStatus: 'done',
    };
    expect(attachment.type).toBe('image');
    expect(attachment.uploadStatus).toBe('done');
  });
});

describe('ConversationBranch type shape', () => {
  it('creates a valid branch', () => {
    const branch: ConversationBranch = {
      id: 'branch_1',
      conversationId: 'conv_1',
      rootMessageId: 'msg_0',
      participantIds: ['user_1', 'user_2'],
      messageCount: 12,
      lastActivityAt: new Date().toISOString(),
      isPinned: false,
      createdAt: new Date().toISOString(),
    };
    expect(branch.messageCount).toBe(12);
    expect(branch.isPinned).toBe(false);
  });
});