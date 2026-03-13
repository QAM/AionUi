/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { KnownEventFromType } from '@slack/bolt';
import type { IUnifiedIncomingMessage, IUnifiedMessageContent, IUnifiedOutgoingMessage, IUnifiedUser } from '../../types';

/**
 * SlackAdapter - Converts between Slack and Unified message formats
 *
 * Handles:
 * - Slack Message Event → UnifiedIncomingMessage
 * - UnifiedOutgoingMessage → Slack chat.postMessage parameters
 * - Thread-based session isolation via composite chatId
 * - HTML → Slack mrkdwn conversion
 */

// ==================== Chat ID Encoding ====================

/**
 * Build a composite chatId from Slack channel and thread_ts.
 * Format: `{channel}:{thread_ts}`
 * This enables per-thread session isolation via SessionManager.buildKey().
 */
export function buildSlackChatId(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

/**
 * Parse a composite chatId back into channel and thread_ts.
 */
export function parseSlackChatId(chatId: string): { channel: string; threadTs: string } {
  const colonIndex = chatId.indexOf(':');
  if (colonIndex === -1) {
    return { channel: chatId, threadTs: '' };
  }
  return {
    channel: chatId.slice(0, colonIndex),
    threadTs: chatId.slice(colonIndex + 1),
  };
}

// ==================== Incoming Message Conversion ====================

/**
 * Convert Slack message event to unified incoming message.
 * Uses `channel:thread_ts` as chatId for thread-based session isolation.
 */
export function toUnifiedIncomingMessage(event: KnownEventFromType<'message'>): IUnifiedIncomingMessage | null {
  // Only handle basic messages (no subtypes like message_changed, bot_message, etc.)
  if ('subtype' in event && event.subtype) return null;

  const userId = 'user' in event ? (event.user as string) : undefined;
  if (!userId) return null;

  const text = 'text' in event ? (event.text as string) : '';
  const channel = 'channel' in event ? (event.channel as string) : '';
  const ts = 'ts' in event ? (event.ts as string) : '';
  const threadTs = 'thread_ts' in event ? (event.thread_ts as string) : '';

  // Use thread_ts if in a thread, otherwise use message ts as thread root
  const effectiveThreadTs = threadTs || ts;

  const user: IUnifiedUser = {
    id: userId,
    displayName: `User ${userId}`,
  };

  const content: IUnifiedMessageContent = {
    type: 'text',
    text: text || '',
  };

  return {
    id: ts,
    platform: 'slack',
    chatId: buildSlackChatId(channel, effectiveThreadTs),
    user,
    content,
    timestamp: Math.floor(parseFloat(ts) * 1000),
    raw: event,
  };
}

// ==================== Outgoing Message Conversion ====================

/**
 * Slack send parameters
 */
export interface SlackSendParams {
  text: string;
  channel: string;
  thread_ts?: string;
  blocks?: unknown[];
  mrkdwn?: boolean;
}

/**
 * Convert unified outgoing message to Slack chat.postMessage parameters.
 * The caller must provide channel and thread_ts from the parsed chatId.
 */
export function toSlackSendParams(message: IUnifiedOutgoingMessage, channel: string, threadTs?: string): SlackSendParams {
  const text = message.text || '';
  const params: SlackSendParams = {
    text,
    channel,
    mrkdwn: true,
  };

  if (threadTs) {
    params.thread_ts = threadTs;
  }

  // Attach Block Kit blocks from replyMarkup
  if (message.replyMarkup && Array.isArray(message.replyMarkup)) {
    params.blocks = message.replyMarkup;
  }

  return params;
}

// ==================== Text Formatting ====================

/**
 * Convert HTML-formatted text to Slack mrkdwn format.
 * Handles common HTML tags used in the channel system.
 */
export function convertHtmlToSlackMarkdown(text: string): string {
  let result = text;

  // Convert known HTML tags to Slack mrkdwn BEFORE decoding entities
  result = result.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, '```\n$1\n```');
  result = result.replace(/<pre>([\s\S]*?)<\/pre>/g, '```\n$1\n```');
  result = result.replace(/<b>([\s\S]*?)<\/b>/g, '*$1*');
  result = result.replace(/<strong>([\s\S]*?)<\/strong>/g, '*$1*');
  result = result.replace(/<i>([\s\S]*?)<\/i>/g, '_$1_');
  result = result.replace(/<em>([\s\S]*?)<\/em>/g, '_$1_');
  result = result.replace(/<code>([\s\S]*?)<\/code>/g, '`$1`');
  // Convert links: <a href="url">text</a> → Slack link format
  // Collect links first, replace with indexed placeholders to avoid HTML tag stripping
  const links: string[] = [];
  result = result.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_match, url, text) => {
    const idx = links.length;
    links.push(`<${url}|${text}>`);
    return `%%SLACKLINK${idx}%%`;
  });
  result = result.replace(/<br\s*\/?>/g, '\n');

  // Strip any remaining HTML tags
  result = result.replace(/<[^>]+>/g, '');

  // Restore link placeholders
  for (let i = 0; i < links.length; i++) {
    result = result.replace(`%%SLACKLINK${i}%%`, links[i]);
  }

  // Decode HTML entities AFTER stripping tags
  result = result.replace(/&amp;/g, '&');
  result = result.replace(/&lt;/g, '<');
  result = result.replace(/&gt;/g, '>');

  // Convert markdown tables to code blocks (Slack doesn't render markdown tables)
  result = convertMarkdownTablesToCodeBlocks(result);

  // Convert markdown headings to bold (Slack doesn't render # headings)
  result = result.replace(/^#{1,3}\s+(.+)$/gm, '*$1*');

  return result;
}

/**
 * Convert markdown tables to code blocks for Slack readability.
 * Detects consecutive lines starting with | and wraps them in ``` blocks.
 */
function convertMarkdownTablesToCodeBlocks(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length > 0) {
      // Remove separator rows (|---|---|) and format as aligned text
      const dataLines = tableLines.filter((l) => !/^\|[\s-:|]+\|$/.test(l.trim()));
      result.push('```');
      result.push(...dataLines);
      result.push('```');
      tableLines = [];
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      tableLines.push(line);
    } else {
      flushTable();
      result.push(line);
    }
  }
  flushTable();

  return result.join('\n');
}

// ==================== Message Length Utilities ====================

/**
 * Slack message length limit (text field)
 */
export const SLACK_MESSAGE_LIMIT = 40000;

/**
 * Split long text into chunks that fit Slack's message limit
 */
export function splitMessage(text: string, maxLength: number = SLACK_MESSAGE_LIMIT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (prefer newline, then space)
    let splitIndex = maxLength;

    const newlineSearchStart = Math.floor(maxLength * 0.8);
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > newlineSearchStart) {
      splitIndex = lastNewline + 1;
    } else {
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > newlineSearchStart) {
        splitIndex = lastSpace + 1;
      }
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

// ==================== Action Parsing ====================

/**
 * Extract category from action_id string.
 * e.g., "confirm:abc:proceed_once" → "confirm"
 */
export function extractCategory(actionId: string): string {
  const parts = actionId.split(':');
  return parts[0];
}

/**
 * Extract action from action_id string.
 * e.g., "agent:gemini" → "gemini"
 */
export function extractAction(actionId: string): string {
  const parts = actionId.split(':');
  return parts.length > 1 ? parts[1] : actionId;
}
