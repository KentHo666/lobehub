'use client';

import { Button, Empty, Flexbox, Tag, Text } from '@lobehub/ui';
import { Modal } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { ArrowLeftIcon, Clock3Icon } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Loading from '@/components/Loading/BrandTextLoading';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useClientDataSWR } from '@/libs/swr';
import type {
  DocumentHistoryListItem,
  DocumentHistorySaveSource,
  ListHistoryOutput,
} from '@/server/routers/lambda/_schema/documentHistory';
import { documentService } from '@/services/document';
import { useDocumentStore } from '@/store/document';
import { editorSelectors } from '@/store/document/slices/editor';

import { selectors, usePageEditorStore } from '../store';
import DocumentHistoryDiff from './DocumentHistoryDiff';

const styles = createStaticStyles(({ css }) => ({
  empty: css`
    height: 100%;
    padding: 24px;
  `,
  headerButton: css`
    padding-inline: 8px;
  `,
  list: css`
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 8px;
  `,
  metaLine: css`
    flex-wrap: wrap;
  `,
  row: css`
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
    background: ${cssVar.colorBgContainer};
    transition:
      border-color ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut},
      background ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  rowCurrent: css`
    border-color: ${cssVar.colorPrimaryBorder};
    background: ${cssVar.colorPrimaryBg};
  `,
  savedAt: css`
    font-size: 12px;
    line-height: 1.4;
  `,
  sourceTag: css`
    margin-inline-start: 0;
  `,
  version: css`
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
  `,
}));

const formatAbsoluteTime = (savedAt: string) => dayjs(savedAt).format('MMMM D, YYYY h:mm A');

const HistoryPanel = memo(() => {
  const { t } = useTranslation(['common', 'file']);
  const { message, modal } = App.useApp();

  const documentId = usePageEditorStore(selectors.documentId);
  const editor = usePageEditorStore(selectors.editor);
  const setRightPanelMode = usePageEditorStore((s) => s.setRightPanelMode);

  const headVersion = useDocumentStore((s) =>
    documentId ? editorSelectors.headVersion(documentId)(s) : 1,
  );
  const markDirty = useDocumentStore((s) => s.markDirty);
  const performSave = useDocumentStore((s) => s.performSave);

  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [restoringVersion, setRestoringVersion] = useState<number | null>(null);

  const { data, isLoading } = useClientDataSWR<ListHistoryOutput>(
    documentId ? ['page-editor-document-history', documentId, headVersion] : null,
    async () =>
      documentService.listDocumentHistory({
        documentId: documentId!,
        includeCurrent: true,
        limit: 50,
      }),
  );

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const compareItem = useMemo(
    () => items.find((item) => item.version === compareVersion),
    [compareVersion, items],
  );
  const saveSourceLabels = useMemo<Record<DocumentHistorySaveSource, string>>(
    () => ({
      autosave: t('pageEditor.history.saveSource.autosave', { ns: 'file' }),
      manual: t('pageEditor.history.saveSource.manual', { ns: 'file' }),
      restore: t('pageEditor.history.saveSource.restore', { ns: 'file' }),
      system: t('pageEditor.history.saveSource.system', { ns: 'file' }),
    }),
    [t],
  );

  useEffect(() => {
    setCompareVersion(null);
  }, [documentId]);

  if (!documentId) return null;

  const handleRestore = (item: DocumentHistoryListItem) => {
    if (!documentId || !editor || item.isCurrent) return;

    modal.confirm({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('pageEditor.history.restoreConfirm.content', {
        ns: 'file',
        savedAt: formatAbsoluteTime(item.savedAt),
        version: item.version,
      }),
      okText: t('pageEditor.history.restore', { ns: 'file' }),
      onOk: async () => {
        setRestoringVersion(item.version);

        try {
          const result = await documentService.getDocumentHistoryVersion(
            { documentId, version: item.version },
            `page-editor-history-${documentId}`,
          );

          editor.setDocument('json', JSON.stringify(result.editorData));
          markDirty(documentId);
          await performSave(documentId, undefined, {
            restoreFromVersion: item.version,
            saveSource: 'restore',
          });
          setCompareVersion(null);
        } catch (error) {
          console.error('[PageEditor] Failed to restore version:', error);
          message.error(t('pageEditor.history.restoreError', { ns: 'file' }));
          throw error;
        } finally {
          setRestoringVersion(null);
        }
      },
      title: t('pageEditor.history.restoreConfirm.title', {
        ns: 'file',
        version: item.version,
      }),
    });
  };

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        showTogglePanelButton={false}
        left={
          <Text
            ellipsis={{ tooltipWhenOverflow: true }}
            style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}
            type={'secondary'}
          >
            {t('pageEditor.history.title', { ns: 'file' })}
          </Text>
        }
        right={
          <>
            <Button
              className={styles.headerButton}
              icon={ArrowLeftIcon}
              size={'small'}
              type={'text'}
              onClick={() => setRightPanelMode('copilot')}
            >
              {t('pageEditor.history.backToCopilot', { ns: 'file' })}
            </Button>
            <ToggleRightPanelButton showActive={false} />
          </>
        }
      />

      {isLoading && !data ? (
        <Flexbox align={'center'} className={styles.empty} justify={'center'}>
          <Loading debugId={'DocumentHistoryPanel'} />
        </Flexbox>
      ) : items.length === 0 ? (
        <Flexbox align={'center'} className={styles.empty} justify={'center'}>
          <Empty description={t('pageEditor.history.empty', { ns: 'file' })} icon={Clock3Icon} />
        </Flexbox>
      ) : (
        <Flexbox className={styles.list} gap={8}>
          {items.map((item) => {
            const isRestoring = restoringVersion === item.version;

            return (
              <Flexbox
                className={`${styles.row} ${item.isCurrent ? styles.rowCurrent : ''}`}
                gap={10}
                key={item.version}
                padding={12}
              >
                <Flexbox
                  horizontal
                  align={'center'}
                  distribution={'space-between'}
                  gap={12}
                  width={'100%'}
                >
                  <Flexbox gap={6} style={{ minWidth: 0 }}>
                    <Flexbox horizontal align={'center'} gap={8} wrap={'wrap'}>
                      <Text className={styles.version}>
                        {t('pageEditor.history.itemVersionLabel', {
                          ns: 'file',
                          version: item.version,
                        })}
                      </Text>
                      {item.isCurrent && (
                        <Tag variant={'borderless'}>
                          {t('pageEditor.history.current', { ns: 'file' })}
                        </Tag>
                      )}
                    </Flexbox>
                    <Flexbox horizontal align={'center'} className={styles.metaLine} gap={8}>
                      <Text className={styles.savedAt} type={'secondary'}>
                        {dayjs(item.savedAt).fromNow()}
                      </Text>
                      <Tag className={styles.sourceTag} variant={'borderless'}>
                        {saveSourceLabels[item.saveSource]}
                      </Tag>
                    </Flexbox>
                    <Text className={styles.savedAt} type={'secondary'}>
                      {formatAbsoluteTime(item.savedAt)}
                    </Text>
                  </Flexbox>

                  {!item.isCurrent && (
                    <Flexbox horizontal gap={8}>
                      <Button
                        size={'small'}
                        type={'text'}
                        onClick={() => setCompareVersion(item.version)}
                      >
                        {t('pageEditor.history.compare', { ns: 'file' })}
                      </Button>
                      <Button
                        loading={isRestoring}
                        size={'small'}
                        onClick={() => handleRestore(item)}
                      >
                        {t('pageEditor.history.restore', { ns: 'file' })}
                      </Button>
                    </Flexbox>
                  )}
                </Flexbox>
              </Flexbox>
            );
          })}
        </Flexbox>
      )}
      <Modal
        destroyOnHidden
        footer={false}
        open={!!compareItem}
        width={'min(92vw, 1200px)'}
        styles={{
          body: {
            overflow: 'hidden',
            padding: 0,
          },
        }}
        title={
          compareItem
            ? t('pageEditor.history.compareModalTitle', {
                ns: 'file',
                version: compareItem.version,
              })
            : false
        }
        onCancel={() => setCompareVersion(null)}
      >
        {compareItem && (
          <DocumentHistoryDiff
            documentId={documentId}
            headVersion={headVersion}
            version={compareItem.version}
          />
        )}
      </Modal>
    </Flexbox>
  );
});

HistoryPanel.displayName = 'HistoryPanel';

export default HistoryPanel;
