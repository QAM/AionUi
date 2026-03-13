/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { App } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import type { BotInfo, IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { buildSlackChatId, convertHtmlToSlackMarkdown, extractAction, extractCategory, parseSlackChatId, SLACK_MESSAGE_LIMIT, splitMessage, toSlackSendParams, toUnifiedIncomingMessage } from './SlackAdapter';
import { extractActionFromBlockAction } from './SlackBlocks';

/**
 * SlackPlugin - Slack integration for Channel system
 *
 * Uses @slack/bolt with Socket Mode (WebSocket, no public URL needed).
 * Thread-based session isolation: each Slack thread = one conversation session.
 */
export class SlackPlugin extends BasePlugin {
  readonly type: PluginType = 'slack';

  private app: App | null = null;
  private botUserId: string | null = null;
  private botUsername: string | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private readonly baseReconnectDelay: number = 1000;

  private activeUsers: Set<string> = new Set();

  /**
   * Initialize the Slack app instance
   */
  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const botToken = config.credentials?.botToken as string | undefined;
    const appToken = config.credentials?.appToken as string | undefined;

    if (!botToken || !appToken) {
      throw new Error('Slack Bot Token and App Token are required');
    }

    // Create Bolt app with Socket Mode
    this.app = new App({
      token: botToken,
      appToken,
      socketMode: true,
    });

    this.setupHandlers();
  }

  /**
   * Start Socket Mode connection
   */
  protected async onStart(): Promise<void> {
    if (!this.app) {
      throw new Error('App not initialized');
    }

    try {
      // Validate token and get bot info
      const authResult = await this.app.client.auth.test();
      this.botUserId = authResult.user_id || null;
      this.botUsername = authResult.user || null;

      // Start Socket Mode
      await this.app.start();

      this.reconnectAttempts = 0;
      console.log(`[SlackPlugin] Connected as @${this.botUsername}`);
    } catch (error) {
      console.error('[SlackPlugin] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop and cleanup
   */
  protected async onStop(): Promise<void> {
    try {
      await this.app?.stop();
    } catch (error) {
      console.error('[SlackPlugin] Error stopping app:', error);
    }

    this.app = null;
    this.botUserId = null;
    this.botUsername = null;
    this.activeUsers.clear();
    this.reconnectAttempts = 0;

    console.log('[SlackPlugin] Stopped and cleaned up');
  }

  /**
   * Get active user count
   */
  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  /**
   * Get bot information
   */
  getBotInfo(): BotInfo | null {
    if (!this.botUserId) return null;
    return {
      id: this.botUserId,
      username: this.botUsername || undefined,
      displayName: this.botUsername || 'Slack Bot',
    };
  }

  /**
   * Send a message to a Slack channel/thread
   */
  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    if (!this.app) {
      throw new Error('App not initialized');
    }

    const { channel, threadTs } = parseSlackChatId(chatId);

    // Convert HTML to Slack mrkdwn if parseMode is HTML
    const slackMessage = { ...message };
    if (message.parseMode === 'HTML' && message.text) {
      slackMessage.text = convertHtmlToSlackMarkdown(message.text);
    }

    const params = toSlackSendParams(slackMessage, channel, threadTs);
    const chunks = splitMessage(params.text, SLACK_MESSAGE_LIMIT);
    let lastTs = '';

    for (let i = 0; i < chunks.length; i++) {
      const isLastChunk = i === chunks.length - 1;
      try {
        const result = await this.app.client.chat.postMessage({
          channel: params.channel,
          text: chunks[i],
          thread_ts: params.thread_ts,
          blocks: isLastChunk ? (params.blocks as any) : undefined,
          mrkdwn: true,
        });
        lastTs = result.ts || '';
      } catch (error) {
        console.error(`[SlackPlugin] Failed to send message chunk ${i + 1}/${chunks.length}:`, error);
        throw error;
      }
    }

    return lastTs;
  }

  /**
   * Edit an existing message
   */
  async editMessage(chatId: string, messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    if (!this.app) {
      throw new Error('App not initialized');
    }

    const { channel } = parseSlackChatId(chatId);

    // Convert HTML to Slack mrkdwn if parseMode is HTML
    let text = message.text || '';
    if (message.parseMode === 'HTML') {
      text = convertHtmlToSlackMarkdown(text);
    }

    // Truncate if too long
    if (text.length > SLACK_MESSAGE_LIMIT) {
      text = text.slice(0, SLACK_MESSAGE_LIMIT - 3) + '...';
    }

    // Skip edit if text is empty
    if (!text.trim()) {
      return;
    }

    try {
      await this.app.client.chat.update({
        channel,
        ts: messageId,
        text,
        blocks: message.replyMarkup && Array.isArray(message.replyMarkup) ? (message.replyMarkup as any) : undefined,
      });
    } catch (error: any) {
      // Ignore "message_not_modified" errors
      const errorMessage = error?.data?.error || error?.message || '';
      if (errorMessage.includes('message_not_modified')) {
        return;
      }
      console.error('[SlackPlugin] Failed to edit message:', error);
      throw error;
    }
  }

  /**
   * Upload a file to a Slack channel/thread
   */
  async uploadFile(chatId: string, content: string, filename: string, title?: string): Promise<void> {
    if (!this.app) {
      throw new Error('App not initialized');
    }

    const { channel, threadTs } = parseSlackChatId(chatId);

    try {
      await this.app.client.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs || undefined,
        content,
        filename,
        title: title || filename,
      });
    } catch (error) {
      console.error('[SlackPlugin] Failed to upload file:', error);
      throw error;
    }
  }

  /**
   * Setup message and action handlers
   */
  private setupHandlers(): void {
    if (!this.app) return;

    // Handle incoming messages
    this.app.message(async ({ message }) => {
      console.log('[SlackPlugin] Received message event:', JSON.stringify(message).slice(0, 200));

      // Only handle basic messages (not bot messages, not subtypes)
      if ('subtype' in message && message.subtype) {
        console.log('[SlackPlugin] Skipping message with subtype:', (message as any).subtype);
        return;
      }

      const userId = 'user' in message ? (message.user as string) : undefined;
      if (!userId) {
        console.log('[SlackPlugin] Skipping message with no user');
        return;
      }

      // Ignore bot's own messages
      if (userId === this.botUserId) return;

      this.activeUsers.add(userId);

      const unifiedMessage = toUnifiedIncomingMessage(message as any);
      console.log('[SlackPlugin] Unified message:', unifiedMessage ? 'OK' : 'null', 'messageHandler:', !!this.messageHandler);

      if (unifiedMessage && this.messageHandler) {
        void this.messageHandler(unifiedMessage).catch((error) => {
          console.error(`[SlackPlugin] Message handler failed:`, error);
        });
      } else {
        console.warn('[SlackPlugin] Message dropped - unifiedMessage:', !!unifiedMessage, 'messageHandler:', !!this.messageHandler);
      }
    });

    // Handle Block Kit button actions
    this.app.action(/^(confirm|agent|action|session|pairing|help):/, async ({ action, body, ack }) => {
      await ack();
      console.log('[SlackPlugin] Action received:', action.type, 'action_id' in action ? action.action_id : 'no-id');

      if (action.type !== 'button') return;

      const actionId = 'action_id' in action ? action.action_id : '';
      const userId = body.user?.id;
      if (!userId) return;

      this.activeUsers.add(userId);

      const { category } = extractActionFromBlockAction(actionId);
      console.log('[SlackPlugin] Action category:', category, 'actionId:', actionId, 'confirmHandler:', !!this.confirmHandler);

      // Handle tool confirmation directly
      if (category === 'confirm') {
        const parts = actionId.split(':');
        console.log('[SlackPlugin] Confirm action parts:', parts, 'has handler:', !!this.confirmHandler);
        if (parts.length >= 3 && this.confirmHandler) {
          const callId = parts[1];
          const value = parts.slice(2).join(':');
          // Build chatId from button click context for thread-scoped session lookup
          const confirmChannelId = body.channel?.id;
          const confirmMessageTs = 'message' in body ? (body.message as any)?.ts : undefined;
          const confirmThreadTs = 'message' in body ? (body.message as any)?.thread_ts : confirmMessageTs;
          const confirmChatId = confirmChannelId ? buildSlackChatId(confirmChannelId, confirmThreadTs || confirmMessageTs || '') : undefined;
          console.log('[SlackPlugin] Confirm chatId:', confirmChatId, 'callId:', callId, 'value:', value);
          void this.confirmHandler(userId, 'slack', callId, value, confirmChatId)
            .then(async () => {
              // Remove buttons after confirmation by updating the message
              try {
                if ('message' in body && body.message && body.channel?.id) {
                  await this.app?.client.chat.update({
                    channel: body.channel.id,
                    ts: (body.message as any).ts,
                    text: (body.message as any).text || 'Confirmed',
                    blocks: [],
                  });
                }
              } catch (editError) {
                console.debug('[SlackPlugin] Failed to remove buttons (ignored):', editError);
              }
            })
            .catch((error) => console.error('[SlackPlugin] Error handling confirm callback:', error));
        }
        return;
      }

      // Handle agent selection
      if (category === 'agent') {
        const agentType = extractAction(actionId);
        const channelId = body.channel?.id;
        const messageTs = 'message' in body ? (body.message as any)?.ts : undefined;
        const threadTs = 'message' in body ? (body.message as any)?.thread_ts : messageTs;

        if (channelId && this.messageHandler) {
          const { buildSlackChatId } = await import('./SlackAdapter');
          const chatId = buildSlackChatId(channelId, threadTs || messageTs || '');
          const unifiedMessage = {
            id: messageTs || Date.now().toString(),
            platform: 'slack' as const,
            chatId,
            user: { id: userId, displayName: `User ${userId}` },
            content: { type: 'action' as const, text: 'agent.select' },
            timestamp: Date.now(),
            action: {
              type: 'system' as const,
              name: 'agent.select',
              params: { agentType },
            },
          };

          void this.messageHandler(unifiedMessage).catch((error) => console.error('[SlackPlugin] Error handling agent selection:', error));
        }
        return;
      }

      // Handle other button actions
      const channelId = body.channel?.id;
      const messageTs = 'message' in body ? (body.message as any)?.ts : undefined;
      const threadTs = 'message' in body ? (body.message as any)?.thread_ts : messageTs;

      if (channelId && this.messageHandler) {
        const { buildSlackChatId } = await import('./SlackAdapter');
        const chatId = buildSlackChatId(channelId, threadTs || messageTs || '');

        const extractedCategory = extractCategory(actionId);
        const extractedAction = extractAction(actionId);
        const actionName = extractedCategory === 'action' ? extractedAction : `${extractedCategory}.${extractedAction}`;

        // Extract params from action value and action_id extra segments
        const actionParams: Record<string, string> = {};
        const buttonValue = 'value' in action ? (action as any).value : undefined;
        if (buttonValue) actionParams.value = buttonValue;
        // Parse extra key=value from action_id (e.g., 'action:cron.delete:jobId=xxx' or 'action:cron.reschedule.confirm:jobId=xxx&presetKey=yyy')
        const actionIdParts = actionId.split(':');
        if (actionIdParts.length > 2) {
          for (const part of actionIdParts.slice(2)) {
            // Support both ':' and '&' as separators between key=value pairs
            const subParts = part.split('&');
            for (const subPart of subParts) {
              const eqIdx = subPart.indexOf('=');
              if (eqIdx > 0) actionParams[subPart.slice(0, eqIdx)] = subPart.slice(eqIdx + 1);
            }
          }
        }
        // Map 'value' to known param names for cron actions
        if (actionName === 'cron.create.schedule' && buttonValue && !actionParams.presetKey) {
          actionParams.presetKey = buttonValue;
        }
        if (actionName === 'cron.delete' && buttonValue && !actionParams.jobId) {
          actionParams.jobId = buttonValue;
        }

        const unifiedMessage = {
          id: messageTs || Date.now().toString(),
          platform: 'slack' as const,
          chatId,
          user: { id: userId, displayName: `User ${userId}` },
          content: { type: 'action' as const, text: actionName },
          timestamp: Date.now(),
          action: {
            type: (extractedCategory === 'pairing' ? 'platform' : extractedCategory === 'action' || extractedCategory === 'session' ? 'system' : 'chat') as any,
            name: actionName,
            params: Object.keys(actionParams).length > 0 ? actionParams : undefined,
          },
        };

        void this.messageHandler(unifiedMessage).catch((error) => console.error('[SlackPlugin] Error handling block action:', error));
      }
    });
  }

  /**
   * Test connection with tokens.
   * Used by Settings UI to validate before saving.
   */
  static async testConnection(botToken: string, appToken?: string): Promise<{ success: boolean; botInfo?: { name?: string }; error?: string }> {
    try {
      const client = new WebClient(botToken);
      const result = await client.auth.test();

      return {
        success: true,
        botInfo: {
          name: result.user || undefined,
        },
      };
    } catch (error: any) {
      let errorMessage = 'Connection failed';

      if (error?.data?.error === 'invalid_auth' || error?.data?.error === 'not_authed') {
        errorMessage = 'Invalid bot token';
      } else if (error?.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}
