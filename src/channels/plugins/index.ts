/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { BasePlugin } from './BasePlugin';
export type { PluginMessageHandler } from './BasePlugin';

// Telegram plugin
export { TelegramPlugin } from './telegram/TelegramPlugin';
export * from './telegram/TelegramAdapter';
export * from './telegram/TelegramKeyboards';

// DingTalk plugin
export { DingTalkPlugin } from './dingtalk/DingTalkPlugin';

// Slack plugin
export { SlackPlugin } from './slack/SlackPlugin';
export { buildSlackChatId, parseSlackChatId, convertHtmlToSlackMarkdown, SLACK_MESSAGE_LIMIT } from './slack/SlackAdapter';
export { createToolConfirmationBlocks, createMainMenuBlocks, createAgentSelectionBlocks, createErrorRecoveryBlocks, extractActionFromBlockAction } from './slack/SlackBlocks';
