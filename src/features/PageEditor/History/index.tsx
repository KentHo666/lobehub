'use client';

import { ActionIcon, Button, Empty, Flexbox, Tag, Text } from '@lobehub/ui';
import { Modal } from '@lobehub/ui/base-ui';
import { App } from 'antd';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import dayjs from 'dayjs';
import { ArrowLeftIcon, Clock3Icon, GitCompareArrowsIcon, RotateCcwIcon } from 'lucide-react';
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

interface HistoryDayGroup {
  items: DocumentHistoryListItem[];
  key: string;
  label: string;
}

const TIMELINE_DOT_SIZE = 10;
const TIMELINE_LINE_INSET = 19;
const TIMELINE_ROW_PADDING_TOP = 6;
const TIMELINE_ROW_PADDING_INLINE = 8;
const TIMELINE_ROW_PADDING_BOTTOM = 8;
const TIMELINE_DOT_TOP = 14;
const TIMELINE_CONTENT_OFFSET = TIMELINE_LINE_INSET + TIMELINE_DOT_SIZE / 2 + 10;

const styles = createStaticStyles(({ css }) => ({
  empty: css`
    height: 100%;
    padding: 24px;
  `,
  groupCount: css`
    font-size: 12px;
    line-height: 1;
  `,
  groupHeader: css`
    position: sticky;
    z-index: 1;
    inset-block-start: 0;

    padding-block: 10px 6px;
    padding-inline-start: ${TIMELINE_CONTENT_OFFSET}px;

    background: ${cssVar.colorBgContainer};
  `,
  groupLabel: css`
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  `,
  headerButton: css`
    padding-inline: 8px;
  `,
  list: css`
    position: relative;

    overflow-y: auto;
    flex: 1;

    min-height: 0;
    padding-block: 0 20px;
    padding-inline: 8px 12px;
  `,
  rail: css`
    position: absolute;
    inset-block: 0;
    inset-inline-start: ${TIMELINE_LINE_INSET}px;

    width: 1px;

    background: ${cssVar.colorFillSecondary};
  `,
  metaLine: css`
    flex-wrap: wrap;
  `,
  row: css`
    position: relative;
    padding-block: 1px;
    padding-inline-start: ${TIMELINE_CONTENT_OFFSET}px;

    &:hover,
    &:focus-within {
      .history-actions {
        pointer-events: auto;
        opacity: 1;
      }
    }
  `,
  rowBody: css`
    padding-block: ${TIMELINE_ROW_PADDING_TOP}px ${TIMELINE_ROW_PADDING_BOTTOM}px;
    padding-inline: ${TIMELINE_ROW_PADDING_INLINE}px;
    border-radius: 10px;
    transition: background ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  rowCurrent: css`
    background: ${cssVar.colorFillQuaternary};

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  rowDot: css`
    position: absolute;
    inset-block-start: ${TIMELINE_DOT_TOP}px;
    inset-inline-start: 6px;

    width: ${TIMELINE_DOT_SIZE}px;
    height: ${TIMELINE_DOT_SIZE}px;
    border: 1px solid ${cssVar.colorBorder};
    border-radius: 999px;

    background: ${cssVar.colorBgContainer};
    box-shadow: 0 0 0 4px ${cssVar.colorBgContainer};
  `,
  rowDotCurrent: css`
    border-color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimary};
  `,
  rowDotRestore: css`
    box-shadow:
      0 0 0 2px ${cssVar.colorPrimaryBorder},
      0 0 0 6px ${cssVar.colorBgContainer};
  `,
  savedAt: css`
    font-size: 12px;
    line-height: 1.4;
  `,
  sourceTag: css`
    min-width: fit-content;
    margin-inline-start: 0;
  `,
  titleRow: css`
    flex-wrap: wrap;
    min-width: 0;
  `,
  version: css`
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  `,
  versionActions: css`
    pointer-events: none;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity ${cssVar.motionDurationMid} ${cssVar.motionEaseInOut};
  `,
}));

const formatAbsoluteTime = (savedAt: string) => dayjs(savedAt).format('MMMM D, YYYY h:mm A');
const formatDayGroupLabel = (savedAt: string) => dayjs(savedAt).format('MMMM D, YYYY');

const createHistoryDayGroups = (items: DocumentHistoryListItem[]): HistoryDayGroup[] => {
  const groups = new Map<string, HistoryDayGroup>();

  for (const item of items) {
    const key = dayjs(item.savedAt).format('YYYY-MM-DD');
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
      continue;
    }

    groups.set(key, {
      items: [item],
      key,
      label: formatDayGroupLabel(item.savedAt),
    });
  }

  return [...groups.values()];
};

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
  const groups = useMemo(() => createHistoryDayGroups(items), [items]);
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
        <Flexbox className={styles.list} gap={0}>
          <div className={styles.rail} />
          {groups.map((group) => (
            <Flexbox gap={4} key={group.key}>
              <Flexbox
                horizontal
                align={'center'}
                className={styles.groupHeader}
                distribution={'space-between'}
                gap={12}
              >
                <Text className={styles.groupLabel} type={'secondary'}>
                  {group.label}
                </Text>
                <Text className={styles.groupCount} type={'secondary'}>
                  {group.items.length}
                </Text>
              </Flexbox>

              {group.items.map((item) => {
                const isRestoring = restoringVersion === item.version;

                return (
                  <Flexbox className={styles.row} gap={0} key={item.version}>
                    <div
                      className={cx(
                        styles.rowDot,
                        item.isCurrent && styles.rowDotCurrent,
                        item.saveSource === 'restore' && styles.rowDotRestore,
                      )}
                    />
                    <Flexbox
                      className={cx(styles.rowBody, item.isCurrent && styles.rowCurrent)}
                      gap={8}
                    >
                      <Flexbox gap={6} style={{ minWidth: 0 }}>
                        <Flexbox
                          horizontal
                          align={'flex-start'}
                          distribution={'space-between'}
                          gap={8}
                        >
                          <Flexbox
                            horizontal
                            align={'center'}
                            className={styles.titleRow}
                            gap={8}
                            wrap={'wrap'}
                          >
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

                          {!item.isCurrent && (
                            <Flexbox
                              horizontal
                              align={'center'}
                              className={`history-actions ${styles.versionActions}`}
                              gap={6}
                            >
                              <ActionIcon
                                icon={GitCompareArrowsIcon}
                                size={{ blockSize: 26, borderRadius: '50%', size: 14 }}
                                title={t('pageEditor.history.compare', { ns: 'file' })}
                                onClick={() => setCompareVersion(item.version)}
                              />
                              <ActionIcon
                                icon={RotateCcwIcon}
                                loading={isRestoring}
                                size={{ blockSize: 26, borderRadius: '50%', size: 14 }}
                                title={t('pageEditor.history.restore', { ns: 'file' })}
                                onClick={() => handleRestore(item)}
                              />
                            </Flexbox>
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
                    </Flexbox>
                  </Flexbox>
                );
              })}
            </Flexbox>
          ))}
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
