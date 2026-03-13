/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChannelAgentType } from '../../types';

/**
 * Slack Block Kit builders for Channel system.
 *
 * Analogous to TelegramKeyboards.ts / LarkCards.ts.
 * Uses Slack Block Kit JSON structures for interactive messages.
 */

// ==================== Types ====================

interface SlackTextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

interface SlackButtonElement {
  type: 'button';
  text: SlackTextObject;
  action_id: string;
  value?: string;
  style?: 'primary' | 'danger';
}

interface SlackSectionBlock {
  type: 'section';
  text: SlackTextObject;
  accessory?: SlackButtonElement;
}

interface SlackActionsBlock {
  type: 'actions';
  elements: SlackButtonElement[];
}

interface SlackDividerBlock {
  type: 'divider';
}

export type SlackBlock = SlackSectionBlock | SlackActionsBlock | SlackDividerBlock;

// ==================== Tool Confirmation ====================

/**
 * Create Block Kit blocks for tool confirmation prompts.
 * Each option becomes a button with action_id: `confirm:{callId}:{value}`
 */
export function createToolConfirmationBlocks(callId: string, options: Array<{ label: string; value: string }>, title?: string, description?: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  if (title || description) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: title && description ? `*${title}*\n${description}` : title ? `*${title}*` : description || '',
      },
    });
    blocks.push({ type: 'divider' });
  }

  const buttons: SlackButtonElement[] = options.map((opt) => {
    const isCancel = opt.value === 'cancel';
    return {
      type: 'button',
      text: { type: 'plain_text', text: opt.label, emoji: true },
      action_id: `confirm:${callId}:${opt.value}`,
      value: opt.value,
      ...(isCancel ? { style: 'danger' as const } : {}),
    };
  });

  blocks.push({ type: 'actions', elements: buttons });

  return blocks;
}

// ==================== Main Menu ====================

/**
 * Create Block Kit blocks for the main menu.
 */
export function createMainMenuBlocks(): SlackBlock[] {
  return [
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: '🆕 New Chat', emoji: true }, action_id: 'session:new' },
        { type: 'button', text: { type: 'plain_text', text: '🔄 Agent', emoji: true }, action_id: 'action:agent.show' },
        { type: 'button', text: { type: 'plain_text', text: '📊 Status', emoji: true }, action_id: 'action:session.status' },
        { type: 'button', text: { type: 'plain_text', text: '❓ Help', emoji: true }, action_id: 'action:help.show' },
      ],
    },
  ];
}

// ==================== Agent Selection ====================

/**
 * Agent info for display
 */
export interface AgentDisplayInfo {
  type: ChannelAgentType;
  emoji: string;
  name: string;
}

/**
 * Create Block Kit blocks for agent selection.
 */
export function createAgentSelectionBlocks(agents: AgentDisplayInfo[], currentAgent?: ChannelAgentType): SlackBlock[] {
  const buttons: SlackButtonElement[] = agents.map((agent) => {
    const label = currentAgent === agent.type ? `✓ ${agent.emoji} ${agent.name}` : `${agent.emoji} ${agent.name}`;
    return {
      type: 'button',
      text: { type: 'plain_text', text: label, emoji: true },
      action_id: `agent:${agent.type}`,
      value: agent.type,
    };
  });

  return [{ type: 'actions', elements: buttons }];
}

// ==================== Error Recovery ====================

/**
 * Create Block Kit blocks for error recovery.
 */
export function createErrorRecoveryBlocks(errorMessage?: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  if (errorMessage) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `❌ ${errorMessage}` },
    });
  }

  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: '🔄 Retry', emoji: true }, action_id: 'action:error.retry' },
      { type: 'button', text: { type: 'plain_text', text: '🆕 New Session', emoji: true }, action_id: 'session:new' },
    ],
  });

  return blocks;
}

// ==================== Action Parsing ====================

/**
 * Parse an action_id string into structured action info.
 * e.g., "confirm:abc123:proceed_once" → { category: 'confirm', action: 'abc123', params: 'proceed_once' }
 */
export function extractActionFromBlockAction(actionId: string): { category: string; action: string; params?: string } {
  const parts = actionId.split(':');
  return {
    category: parts[0],
    action: parts.length > 1 ? parts[1] : '',
    params: parts.length > 2 ? parts.slice(2).join(':') : undefined,
  };
}
