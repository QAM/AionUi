/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/ipcBridge';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { iconColors } from '@/renderer/theme/colors';
import { Badge, Button, Empty, Popconfirm, Radio, Spin, Switch, Tag } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import dayjs from 'dayjs';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import CronJobDrawer from './components/CronJobDrawer';
import { useAllCronJobs } from './hooks/useCronJobs';
import { getJobStatusFlags } from './utils/cronUtils';

type FilterType = 'all' | 'active' | 'paused' | 'error';

const CronJobsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { jobs, loading, activeCount, deleteJob, updateJob } = useAllCronJobs();

  const [filter, setFilter] = useState<FilterType>('all');
  const [editingJob, setEditingJob] = useState<ICronJob | null>(null);

  const filteredJobs = useMemo(() => {
    if (filter === 'all') return jobs;
    return jobs.filter((job) => {
      if (filter === 'active') return job.enabled && job.state.lastStatus !== 'error';
      if (filter === 'paused') return !job.enabled;
      if (filter === 'error') return job.state.lastStatus === 'error';
      return true;
    });
  }, [jobs, filter]);

  const handleSave = async (updates: { message: string; enabled: boolean }) => {
    if (!editingJob) return;
    await updateJob(editingJob.id, {
      enabled: updates.enabled,
      target: { payload: { kind: 'message', text: updates.message } },
    });
  };

  const handleDelete = async () => {
    if (!editingJob) return;
    await deleteJob(editingJob.id);
  };

  return (
    <div className={`mx-auto max-w-1024px h-full flex flex-col ${isMobile ? 'px-12px py-12px' : 'px-24px py-20px'}`}>
      {/* Header */}
      <div className='flex items-center justify-between mb-16px'>
        <div className='flex items-center gap-10px'>
          <AlarmClock theme='outline' size={22} fill={iconColors.primary} />
          <h2 className='text-18px font-semibold m-0'>{t('cron.allScheduledTasks')}</h2>
          {activeCount > 0 && <Badge count={activeCount} />}
        </div>
      </div>

      {/* Filter bar */}
      <div className='mb-16px'>
        <Radio.Group type='button' size='small' value={filter} onChange={(val) => setFilter(val)}>
          <Radio value='all'>{t('cron.filterAll')}</Radio>
          <Radio value='active'>{t('cron.filterActive')}</Radio>
          <Radio value='paused'>{t('cron.filterPaused')}</Radio>
          <Radio value='error'>{t('cron.filterError')}</Radio>
        </Radio.Group>
      </div>

      {/* Content */}
      <div className='flex-1 min-h-0 overflow-y-auto'>
        {loading ? (
          <div className='flex items-center justify-center h-200px'>
            <Spin />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className='flex flex-col items-center justify-center h-200px'>
            <Empty icon={<AlarmClock theme='outline' size={48} fill={iconColors.disabled} />} description={jobs.length === 0 ? t('cron.noTasks') : t('cron.noTasks')} />
            {jobs.length === 0 && <p className='text-13px text-t-secondary mt-8px'>{t('cron.noTasksHint')}</p>}
          </div>
        ) : (
          <div className='flex flex-col gap-12px'>
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onEdit={() => setEditingJob(job)}
                onToggle={async (enabled) => {
                  await updateJob(job.id, { enabled });
                }}
                onDelete={async () => {
                  await deleteJob(job.id);
                }}
                onGoToConversation={() => {
                  void navigate(`/conversation/${job.metadata.conversationId}`);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      {editingJob && <CronJobDrawer visible={!!editingJob} job={editingJob} onClose={() => setEditingJob(null)} onSave={handleSave} onDelete={handleDelete} />}
    </div>
  );
};

interface JobCardProps {
  job: ICronJob;
  onEdit: () => void;
  onToggle: (enabled: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onGoToConversation: () => void;
}

const JobCard: React.FC<JobCardProps> = ({ job, onEdit, onToggle, onDelete, onGoToConversation }) => {
  const { t } = useTranslation();
  const { hasError, isPaused } = getJobStatusFlags(job);
  const nextRunTime = job.state.nextRunAtMs ? dayjs(job.state.nextRunAtMs).format('YYYY-MM-DD HH:mm') : null;

  return (
    <div className='bg-2 rd-12px px-16px py-14px cursor-pointer hover:shadow-sm transition-shadow' onClick={onEdit}>
      {/* Row 1: Icon + Name + Switch */}
      <div className='flex items-center justify-between mb-8px'>
        <div className='flex items-center gap-8px min-w-0'>
          <AlarmClock theme='outline' size={16} fill={hasError ? '#f53f3f' : isPaused ? '#ff7d00' : iconColors.primary} className='shrink-0' />
          <span className='text-14px font-medium truncate'>{job.name}</span>
          {hasError && (
            <Tag size='small' color='red'>
              {t('cron.status.error')}
            </Tag>
          )}
          {isPaused && !hasError && (
            <Tag size='small' color='orangered'>
              {t('cron.status.paused')}
            </Tag>
          )}
        </div>
        <Switch
          size='small'
          checked={job.enabled}
          onChange={(checked, e) => {
            e.stopPropagation();
            void onToggle(checked);
          }}
        />
      </div>

      {/* Row 2: Schedule + Next run */}
      <div className='text-12px text-t-secondary mb-6px'>
        <span>{job.schedule.description}</span>
        {nextRunTime && (
          <span className='ml-12px'>
            {t('cron.nextRun')}: {nextRunTime}
          </span>
        )}
      </div>

      {/* Row 3: Conversation + Error + Actions */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-8px min-w-0'>
          {job.metadata.conversationTitle && (
            <Button
              type='text'
              size='mini'
              className='!px-0 !text-12px text-t-secondary hover:text-primary'
              onClick={(e) => {
                e.stopPropagation();
                onGoToConversation();
              }}
            >
              {t('cron.goToConversation')}: {job.metadata.conversationTitle}
            </Button>
          )}
        </div>
        <div className='flex items-center gap-4px'>
          <Popconfirm
            title={t('cron.confirmDelete')}
            onOk={(e) => {
              e?.stopPropagation();
              void onDelete();
            }}
            onCancel={(e) => e?.stopPropagation()}
          >
            <Button type='text' size='mini' status='danger' onClick={(e) => e.stopPropagation()}>
              {t('cron.actions.delete')}
            </Button>
          </Popconfirm>
        </div>
      </div>

      {/* Error message */}
      {hasError && job.state.lastError && <div className='mt-6px text-12px text-[#f53f3f] truncate'>{job.state.lastError}</div>}
    </div>
  );
};

export default CronJobsPage;
