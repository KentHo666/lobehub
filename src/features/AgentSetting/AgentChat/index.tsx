'use client';

import { isDesktop } from '@lobechat/const';
import { type FormGroupItemType } from '@lobehub/ui';
import { Form, SliderWithInput } from '@lobehub/ui';
import { Input, Switch } from 'antd';
import isEqual from 'fast-deep-equal';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { FORM_STYLE } from '@/const/layoutTokens';

import { selectors, useStore } from '../store';

const AgentChat = memo(() => {
  const { t } = useTranslation('setting');
  const [form] = Form.useForm();
  const updateConfig = useStore((s) => s.setChatConfig);
  const config = useStore(selectors.currentChatConfig, isEqual);

  const isACPEnabled = !!config.agentProvider?.type;

  const handleFinish = useCallback(
    (values: any) => {
      // Handle the agentProvider toggle: if disabled, clear the agentProvider config
      if (values._acpEnabled === false || values._acpEnabled === undefined) {
        const { _acpEnabled, _acpCommand, _acpWorkingDirectory, ...rest } = values;
        updateConfig({ ...rest, agentProvider: undefined });
      } else {
        const { _acpEnabled, _acpCommand, _acpWorkingDirectory, ...rest } = values;
        updateConfig({
          ...rest,
          agentProvider: {
            command: _acpCommand || 'claude',
            type: 'acp' as const,
            workingDirectory: _acpWorkingDirectory || undefined,
          },
        });
      }
    },
    [updateConfig],
  );

  const chat: FormGroupItemType = {
    children: [
      {
        children: <Switch />,
        desc: t('settingChat.enableAutoCreateTopic.desc'),
        label: t('settingChat.enableAutoCreateTopic.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'enableAutoCreateTopic',
        valuePropName: 'checked',
      },
      {
        children: <SliderWithInput max={8} min={0} unlimitedInput={true} />,
        desc: t('settingChat.autoCreateTopicThreshold.desc'),
        divider: false,
        hidden: !config.enableAutoCreateTopic,
        label: t('settingChat.autoCreateTopicThreshold.title'),
        name: 'autoCreateTopicThreshold',
      },
      {
        children: <Switch />,
        label: t('settingChat.enableHistoryCount.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'enableHistoryCount',
        valuePropName: 'checked',
      },
      {
        children: <SliderWithInput max={20} min={0} unlimitedInput={true} />,
        desc: t('settingChat.historyCount.desc'),
        divider: false,
        hidden: !config.enableHistoryCount,
        label: t('settingChat.historyCount.title'),
        name: 'historyCount',
      },
      {
        children: <Switch />,
        hidden: !config.enableHistoryCount,
        label: t('settingChat.enableCompressHistory.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'enableCompressHistory',
        valuePropName: 'checked',
      },
      {
        children: <Switch />,
        desc: t('settingChat.enableAutoScrollOnStreaming.desc'),
        label: t('settingChat.enableAutoScrollOnStreaming.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: 'enableAutoScrollOnStreaming',
        valuePropName: 'checked',
      },
    ],
    title: t('settingChat.title'),
  };

  const agentProvider: FormGroupItemType = {
    children: [
      {
        children: <Switch />,
        desc: t('settingChat.agentProvider.desc'),
        label: t('settingChat.agentProvider.toggle.title'),
        layout: 'horizontal',
        minWidth: undefined,
        name: '_acpEnabled',
        valuePropName: 'checked',
      },
      {
        children: <Input placeholder={t('settingChat.agentProvider.command.placeholder')} />,
        desc: t('settingChat.agentProvider.command.desc'),
        divider: false,
        hidden: !isACPEnabled,
        label: t('settingChat.agentProvider.command.title'),
        name: '_acpCommand',
      },
      {
        children: (
          <Input placeholder={t('settingChat.agentProvider.workingDirectory.placeholder')} />
        ),
        desc: t('settingChat.agentProvider.workingDirectory.desc'),
        divider: false,
        hidden: !isACPEnabled,
        label: t('settingChat.agentProvider.workingDirectory.title'),
        name: '_acpWorkingDirectory',
      },
    ],
    title: t('settingChat.agentProvider.title'),
  };

  // Build form groups — only show ACP settings on desktop
  const formGroups = isDesktop ? [chat, agentProvider] : [chat];

  return (
    <Form
      footer={<Form.SubmitFooter />}
      form={form}
      items={formGroups}
      itemsType={'group'}
      variant={'borderless'}
      initialValues={{
        ...config,
        _acpCommand: config.agentProvider?.command || 'claude',
        _acpEnabled: isACPEnabled,
        _acpWorkingDirectory: config.agentProvider?.workingDirectory || '',
      }}
      onFinish={handleFinish}
      {...FORM_STYLE}
    />
  );
});

export default AgentChat;
