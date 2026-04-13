'use client';

import { Flexbox, Icon, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { Clock3Icon, CloudIcon, Loader2Icon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';
import { useGlobalStore } from '@/store/global';

import { usePageEditorStore } from '../store';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    display: flex;
    align-items: center;

    min-width: 0;
    margin-inline-start: 6px;
    border-radius: 3px;

    background: ${cssVar.colorFillTertiary};
  `,
  historyButton: css`
    cursor: pointer;

    display: flex;
    align-items: center;

    padding-block: 4px;
    padding-inline: 6px 10px;
    border: 0;

    font: inherit;
    color: inherit;

    background: transparent;
    outline: none;

    transition: background ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      box-shadow: inset 0 0 0 1px ${cssVar.colorPrimary};
    }
  `,
  separator: css`
    user-select: none;

    flex-shrink: 0;

    font-size: 12px;
    line-height: 1;
    color: ${cssVar.colorTextQuaternary};
  `,
  statusSection: css`
    min-width: 0;
    padding-block: 4px;
    padding-inline: 10px 6px;
  `,
  statusText: css`
    overflow: hidden;

    font-size: 12px;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  versionText: css`
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  `,
}));

interface DocumentVersionControlProps {
  documentId: string;
}

const DocumentVersionControl = memo<DocumentVersionControlProps>(({ documentId }) => {
  const { t } = useTranslation(['editor', 'file']);
  const toggleRightPanel = useGlobalStore((s) => s.toggleRightPanel);
  const setRightPanelMode = usePageEditorStore((s) => s.setRightPanelMode);

  const saveStatus = useDocumentStore((s) => editorSelectors.saveStatus(documentId)(s));
  const lastUpdatedTime = useDocumentStore(
    (s) => editorSelectors.lastUpdatedTime(documentId)(s) ?? null,
  );
  const headVersion = useDocumentStore((s) => editorSelectors.headVersion(documentId)(s));

  const saveStatusLabel = useMemo(() => {
    if (saveStatus === 'saving') return t('autoSave.saving', { ns: 'editor' });
    if (saveStatus === 'saved' && lastUpdatedTime) {
      return `${t('autoSave.saved', { ns: 'editor' })} ${dayjs(lastUpdatedTime).fromNow()}`;
    }

    return t('autoSave.latest', { ns: 'editor' });
  }, [lastUpdatedTime, saveStatus, t]);

  const saveStatusIcon = saveStatus === 'saving' ? Loader2Icon : CloudIcon;

  return (
    <div className={styles.container}>
      <Flexbox align={'center'} className={styles.statusSection} gap={5} horizontal={true}>
        <Icon icon={saveStatusIcon} size={12} spin={saveStatus === 'saving'} />
        <Text className={styles.statusText} type={'secondary'}>
          {saveStatusLabel}
        </Text>
      </Flexbox>
      <span className={styles.separator}>·</span>
      <button
        aria-label={t('pageEditor.history.title', { ns: 'file' })}
        className={styles.historyButton}
        data-testid="page-editor-history-trigger"
        type="button"
        onClick={() => {
          setRightPanelMode('history');
          toggleRightPanel(true);
        }}
      >
        <Flexbox align={'center'} gap={5} horizontal={true}>
          <Icon icon={Clock3Icon} size={12} />
          <span className={styles.versionText}>
            {t('pageEditor.history.versionLabel', { ns: 'file', version: headVersion })}
          </span>
        </Flexbox>
      </button>
    </div>
  );
});

DocumentVersionControl.displayName = 'DocumentVersionControl';

export default DocumentVersionControl;
