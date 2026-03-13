/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackendAll } from '@/types/acpTypes';
import { ipcBridge } from '@/common';
import { SCHEDULE_PRESETS } from '@/common/cronPresets';
import type { ICronSchedule } from '@/common/ipcBridge';
import { useLayoutContext } from '@/renderer/context/LayoutContext';
import { Drawer, Form, Input, Radio, Message, Button } from '@arco-design/web-react';
import { AlarmClock } from '@icon-park/react';
import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const FormItem = Form.Item;
const TextArea = Input.TextArea;

export interface CreateCronJobDrawerProps {
  visible: boolean;
  conversationId: string;
  agentType: AcpBackendAll;
  conversationTitle?: string;
  onClose: () => void;
}

const CreateCronJobDrawer: React.FC<CreateCronJobDrawerProps> = ({ visible, conversationId, agentType, conversationTitle, onClose }) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [scheduleType, setScheduleType] = useState<string>('everyHour');

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validate();
      setSubmitting(true);

      let schedule: ICronSchedule;
      if (scheduleType === 'custom') {
        schedule = {
          kind: 'cron',
          expr: values.cronExpr,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          description: values.description || values.cronExpr,
        };
      } else {
        const preset = SCHEDULE_PRESETS.find((p) => p.key === scheduleType);
        if (!preset) throw new Error('Invalid schedule preset');
        schedule = { ...preset.schedule };
        if (schedule.kind === 'cron') {
          schedule.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
      }

      await ipcBridge.cron.addJob.invoke({
        name: values.name,
        schedule,
        message: values.message,
        conversationId,
        conversationTitle,
        agentType,
        createdBy: 'user',
      });

      Message.success(t('cron.create.success'));
      form.resetFields();
      setScheduleType('everyHour');
      onClose();
    } catch (err) {
      if (err instanceof Error) {
        Message.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, scheduleType, conversationId, conversationTitle, agentType, onClose, t]);

  return (
    <Drawer
      placement={isMobile ? 'bottom' : 'right'}
      width={isMobile ? 'calc(100vw - 12px)' : 400}
      height={isMobile ? 'min(84vh, 760px)' : undefined}
      title={
        <div className='inline-flex items-center gap-8px'>
          <AlarmClock theme='outline' size={18} strokeWidth={4} fill='currentColor' className='flex items-center' />
          <span className='leading-none'>{t('cron.create.title')}</span>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      bodyStyle={{
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: isMobile ? '14px 14px 18px' : undefined,
      }}
      footer={
        <Button type='primary' shape='round' loading={submitting} onClick={handleSubmit}>
          {t('cron.create.submit')}
        </Button>
      }
    >
      <Form form={form} layout='vertical' className='space-y-12px'>
        {/* Task Name */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <FormItem label={t('cron.create.name')} field='name' rules={[{ required: true }]} className='!mb-0'>
            <Input placeholder={t('cron.create.namePlaceholder')} />
          </FormItem>
        </div>

        {/* Schedule Selection */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <FormItem label={t('cron.create.schedule')} className='!mb-0'>
            <Radio.Group direction='vertical' value={scheduleType} onChange={(val) => setScheduleType(val)}>
              {SCHEDULE_PRESETS.map((preset) => (
                <Radio key={preset.key} value={preset.key}>
                  {t(preset.i18nKey)}
                </Radio>
              ))}
              <Radio value='custom'>{t('cron.create.customSchedule')}</Radio>
            </Radio.Group>
          </FormItem>
          {scheduleType === 'custom' && (
            <div className='mt-12px space-y-8px'>
              <FormItem field='cronExpr' rules={[{ required: true, match: /^[\d*,\-/\s]+$/ }]} className='!mb-0'>
                <Input placeholder={t('cron.create.cronExprPlaceholder')} />
              </FormItem>
              <FormItem field='description' className='!mb-0'>
                <Input placeholder={t('cron.create.descriptionPlaceholder')} />
              </FormItem>
            </div>
          )}
        </div>

        {/* Message */}
        <div className='bg-2 rd-16px px-16px py-16px'>
          <FormItem label={t('cron.create.message')} field='message' rules={[{ required: true }]} className='!mb-0'>
            <TextArea placeholder={t('cron.create.messagePlaceholder')} autoSize={{ minRows: 3, maxRows: 10 }} className='!bg-bg-1' />
          </FormItem>
        </div>
      </Form>
    </Drawer>
  );
};

export default CreateCronJobDrawer;
