/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronSchedule } from './ipcBridge';

export type SchedulePreset = {
  key: string;
  i18nKey: string;
  schedule: ICronSchedule;
};

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { key: 'everyHour', i18nKey: 'cron.preset.everyHour', schedule: { kind: 'every', everyMs: 3600000, description: 'Every hour' } },
  { key: 'every6Hours', i18nKey: 'cron.preset.every6Hours', schedule: { kind: 'every', everyMs: 21600000, description: 'Every 6 hours' } },
  { key: 'dailyMorning', i18nKey: 'cron.preset.dailyMorning', schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 9:00 AM' } },
  { key: 'dailyEvening', i18nKey: 'cron.preset.dailyEvening', schedule: { kind: 'cron', expr: '0 18 * * *', description: 'Daily at 6:00 PM' } },
  { key: 'weeklyMonday', i18nKey: 'cron.preset.weeklyMonday', schedule: { kind: 'cron', expr: '0 9 * * 1', description: 'Every Monday at 9:00 AM' } },
];
