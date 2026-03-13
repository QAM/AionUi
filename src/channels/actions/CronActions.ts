/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SCHEDULE_PRESETS } from '@/common/cronPresets';
import { cronService } from '@/process/services/cron/CronService';
import { createCronPresetsCard as createLarkCronPresetsCard, createCronJobListCard as createLarkCronJobListCard, createCronRescheduleCard as createLarkCronRescheduleCard } from '../plugins/lark/LarkCards';
import { createCronPresetsCard as createDingTalkCronPresetsCard, createCronJobListCard as createDingTalkCronJobListCard, createCronRescheduleCard as createDingTalkCronRescheduleCard } from '../plugins/dingtalk/DingTalkCards';
import { createCronPresetsBlocks, createCronJobListBlocks, createCronRescheduleBlocks } from '../plugins/slack/SlackBlocks';
import { createCronPresetsKeyboard, createCronJobListKeyboard, createCronRescheduleKeyboard } from '../plugins/telegram/TelegramKeyboards';
import type { ActionHandler, IRegisteredAction } from './types';
import { CronActionNames, createErrorResponse, createSuccessResponse } from './types';
import type { PluginType } from '../types';
import { getChannelManager } from '../core/ChannelManager';
import dayjs from 'dayjs';

/**
 * Get short timezone label (e.g. "PST", "PDT", "Asia/Kolkata")
 */
function getShortTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Try to get abbreviated form like "PST", "IST"
    const abbr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
    return abbr || tz;
  } catch {
    return '';
  }
}

/**
 * Job info for list display
 */
interface CronJobListItem {
  id: string;
  name: string;
  scheduleDescription: string;
  enabled: boolean;
  conversationTitle?: string;
  nextRunAt?: string;
}

/**
 * Get cron job list markup by platform
 */
function getCronJobListMarkup(platform: PluginType, jobs: CronJobListItem[]) {
  if (platform === 'lark') return createLarkCronJobListCard(jobs);
  if (platform === 'dingtalk') return createDingTalkCronJobListCard(jobs);
  if (platform === 'slack') return createCronJobListBlocks(jobs);
  return createCronJobListKeyboard(jobs);
}

/**
 * Get cron presets markup by platform
 */
function getCronPresetsMarkup(platform: PluginType) {
  if (platform === 'lark') return createLarkCronPresetsCard();
  if (platform === 'dingtalk') return createDingTalkCronPresetsCard();
  if (platform === 'slack') return createCronPresetsBlocks();
  return createCronPresetsKeyboard();
}

/**
 * Handle cron.show - Show ALL scheduled tasks across all conversations
 */
export const handleCronShow: ActionHandler = async (context) => {
  const allJobs = await cronService.listJobs();

  if (allJobs.length === 0) {
    return createSuccessResponse({
      type: 'text',
      text: '⏰ <b>Scheduled Tasks</b>\n\nNo scheduled tasks yet.\n\nTap "Create" to set one up!',
      parseMode: 'HTML',
      replyMarkup: context.conversationId ? getCronPresetsMarkup(context.platform) : undefined,
    });
  }

  const tz = getShortTimezone();
  const jobItems: CronJobListItem[] = allJobs.map((job) => ({
    id: job.id,
    name: job.name,
    scheduleDescription: tz ? `${job.schedule.description} (${tz})` : job.schedule.description,
    enabled: job.enabled,
    conversationTitle: job.metadata.conversationTitle,
    nextRunAt: job.state.nextRunAtMs ? `${dayjs(job.state.nextRunAtMs).format('YYYY-MM-DD HH:mm')} ${tz}` : undefined,
  }));

  return createSuccessResponse({
    type: 'text',
    text: '',
    replyMarkup: getCronJobListMarkup(context.platform, jobItems),
  });
};

/**
 * Handle cron.create - Show schedule preset selection
 */
export const handleCronCreate: ActionHandler = async (context) => {
  if (!context.conversationId) {
    return createErrorResponse('No active session. Send a message to start a conversation first.');
  }

  // Check if conversation already has a job
  const jobs = await cronService.listJobsByConversation(context.conversationId);
  if (jobs.length > 0) {
    return createErrorResponse('This conversation already has a scheduled task. Delete the existing one first.');
  }

  return createSuccessResponse({
    type: 'text',
    text: '⏰ <b>Create Scheduled Task</b>\n\nSelect a schedule:',
    parseMode: 'HTML',
    replyMarkup: getCronPresetsMarkup(context.platform),
  });
};

/**
 * Handle cron.create.schedule - Create job with selected preset
 * After selecting a preset, the user's next message becomes the task message.
 * For simplicity, we create the job immediately with the preset key as the task name
 * and prompt the user to type the message.
 */
export const handleCronCreateSchedule: ActionHandler = async (context, params) => {
  if (!context.conversationId) {
    return createErrorResponse('No active session.');
  }

  const presetKey = params?.presetKey;
  const preset = SCHEDULE_PRESETS.find((p) => p.key === presetKey);
  if (!preset) {
    return createErrorResponse('Invalid schedule preset.');
  }

  // Store pending cron creation in session
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();
  const userId = context.channelUser?.id;
  if (sessionManager && userId) {
    const session = sessionManager.getSession(userId, context.chatId);
    if (session) {
      session.pendingCronCreate = {
        presetKey: preset.key,
        schedule: { ...preset.schedule },
      };
      if (preset.schedule.kind === 'cron') {
        (session.pendingCronCreate.schedule as { tz?: string }).tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    }
  }

  return createSuccessResponse({
    type: 'text',
    text: `⏰ Schedule: <b>${preset.schedule.description} (${getShortTimezone()})</b>\n\nNow type the message/prompt that should be sent on this schedule:`,
    parseMode: 'HTML',
  });
};

/**
 * Handle cron.delete - Delete a cron job and re-show the updated list
 */
export const handleCronDelete: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  if (!jobId) {
    return createErrorResponse('Missing job ID.');
  }

  try {
    await cronService.removeJob(jobId);
    return buildJobListResponse(context, '✅ Task deleted.');
  } catch (err) {
    return createErrorResponse(`Failed to delete task: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/**
 * Get cron reschedule markup by platform
 */
function getCronRescheduleMarkup(platform: PluginType, jobId: string, jobName: string) {
  if (platform === 'lark') return createLarkCronRescheduleCard(jobId, jobName);
  if (platform === 'dingtalk') return createDingTalkCronRescheduleCard(jobId, jobName);
  if (platform === 'slack') return createCronRescheduleBlocks(jobId, jobName);
  return createCronRescheduleKeyboard(jobId);
}

/**
 * Build job list items from all jobs (shared helper for re-showing after mutations)
 */
async function buildJobListResponse(context: { platform: PluginType; conversationId?: string }, statusText?: string) {
  const allJobs = await cronService.listJobs();

  if (allJobs.length === 0) {
    return createSuccessResponse({
      type: 'text',
      text: statusText ? `${statusText}\n\nNo more scheduled tasks.` : 'No scheduled tasks.',
      parseMode: 'HTML',
      replyMarkup: context.conversationId ? getCronPresetsMarkup(context.platform) : undefined,
    });
  }

  const tz = getShortTimezone();
  const jobItems: CronJobListItem[] = allJobs.map((job) => ({
    id: job.id,
    name: job.name,
    scheduleDescription: tz ? `${job.schedule.description} (${tz})` : job.schedule.description,
    enabled: job.enabled,
    conversationTitle: job.metadata.conversationTitle,
    nextRunAt: job.state.nextRunAtMs ? `${dayjs(job.state.nextRunAtMs).format('YYYY-MM-DD HH:mm')} ${tz}` : undefined,
  }));

  return createSuccessResponse({
    type: 'text',
    text: statusText || '',
    parseMode: 'HTML',
    replyMarkup: getCronJobListMarkup(context.platform, jobItems),
  });
}

/**
 * Handle cron.pause - Pause a cron job and re-show list
 */
export const handleCronPause: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  if (!jobId) return createErrorResponse('Missing job ID.');

  try {
    await cronService.updateJob(jobId, { enabled: false });
    return buildJobListResponse(context, '⏸ Task paused.');
  } catch (err) {
    return createErrorResponse(`Failed to pause task: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/**
 * Handle cron.resume - Resume a cron job and re-show list
 */
export const handleCronResume: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  if (!jobId) return createErrorResponse('Missing job ID.');

  try {
    await cronService.updateJob(jobId, { enabled: true });
    return buildJobListResponse(context, '▶️ Task resumed.');
  } catch (err) {
    return createErrorResponse(`Failed to resume task: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/**
 * Handle cron.reschedule - Show schedule presets for an existing job
 */
export const handleCronReschedule: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  if (!jobId) return createErrorResponse('Missing job ID.');

  const allJobs = await cronService.listJobs();
  const job = allJobs.find((j) => j.id === jobId);
  if (!job) return createErrorResponse('Job not found.');

  return createSuccessResponse({
    type: 'text',
    text: '',
    replyMarkup: getCronRescheduleMarkup(context.platform, jobId, job.name),
  });
};

/**
 * Handle cron.reschedule.confirm - Apply new schedule to existing job
 */
export const handleCronRescheduleConfirm: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  const presetKey = params?.presetKey;
  if (!jobId) return createErrorResponse('Missing job ID.');
  if (!presetKey) return createErrorResponse('Missing preset key.');

  const preset = SCHEDULE_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return createErrorResponse('Invalid schedule preset.');

  try {
    const schedule = { ...preset.schedule };
    if (schedule.kind === 'cron') {
      (schedule as { tz?: string }).tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    await cronService.updateJob(jobId, { schedule });
    return buildJobListResponse(context, `✅ Schedule updated to: ${preset.schedule.description} (${getShortTimezone()})`);
  } catch (err) {
    return createErrorResponse(`Failed to reschedule: ${err instanceof Error ? err.message : String(err)}`);
  }
};

/**
 * Handle cron.reschedule.custom - Prompt user to type a cron expression
 */
export const handleCronRescheduleCustom: ActionHandler = async (context, params) => {
  const jobId = params?.jobId;
  if (!jobId) return createErrorResponse('Missing job ID.');

  // Store pending reschedule in session
  const manager = getChannelManager();
  const sessionManager = manager.getSessionManager();
  const userId = context.channelUser?.id;
  if (sessionManager && userId) {
    const session = sessionManager.getSession(userId, context.chatId);
    if (session) {
      session.pendingCronReschedule = { jobId };
    }
  }

  return createSuccessResponse({
    type: 'text',
    text: '⏰ Type a cron expression for the new schedule:\n\nExamples:\n<code>0 */2 * * *</code> — Every 2 hours\n<code>30 9 * * 1-5</code> — Weekdays at 9:30 AM\n<code>0 0 1 * *</code> — 1st of every month',
    parseMode: 'HTML',
  });
};

/**
 * All cron actions
 */
export const cronActions: IRegisteredAction[] = [
  {
    name: CronActionNames.CRON_SHOW,
    category: 'system',
    description: 'Show scheduled task status',
    handler: handleCronShow,
  },
  {
    name: CronActionNames.CRON_CREATE,
    category: 'system',
    description: 'Create a new scheduled task',
    handler: handleCronCreate,
  },
  {
    name: CronActionNames.CRON_CREATE_SCHEDULE,
    category: 'system',
    description: 'Set schedule for new task',
    handler: handleCronCreateSchedule,
  },
  {
    name: CronActionNames.CRON_DELETE,
    category: 'system',
    description: 'Delete a scheduled task',
    handler: handleCronDelete,
  },
  {
    name: CronActionNames.CRON_PAUSE,
    category: 'system',
    description: 'Pause a scheduled task',
    handler: handleCronPause,
  },
  {
    name: CronActionNames.CRON_RESUME,
    category: 'system',
    description: 'Resume a scheduled task',
    handler: handleCronResume,
  },
  {
    name: CronActionNames.CRON_RESCHEDULE,
    category: 'system',
    description: 'Show reschedule options for a task',
    handler: handleCronReschedule,
  },
  {
    name: CronActionNames.CRON_RESCHEDULE_CONFIRM,
    category: 'system',
    description: 'Apply new schedule to a task',
    handler: handleCronRescheduleConfirm,
  },
  {
    name: CronActionNames.CRON_RESCHEDULE_CUSTOM,
    category: 'system',
    description: 'Enter custom cron expression for a task',
    handler: handleCronRescheduleCustom,
  },
];
