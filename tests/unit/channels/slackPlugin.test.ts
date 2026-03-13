/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ==================== Mock Setup ====================

type MockControl = {
  startPromiseFactory: () => Promise<void>;
  authTestResult: { user_id: string; user: string };
};

const mockControl: MockControl = {
  startPromiseFactory: () => Promise.resolve(),
  authTestResult: { user_id: 'U123', user: 'slack_bot' },
};

let latestAppStopSpy: ReturnType<typeof vi.fn> | null = null;
let latestMessageHandler: ((args: any) => Promise<void>) | null = null;
let latestActionHandler: ((args: any) => Promise<void>) | null = null;

function createConfig() {
  const now = Date.now();
  return {
    id: 'slack-1',
    type: 'slack' as const,
    name: 'Slack',
    enabled: true,
    credentials: { botToken: 'xoxb-test-token', appToken: 'xapp-test-token' },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadPluginClass() {
  vi.resetModules();

  vi.doMock('@slack/bolt', () => {
    class MockApp {
      public client = {
        auth: {
          test: vi.fn(async () => mockControl.authTestResult),
        },
        chat: {
          postMessage: vi.fn(async () => ({ ts: '1234567890.123456' })),
          update: vi.fn(async () => ({})),
        },
      };

      private messageHandlers: Array<(args: any) => Promise<void>> = [];
      private actionHandlers: Array<{ pattern: RegExp; handler: (args: any) => Promise<void> }> = [];

      public message = vi.fn((handler: (args: any) => Promise<void>) => {
        this.messageHandlers.push(handler);
        latestMessageHandler = handler;
      });

      public action = vi.fn((pattern: RegExp, handler: (args: any) => Promise<void>) => {
        this.actionHandlers.push({ pattern, handler });
        latestActionHandler = handler;
      });

      public start = vi.fn(() => mockControl.startPromiseFactory());

      public stop = vi.fn(async () => {});

      constructor(_options: any) {
        latestAppStopSpy = this.stop;
      }
    }

    return { App: MockApp };
  });

  vi.doMock('@slack/web-api', () => {
    class MockWebClient {
      public auth = {
        test: vi.fn(async () => mockControl.authTestResult),
      };

      constructor(_token: string) {}
    }

    return { WebClient: MockWebClient };
  });

  const mod = await import('@/channels/plugins/slack/SlackPlugin');
  return mod.SlackPlugin;
}

// ==================== Adapter Tests ====================

describe('SlackAdapter', () => {
  describe('buildSlackChatId / parseSlackChatId', () => {
    it('should round-trip encode/decode chatId', async () => {
      const { buildSlackChatId, parseSlackChatId } = await import('@/channels/plugins/slack/SlackAdapter');

      const chatId = buildSlackChatId('C12345', '1234567890.123456');
      expect(chatId).toBe('C12345:1234567890.123456');

      const parsed = parseSlackChatId(chatId);
      expect(parsed.channel).toBe('C12345');
      expect(parsed.threadTs).toBe('1234567890.123456');
    });

    it('should handle chatId without thread_ts', async () => {
      const { parseSlackChatId } = await import('@/channels/plugins/slack/SlackAdapter');

      const parsed = parseSlackChatId('C12345');
      expect(parsed.channel).toBe('C12345');
      expect(parsed.threadTs).toBe('');
    });
  });

  describe('convertHtmlToSlackMarkdown', () => {
    it('should convert bold tags', async () => {
      const { convertHtmlToSlackMarkdown } = await import('@/channels/plugins/slack/SlackAdapter');
      expect(convertHtmlToSlackMarkdown('<b>bold</b>')).toBe('*bold*');
      expect(convertHtmlToSlackMarkdown('<strong>strong</strong>')).toBe('*strong*');
    });

    it('should convert italic tags', async () => {
      const { convertHtmlToSlackMarkdown } = await import('@/channels/plugins/slack/SlackAdapter');
      expect(convertHtmlToSlackMarkdown('<i>italic</i>')).toBe('_italic_');
      expect(convertHtmlToSlackMarkdown('<em>emphasis</em>')).toBe('_emphasis_');
    });

    it('should convert code tags', async () => {
      const { convertHtmlToSlackMarkdown } = await import('@/channels/plugins/slack/SlackAdapter');
      expect(convertHtmlToSlackMarkdown('<code>code</code>')).toBe('`code`');
    });

    it('should convert links', async () => {
      const { convertHtmlToSlackMarkdown } = await import('@/channels/plugins/slack/SlackAdapter');
      expect(convertHtmlToSlackMarkdown('<a href="https://example.com">link</a>')).toBe('<https://example.com|link>');
    });

    it('should decode HTML entities', async () => {
      const { convertHtmlToSlackMarkdown } = await import('@/channels/plugins/slack/SlackAdapter');
      expect(convertHtmlToSlackMarkdown('&amp; &lt; &gt;')).toBe('& < >');
    });
  });

  describe('splitMessage', () => {
    it('should not split short messages', async () => {
      const { splitMessage } = await import('@/channels/plugins/slack/SlackAdapter');
      const chunks = splitMessage('Hello world', 100);
      expect(chunks).toEqual(['Hello world']);
    });

    it('should split long messages at newlines', async () => {
      const { splitMessage } = await import('@/channels/plugins/slack/SlackAdapter');
      const text = 'line1\nline2\nline3\nline4';
      const chunks = splitMessage(text, 12);
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.join('\n')).toContain('line1');
    });
  });
});

// ==================== SlackBlocks Tests ====================

describe('SlackBlocks', () => {
  it('should create tool confirmation blocks with correct action_ids', async () => {
    const { createToolConfirmationBlocks } = await import('@/channels/plugins/slack/SlackBlocks');

    const blocks = createToolConfirmationBlocks('call123', [
      { label: 'Allow', value: 'proceed_once' },
      { label: 'Cancel', value: 'cancel' },
    ]);

    const actionsBlock = blocks.find((b) => b.type === 'actions') as any;
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.elements).toHaveLength(2);
    expect(actionsBlock.elements[0].action_id).toBe('confirm:call123:proceed_once');
    expect(actionsBlock.elements[1].action_id).toBe('confirm:call123:cancel');
    expect(actionsBlock.elements[1].style).toBe('danger');
  });

  it('should create main menu blocks', async () => {
    const { createMainMenuBlocks } = await import('@/channels/plugins/slack/SlackBlocks');

    const blocks = createMainMenuBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('actions');
  });

  it('should extract action from block action', async () => {
    const { extractActionFromBlockAction } = await import('@/channels/plugins/slack/SlackBlocks');

    const result = extractActionFromBlockAction('confirm:call123:proceed_once');
    expect(result.category).toBe('confirm');
    expect(result.action).toBe('call123');
    expect(result.params).toBe('proceed_once');
  });
});

// ==================== SlackPlugin Tests ====================

describe('SlackPlugin lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestAppStopSpy = null;
    latestMessageHandler = null;
    latestActionHandler = null;
    mockControl.startPromiseFactory = () => Promise.resolve();
    mockControl.authTestResult = { user_id: 'U123', user: 'slack_bot' };
  });

  it('should require botToken and appToken for initialization', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    const configWithoutCreds = {
      ...createConfig(),
      credentials: {},
    };

    await expect(plugin.initialize(configWithoutCreds)).rejects.toThrow('Slack Bot Token and App Token are required');
  });

  it('should initialize and start successfully', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    await plugin.initialize(createConfig());
    expect(plugin.status).toBe('ready');

    await plugin.start();
    expect(plugin.status).toBe('running');

    const botInfo = plugin.getBotInfo();
    expect(botInfo).toBeDefined();
    expect(botInfo?.username).toBe('slack_bot');
  });

  it('should stop and cleanup', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    await plugin.initialize(createConfig());
    await plugin.start();
    expect(plugin.status).toBe('running');

    await plugin.stop();
    expect(plugin.status).toBe('stopped');
    expect(latestAppStopSpy).toHaveBeenCalledTimes(1);
    expect(plugin.getBotInfo()).toBeNull();
    expect(plugin.getActiveUserCount()).toBe(0);
  });

  it('should send message to correct channel with thread_ts', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    await plugin.initialize(createConfig());
    await plugin.start();

    const msgId = await plugin.sendMessage('C12345:1234567890.123456', {
      type: 'text',
      text: 'Hello from test',
      parseMode: 'HTML',
    });

    expect(msgId).toBe('1234567890.123456');
  });

  it('should edit message and ignore not_modified errors', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    await plugin.initialize(createConfig());
    await plugin.start();

    // Normal edit
    await plugin.editMessage('C12345:1234567890.123456', '1234567890.123456', {
      type: 'text',
      text: 'Updated message',
      parseMode: 'HTML',
    });

    // Simulate not_modified error - should not throw
    const app = (plugin as any).app;
    app.client.chat.update.mockRejectedValueOnce({
      data: { error: 'message_not_modified' },
    });

    await expect(
      plugin.editMessage('C12345:1234567890.123456', '1234567890.123456', {
        type: 'text',
        text: 'Same message',
        parseMode: 'HTML',
      })
    ).resolves.toBeUndefined();
  });

  it('should skip edit for empty text', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    await plugin.initialize(createConfig());
    await plugin.start();

    await plugin.editMessage('C12345:1234567890.123456', '1234567890.123456', {
      type: 'text',
      text: '   ',
      parseMode: 'HTML',
    });

    const app = (plugin as any).app;
    expect(app.client.chat.update).not.toHaveBeenCalled();
  });

  it('should test connection successfully', async () => {
    const SlackPlugin = await loadPluginClass();
    const result = await SlackPlugin.testConnection('xoxb-test-token');

    expect(result.success).toBe(true);
    expect(result.botInfo?.name).toBe('slack_bot');
  });
});

// ==================== Tool Confirmation Flow ====================

describe('SlackPlugin tool confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestAppStopSpy = null;
    latestMessageHandler = null;
    latestActionHandler = null;
    mockControl.startPromiseFactory = () => Promise.resolve();
    mockControl.authTestResult = { user_id: 'U123', user: 'slack_bot' };
  });

  it('should call confirmHandler on confirm button click', async () => {
    const SlackPlugin = await loadPluginClass();
    const plugin = new SlackPlugin();

    const confirmSpy = vi.fn(async () => {});
    plugin.onConfirm(confirmSpy);

    await plugin.initialize(createConfig());
    await plugin.start();

    // Simulate confirm button action
    expect(latestActionHandler).toBeDefined();
    await latestActionHandler!({
      action: { type: 'button', action_id: 'confirm:call123:proceed_once' },
      body: {
        user: { id: 'U456' },
        channel: { id: 'C12345' },
        message: { ts: '1234567890.123456', text: 'Confirm?' },
      },
      ack: vi.fn(),
    });

    // Give async handlers time to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(confirmSpy).toHaveBeenCalledWith('U456', 'slack', 'call123', 'proceed_once', 'C12345:1234567890.123456');
  });
});
