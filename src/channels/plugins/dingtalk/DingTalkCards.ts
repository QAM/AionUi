/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChannelAgentType } from '../../types';

/**
 * DingTalk Message Cards for Personal Assistant
 *
 * DingTalk uses interactive message cards (ActionCard).
 * Cards support markdown content, buttons, and action callbacks.
 *
 * Card Structure:
 * - title: Card title
 * - text: Markdown content
 * - btnOrientation: Button layout ('0' vertical, '1' horizontal)
 * - btns: Array of buttons with title and actionURL
 *
 * For AI Card streaming, a different API flow is used (create -> stream -> finish).
 * These cards are used for static interactive messages.
 */

// ==================== Types ====================

/**
 * DingTalk card button
 */
export interface DingTalkButton {
  title: string;
  actionURL: string;
}

/**
 * DingTalk ActionCard structure
 */
export interface DingTalkCard {
  title: string;
  text: string;
  btnOrientation?: string;
  btns?: DingTalkButton[];
  singleTitle?: string;
  singleURL?: string;
}

/**
 * Agent info for card display
 */
export interface AgentDisplayInfo {
  type: ChannelAgentType;
  emoji: string;
  name: string;
}

// ==================== Helpers ====================

/**
 * Build a callback action URL for DingTalk card buttons
 * Uses a custom protocol that the plugin will intercept
 */
function actionUrl(action: string, params?: Record<string, string>): string {
  const allParams = { action, ...params };
  return `dtmd://dingtalkclient/sendMessage?content=${encodeURIComponent(JSON.stringify(allParams))}`;
}

/**
 * Build button from action info
 */
function btn(label: string, action: string, params?: Record<string, string>): DingTalkButton {
  return {
    title: label,
    actionURL: actionUrl(action, params),
  };
}

// ==================== Card Builders ====================

/**
 * Create main menu card
 */
export function createMainMenuCard(): DingTalkCard {
  return {
    title: 'AionUi Assistant',
    text: '### AionUi Assistant\n\nWelcome! Choose an action below:',
    btnOrientation: '1',
    btns: [btn('New Chat', 'session.new'), btn('Agent', 'agent.show'), btn('Status', 'session.status'), btn('Schedule', 'cron.show'), btn('Help', 'help.show')],
  };
}

/**
 * Create pairing card
 */
export function createPairingCard(pairingCode: string): DingTalkCard {
  return {
    title: 'Pairing Required',
    text: ['### Pairing Required', '', 'Please pair your account with AionUi:', '', `**Pairing Code:** \`${pairingCode}\``, '', '1. Open AionUi settings', '2. Go to Channels > DingTalk', '3. Enter this pairing code', '', 'Code expires in 10 minutes.'].join('\n'),
    btnOrientation: '1',
    btns: [btn('Refresh Code', 'pairing.refresh'), btn('Help', 'pairing.help')],
  };
}

/**
 * Create pairing status card
 */
export function createPairingStatusCard(pairingCode: string): DingTalkCard {
  return {
    title: 'Waiting for Approval',
    text: ['### Waiting for Approval', '', 'Your pairing request is pending approval.', '', `**Pairing Code:** \`${pairingCode}\``, '', 'Please approve in AionUi settings:', '1. Open AionUi app', '2. Go to WebUI > Channels', '3. Click "Approve" for this code'].join('\n'),
    btnOrientation: '1',
    btns: [btn('Check Status', 'pairing.check'), btn('New Code', 'pairing.refresh')],
  };
}

/**
 * Create pairing help card
 */
export function createPairingHelpCard(): DingTalkCard {
  return {
    title: 'Pairing Help',
    text: ['### Pairing Help', '', '**What is pairing?**', 'Pairing links your DingTalk account with the local AionUi application.', 'You need to pair before using the AI assistant.', '', '**How to pair:**', '1. Send any message to this bot', '2. You will receive a pairing code', '3. Open AionUi desktop app', '4. Go to WebUI > Channels > DingTalk', '5. Click "Approve" for your code', '', '**FAQ:**', '- Pairing code valid for 10 minutes', '- AionUi app must be running', '- One account can only pair once'].join('\n'),
    btns: [btn('Get Pairing Code', 'pairing.show')],
  };
}

/**
 * Create agent selection card
 */
export function createAgentSelectionCard(availableAgents: AgentDisplayInfo[], currentAgent?: ChannelAgentType): DingTalkCard {
  const currentAgentInfo = availableAgents.find((a) => a.type === currentAgent);
  const currentAgentName = currentAgentInfo ? `${currentAgentInfo.emoji} ${currentAgentInfo.name}` : 'None';

  const agentButtons: DingTalkButton[] = availableAgents.map((agent) => {
    const label = currentAgent === agent.type ? `[Current] ${agent.emoji} ${agent.name}` : `${agent.emoji} ${agent.name}`;
    return btn(label, 'agent.select', { agentType: agent.type });
  });

  return {
    title: 'Switch Agent',
    text: [`### Switch Agent`, '', `Select an AI agent for your conversations:`, '', `Current: **${currentAgentName}**`].join('\n'),
    btnOrientation: '0',
    btns: agentButtons,
  };
}

/**
 * Create session status card
 */
export function createSessionStatusCard(session?: { id: string; agentType: ChannelAgentType; createdAt: number; lastActivity: number }): DingTalkCard {
  if (!session) {
    return {
      title: 'Session Status',
      text: ['### Session Status', '', 'No active session.', '', 'Send a message to start a new conversation, or tap the "New Chat" button.'].join('\n'),
      btns: [btn('New Session', 'session.new')],
    };
  }

  const duration = Math.floor((Date.now() - session.createdAt) / 1000 / 60);
  const lastActivity = Math.floor((Date.now() - session.lastActivity) / 1000);

  return {
    title: 'Session Status',
    text: ['### Session Status', '', `- **Agent:** ${session.agentType}`, `- **Duration:** ${duration} min`, `- **Last activity:** ${lastActivity} sec ago`, `- **Session ID:** \`${session.id.slice(-8)}\``].join('\n'),
    btnOrientation: '1',
    btns: [btn('New Session', 'session.new'), btn('Refresh', 'session.status')],
  };
}

/**
 * Create help card
 */
export function createHelpCard(): DingTalkCard {
  return {
    title: 'AionUi Assistant Help',
    text: ['### AionUi Assistant Help', '', 'A remote assistant to interact with AionUi via DingTalk.', '', '**Common Actions:**', '- New Chat - Start a new session', '- Agent - Switch AI agent', '- Status - View current session status', '- Help - Show this help message', '', 'Send a message to chat with the AI assistant.'].join('\n'),
    btnOrientation: '0',
    btns: [btn('Features', 'help.features'), btn('Pairing Guide', 'help.pairing'), btn('Tips', 'help.tips')],
  };
}

/**
 * Create features card
 */
export function createFeaturesCard(): DingTalkCard {
  return {
    title: 'Features',
    text: ['### Features', '', '**AI Chat**', '- Natural language conversation', '- Streaming output, real-time display', '- Context memory support', '', '**Session Management**', '- Single session mode', '- Clear context anytime', '- View session status', '', '**Message Actions**', '- Copy reply content', '- Regenerate reply', '- Continue conversation'].join('\n'),
    btns: [btn('Back to Help', 'help.show')],
  };
}

/**
 * Create pairing guide card
 */
export function createPairingGuideCard(): DingTalkCard {
  return {
    title: 'Pairing Guide',
    text: ['### Pairing Guide', '', '**First-time Setup:**', '1. Send any message to the bot', '2. Bot displays pairing code', '3. Approve pairing in AionUi settings', '4. Ready to use after pairing', '', '**Notes:**', '- Pairing code valid for 10 minutes', '- AionUi app must be running', '- One DingTalk account can only pair once'].join('\n'),
    btns: [btn('Back to Help', 'help.show')],
  };
}

/**
 * Create tips card
 */
export function createTipsCard(): DingTalkCard {
  return {
    title: 'Tips',
    text: ['### Tips', '', '**Effective Conversations:**', '- Be clear and specific', '- Feel free to ask follow-ups', '- Regenerate if not satisfied', '', '**Quick Actions:**', '- Use card buttons for quick access', '- Tap message buttons for actions', '- New chat clears history context'].join('\n'),
    btns: [btn('Back to Help', 'help.show')],
  };
}

/**
 * Create response actions card
 * Buttons attached to AI response messages
 */
export function createResponseActionsCard(text: string): DingTalkCard {
  return {
    title: 'Response',
    text: text + '\n\n---',
    btnOrientation: '1',
    btns: [btn('Copy', 'chat.copy'), btn('Regenerate', 'chat.regenerate'), btn('Continue', 'chat.continue')],
  };
}

/**
 * Create error recovery card
 */
export function createErrorRecoveryCard(errorMessage?: string): DingTalkCard {
  return {
    title: 'Error',
    text: ['### Error', '', errorMessage || 'An error occurred. Please try again.'].join('\n'),
    btnOrientation: '1',
    btns: [btn('Retry', 'error.retry'), btn('New Session', 'session.new')],
  };
}

/**
 * Create tool confirmation card
 */
export function createToolConfirmationCard(callId: string, title: string, description: string, options: Array<{ label: string; value: string }>): DingTalkCard {
  const buttons: DingTalkButton[] = options.map((opt) => btn(opt.label, 'system.confirm', { callId, value: opt.value }));

  return {
    title,
    text: description,
    btnOrientation: '0',
    btns: buttons,
  };
}

/**
 * Create settings card
 */
export function createSettingsCard(): DingTalkCard {
  return {
    title: 'Settings',
    text: ['### Settings', '', 'Channel settings need to be configured in the AionUi app.', '', 'Open AionUi > WebUI > Channels'].join('\n'),
    btns: [btn('Back', 'help.show')],
  };
}

// ==================== Cron Cards ====================

/**
 * Create cron job status card with delete button
 */
export function createCronStatusCard(job: { id: string; name: string; scheduleDescription: string; enabled: boolean; nextRunAt?: string }): DingTalkCard {
  const statusEmoji = job.enabled ? '🟢' : '🟡';
  const lines = ['### Scheduled Task', '', `${statusEmoji} **${job.name}**`, `- Schedule: ${job.scheduleDescription}`];
  if (job.nextRunAt) lines.push(`- Next: ${job.nextRunAt}`);

  return {
    title: 'Scheduled Task',
    text: lines.join('\n'),
    btns: [btn('Delete Task', 'cron.delete', { jobId: job.id })],
  };
}

/**
 * Create cron schedule preset selection card
 */
export function createCronPresetsCard(): DingTalkCard {
  return {
    title: 'Create Scheduled Task',
    text: '### Create Scheduled Task\n\nSelect a schedule:',
    btnOrientation: '0',
    btns: [btn('Every Hour', 'cron.create.schedule', { presetKey: 'everyHour' }), btn('Every 6 Hours', 'cron.create.schedule', { presetKey: 'every6Hours' }), btn('Daily 9 AM', 'cron.create.schedule', { presetKey: 'dailyMorning' }), btn('Daily 6 PM', 'cron.create.schedule', { presetKey: 'dailyEvening' }), btn('Weekly Monday', 'cron.create.schedule', { presetKey: 'weeklyMonday' })],
  };
}

/**
 * Create cron job list card - shows all jobs across conversations with pause/resume + delete
 */
export function createCronJobListCard(jobs: Array<{ id: string; name: string; scheduleDescription: string; enabled: boolean; conversationTitle?: string; nextRunAt?: string }>): DingTalkCard {
  const lines = [`### All Scheduled Tasks (${jobs.length})`, ''];
  for (const job of jobs) {
    const statusEmoji = job.enabled ? '🟢' : '🟡';
    lines.push(`${statusEmoji} **${job.name}**`);
    lines.push(`- Schedule: ${job.scheduleDescription}`);
    if (job.conversationTitle) lines.push(`- Chat: ${job.conversationTitle}`);
    if (job.nextRunAt) lines.push(`- Next: ${job.nextRunAt}`);
    lines.push('');
  }

  const buttons: DingTalkButton[] = [];
  for (const job of jobs) {
    if (job.enabled) {
      buttons.push(btn(`⏸ ${job.name}`, 'cron.pause', { jobId: job.id }));
    } else {
      buttons.push(btn(`▶️ ${job.name}`, 'cron.resume', { jobId: job.id }));
    }
    buttons.push(btn(`📅 ${job.name}`, 'cron.reschedule', { jobId: job.id }));
    buttons.push(btn(`🗑 ${job.name}`, 'cron.delete', { jobId: job.id }));
  }

  return {
    title: 'All Scheduled Tasks',
    text: lines.join('\n'),
    btnOrientation: '0',
    btns: buttons,
  };
}

/**
 * Create cron reschedule card - shows schedule presets for an existing job
 */
export function createCronRescheduleCard(jobId: string, jobName: string): DingTalkCard {
  return {
    title: `Reschedule: ${jobName}`,
    text: `### Reschedule: ${jobName}\n\nSelect a new schedule:`,
    btnOrientation: '0',
    btns: [btn('Every Hour', 'cron.reschedule.confirm', { jobId, presetKey: 'everyHour' }), btn('Every 6 Hours', 'cron.reschedule.confirm', { jobId, presetKey: 'every6Hours' }), btn('Daily 9 AM', 'cron.reschedule.confirm', { jobId, presetKey: 'dailyMorning' }), btn('Daily 6 PM', 'cron.reschedule.confirm', { jobId, presetKey: 'dailyEvening' }), btn('Weekly Monday', 'cron.reschedule.confirm', { jobId, presetKey: 'weeklyMonday' }), btn('✏️ Custom', 'cron.reschedule.custom', { jobId })],
  };
}

// ==================== Utilities ====================

/**
 * Create a simple text card without buttons
 */
export function createTextCard(text: string, title?: string): DingTalkCard {
  return {
    title: title || 'Message',
    text,
  };
}
