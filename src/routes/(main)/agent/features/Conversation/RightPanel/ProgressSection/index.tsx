import { Accordion, AccordionItem, Checkbox, Flexbox, Icon, Tag } from '@lobehub/ui';
import { Progress } from 'antd';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleArrowRight, ListTodo } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { selectTodosFromMessages } from '@/store/chat/slices/message/selectors/dbMessage';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { useAgentContext } from '../../useAgentContext';
import { normalizeTaskProgress } from './taskProgressAdapter';

const styles = createStaticStyles(({ css }) => ({
  count: css`
    font-family: ${cssVar.fontFamilyCode};
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
  `,
  header: css`
    overflow: hidden;

    font-size: 13px;
    font-weight: 500;
    color: ${cssVar.colorText};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemRow: css`
    padding-block: 6px;
    padding-inline: 4px;
    border-block-end: 1px dashed ${cssVar.colorBorderSecondary};
    font-size: 13px;

    &:last-child {
      border-block-end: none;
    }
  `,
  listContainer: css`
    margin-block-start: 8px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  processingRow: css`
    display: flex;
    gap: 6px;
    align-items: center;
  `,
  textCompleted: css`
    color: ${cssVar.colorTextQuaternary};
    text-decoration: line-through;
  `,
  textProcessing: css`
    color: ${cssVar.colorText};
  `,
  textTodo: css`
    color: ${cssVar.colorTextSecondary};
  `,
}));

const ProgressSection = memo(() => {
  const { t } = useTranslation('chat');
  const context = useAgentContext();
  const chatKey = messageMapKey(context);
  const dbMessages = useChatStore((s) => s.dbMessagesMap[chatKey]);

  const progress = useMemo(
    () => normalizeTaskProgress(selectTodosFromMessages(dbMessages || [])),
    [dbMessages],
  );

  const total = progress.items.length;
  const completed = progress.items.filter((item) => item.status === 'completed').length;

  return (
    <Flexbox data-testid="workspace-progress" padding={16}>
      <Accordion defaultExpandedKeys={['progress']} gap={0}>
        <AccordionItem
          itemKey={'progress'}
          paddingBlock={0}
          paddingInline={0}
          title={
            <Flexbox gap={8}>
              <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
                <Flexbox horizontal align={'center'} gap={8} style={{ flex: 1, minWidth: 0 }}>
                  <Icon
                    icon={ListTodo}
                    size={16}
                    style={{ color: cssVar.colorPrimary, flexShrink: 0 }}
                  />
                  <span className={styles.header}>
                    {progress.currentTask || t('agentWorkspace.progress.allCompleted')}
                  </span>
                  <Tag size={'small'} style={{ flexShrink: 0 }}>
                    <span className={styles.count}>
                      {completed}/{total}
                    </span>
                  </Tag>
                </Flexbox>
              </Flexbox>
              <Progress percent={progress.completionPercent} showInfo={false} size={'small'} />
            </Flexbox>
          }
        >
          <div className={styles.listContainer}>
            {progress.items.map((item) => {
              const isCompleted = item.status === 'completed';
              const isProcessing = item.status === 'processing';

              if (isProcessing) {
                return (
                  <div className={cx(styles.itemRow, styles.processingRow)} key={item.id}>
                    <Icon
                      icon={CircleArrowRight}
                      size={17}
                      style={{ color: cssVar.colorTextSecondary }}
                    />
                    <span className={styles.textProcessing}>{item.text}</span>
                  </div>
                );
              }

              return (
                <Checkbox
                  backgroundColor={cssVar.colorSuccess}
                  checked={isCompleted}
                  key={item.id}
                  shape={'circle'}
                  style={{ borderWidth: 1.5, cursor: 'default', pointerEvents: 'none' }}
                  classNames={{
                    text: cx(styles.textTodo, isCompleted && styles.textCompleted),
                    wrapper: styles.itemRow,
                  }}
                  textProps={{
                    type: isCompleted ? 'secondary' : undefined,
                  }}
                >
                  {item.text}
                </Checkbox>
              );
            })}
          </div>
        </AccordionItem>
      </Accordion>
    </Flexbox>
  );
});

ProgressSection.displayName = 'ProgressSection';

export default ProgressSection;
