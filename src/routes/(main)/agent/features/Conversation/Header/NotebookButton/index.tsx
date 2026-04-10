'use client';

import { DESKTOP_HEADER_ICON_SIZE } from '@lobechat/const';
import { ActionIcon } from '@lobehub/ui';
import { FilePenIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { SESSION_CHAT_TOPIC_PAGE_URL } from '@/const/url';
import { useChatStore } from '@/store/chat';

const NotebookButton = memo(() => {
  const { t } = useTranslation('portal');
  const navigate = useNavigate();
  const params = useParams<{ aid?: string; topicId?: string }>();
  const [showNotebook, toggleNotebook] = useChatStore((s) => [s.showNotebook, s.toggleNotebook]);

  return (
    <ActionIcon
      active={showNotebook}
      icon={FilePenIcon}
      size={DESKTOP_HEADER_ICON_SIZE}
      title={t('notebook.title')}
      onClick={() => {
        if (params.aid && params.topicId) {
          navigate(SESSION_CHAT_TOPIC_PAGE_URL(params.aid, params.topicId));
          return;
        }

        toggleNotebook();
      }}
    />
  );
});

export default NotebookButton;
