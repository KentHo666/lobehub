'use client';

import type { LexicalDiffProps } from '@lobehub/editor/renderer';
import { LexicalDiff } from '@lobehub/editor/renderer';
import { Empty, Flexbox } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import type { SerializedEditorState } from 'lexical';
import { GitCompareArrowsIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Loading from '@/components/Loading/BrandTextLoading';
import { useClientDataSWR } from '@/libs/swr';
import type { CompareHistoryVersionsOutput } from '@/server/routers/lambda/_schema/documentHistory';
import { documentService } from '@/services/document';

const styles = createStaticStyles(({ css }) => ({
  container: css`
    overflow: hidden;
    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    overflow: auto;
    max-height: min(72vh, 900px);
  `,
  empty: css`
    padding: 24px;
  `,
}));

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSerializedEditorState = (value: unknown): value is SerializedEditorState =>
  isObject(value) && isObject(value.root) && Array.isArray(value.root.children);

const isSerializedRootNode = (value: unknown): value is SerializedEditorState['root'] =>
  isObject(value) && value.type === 'root' && Array.isArray(value.children);

const normalizeEditorState = (value: unknown): SerializedEditorState | null => {
  if (isSerializedEditorState(value)) return value;
  if (isSerializedRootNode(value)) return { root: value };

  return null;
};

interface DocumentHistoryDiffProps {
  documentId: string;
  headVersion: number;
  version: number;
}

const DocumentHistoryDiff = memo<DocumentHistoryDiffProps>(
  ({ documentId, headVersion, version }) => {
    const { t } = useTranslation('file');

    const { data, error, isLoading } = useClientDataSWR<CompareHistoryVersionsOutput>(
      ['page-editor-document-history-compare', documentId, version, headVersion],
      async () =>
        documentService.compareDocumentHistoryVersions({
          documentId,
          fromVersion: version,
          toVersion: headVersion,
        }),
    );

    const labels = useMemo<NonNullable<LexicalDiffProps['labels']>>(
      () => ({
        new: t('pageEditor.history.compareCurrentLabel', { version: headVersion }),
        old: t('pageEditor.history.itemVersionLabel', { version }),
      }),
      [headVersion, t, version],
    );
    const normalizedValues = useMemo(() => {
      const oldValue = normalizeEditorState(data?.from.editorData);
      const newValue = normalizeEditorState(data?.to.editorData);

      return { newValue, oldValue };
    }, [data?.from.editorData, data?.to.editorData]);

    return (
      <Flexbox className={styles.container} gap={0}>
        {isLoading && !data ? (
          <Flexbox align={'center'} className={styles.empty} justify={'center'}>
            <Loading debugId={'DocumentHistoryDiff'} />
          </Flexbox>
        ) : error || !data || !normalizedValues.oldValue || !normalizedValues.newValue ? (
          <Flexbox align={'center'} className={styles.empty} justify={'center'}>
            <Empty description={t('pageEditor.history.compareError')} icon={GitCompareArrowsIcon} />
          </Flexbox>
        ) : (
          <div className={styles.content}>
            <LexicalDiff
              appearance={'borderless'}
              labels={labels}
              newValue={normalizedValues.newValue}
              oldValue={normalizedValues.oldValue}
              variant="chat"
            />
          </div>
        )}
      </Flexbox>
    );
  },
);

DocumentHistoryDiff.displayName = 'DocumentHistoryDiff';

export default DocumentHistoryDiff;
