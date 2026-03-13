/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { SlackPlugin } from './SlackPlugin';
export { buildSlackChatId, parseSlackChatId, convertHtmlToSlackMarkdown, toUnifiedIncomingMessage, toSlackSendParams, splitMessage, extractCategory, extractAction, SLACK_MESSAGE_LIMIT } from './SlackAdapter';
export type { SlackSendParams } from './SlackAdapter';
export { createToolConfirmationBlocks, createMainMenuBlocks, createAgentSelectionBlocks, createErrorRecoveryBlocks, extractActionFromBlockAction } from './SlackBlocks';
export type { AgentDisplayInfo, SlackBlock } from './SlackBlocks';
