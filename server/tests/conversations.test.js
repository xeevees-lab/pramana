import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { query } from '../src/db/pool.js';
import { generateConversationTitle } from '../src/routes/ask.js';

const testUid1 = 'conv-test-uid-1-' + Date.now();
const testUid2 = 'conv-test-uid-2-' + Date.now();

// Mock verifyIdToken to support two distinct authenticated users
vi.mock('../src/plugins/firebase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isInitialized: () => true,
    verifyIdToken: async (token) => {
      if (token === 'user-1-token') {
        return { uid: testUid1, email: 'user1@pramana.local', name: 'User One' };
      }
      if (token === 'user-2-token') {
        return { uid: testUid2, email: 'user2@pramana.local', name: 'User Two' };
      }
      return null;
    },
  };
});

const { buildApp } = await import('../src/app.js');

describe('In-Ask Conversation History & Authorization Tests', () => {
  let app;
  let user1Id;
  let user2Id;

  beforeAll(async () => {
    app = await buildApp({ logger: false });

    // Seed test user 1
    const { rows: u1 } = await query(
      `INSERT INTO users (firebase_uid, email, display_name)
       VALUES ($1, 'user1@pramana.local', 'User One')
       RETURNING id`,
      [testUid1]
    );
    user1Id = u1[0].id;

    // Seed test user 2
    const { rows: u2 } = await query(
      `INSERT INTO users (firebase_uid, email, display_name)
       VALUES ($1, 'user2@pramana.local', 'User Two')
       RETURNING id`,
      [testUid2]
    );
    user2Id = u2[0].id;
  });

  afterAll(async () => {
    if (user1Id) await query('DELETE FROM users WHERE id = $1', [user1Id]);
    if (user2Id) await query('DELETE FROM users WHERE id = $1', [user2Id]);
    await app.close();
  });

  describe('Deterministic Title Generation', () => {
    it('normalizes common question preambles into clean titles', () => {
      expect(generateConversationTitle('What happened with the Nepal floods?')).toBe('Nepal floods');
      expect(generateConversationTitle('What is happening with European energy policy?')).toBe('European energy policy');
      expect(generateConversationTitle('How did US tariffs affect global manufacturing?')).toBe('US tariffs affect global manufacturing');
      expect(generateConversationTitle('Why did the dam collapse in the monsoon?')).toBe('Dam collapse in the monsoon');
      expect(generateConversationTitle('')).toBe('New Research Chat');
    });
  });

  describe('Unauthenticated Access Rejection', () => {
    it('GET /api/ask/conversations rejects unauthenticated callers with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/ask/conversations',
      });
      expect(res.statusCode).toBe(401);
    });

    it('POST /api/ask/conversations rejects unauthenticated callers with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/conversations',
        payload: { title: 'Secret Research' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Conversation Lifecycle & Strict Ownership Security', () => {
    let convId;

    it('creates a new conversation for User 1', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/ask/conversations',
        headers: { authorization: 'Bearer user-1-token' },
        payload: {
          title: 'Nepal Floods Analysis',
          mode: 'ask',
          topic_context: { primaryTopic: 'Nepal Floods' },
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.id).toBeDefined();
      expect(data.title).toBe('Nepal Floods Analysis');
      expect(data.user_id).toBe(user1Id);
      convId = data.id;
    });

    it('lists conversations for User 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/ask/conversations',
        headers: { authorization: 'Bearer user-1-token' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(Array.isArray(data.conversations)).toBe(true);
      expect(data.conversations.some(c => c.id === convId)).toBe(true);
    });

    it('User 2 CANNOT access User 1 conversation (404/Access Denied)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/ask/conversations/${convId}`,
        headers: { authorization: 'Bearer user-2-token' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Not Found');
    });

    it('User 2 CANNOT delete User 1 conversation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/ask/conversations/${convId}`,
        headers: { authorization: 'Bearer user-2-token' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('User 1 can fetch conversation messages', async () => {
      // Seed a test message
      await query(
        `INSERT INTO conversation_messages (conversation_id, role, content)
         VALUES ($1, 'user', 'What caused the flood?')`,
        [convId]
      );

      const res = await app.inject({
        method: 'GET',
        url: `/api/ask/conversations/${convId}`,
        headers: { authorization: 'Bearer user-1-token' },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.conversation.id).toBe(convId);
      expect(data.messages.length).toBe(1);
      expect(data.messages[0].content).toBe('What caused the flood?');
    });

    it('User 1 can successfully delete their conversation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/ask/conversations/${convId}`,
        headers: { authorization: 'Bearer user-1-token' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);

      // Verify cascade deletion of messages
      const { rows } = await query(
        `SELECT id FROM conversation_messages WHERE conversation_id = $1`,
        [convId]
      );
      expect(rows.length).toBe(0);
    });
  });
});
