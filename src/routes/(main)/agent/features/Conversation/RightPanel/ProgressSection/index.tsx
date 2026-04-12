import { Accordion, AccordionItem, Checkbox, Flexbox, Tag, Text } from '@lobehub/ui';
import { Progress } from 'antd';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useChatStore } from '@/store/chat';
import { selectTodosFromMessages } from '@/store/chat/slices/message/selectors/dbMessage';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { useAgentContext } from '../../useAgentContext';
import { normalizeTaskProgress } from './taskProgressAdapter';

const styles = createStaticStyles(({ css }) => ({
  barWrap: css`
    margin-block-end: 2px;
    margin-inline: -16px;
  `,
  chevron: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  progressBadge: css`
    color: ${cssVar.colorTextLightSolid};
  `,
  sectionTitle: css`
    color: ${cssVar.colorTextSecondary};
  `,
  itemRow: css`
    padding-block: 6px;
    padding-inline: 0;
  `,
  textCompleted: css`
    color: ${cssVar.colorTextSecondary};
  `,
  textProcessing: css`
    color: ${cssVar.colorTextSecondary};
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

  return (
    <>
      <Progress
        percent={progress.completionPercent}
        railColor={cssVar.colorFillTertiary}
        showInfo={false}
        strokeColor={cssVar.colorSuccess}
        strokeWidth={4}
      />
      <Flexbox data-testid="workspace-progress" padding={16}>
        <Flexbox horizontal gap={8}>
          <Accordion defaultExpandedKeys={['progress']} gap={0}>
            <AccordionItem
              itemKey={'progress'}
              paddingBlock={0}
              paddingInline={0}
              title={<Text strong>{t('agentWorkspace.progress')}</Text>}
              styles={{
                header: {
                  width: 'fit-content',
                },
              }}
            >
              <div style={{ paddingTop: 2 }}>
                {progress.items.map((item) => {
                  const isCompleted = item.status === 'completed';
                  const isProcessing = item.status === 'processing';

                  return (
                    <Checkbox
                      backgroundColor={cssVar.colorSuccess}
                      checked={isCompleted}
                      key={item.id}
                      shape={'circle'}
                      style={{ borderWidth: 1.5, cursor: 'default', pointerEvents: 'none' }}
                      classNames={{
                        text: cx(
                          styles.textTodo,
                          isCompleted && styles.textCompleted,
                          isProcessing && styles.textProcessing,
                        ),
                        wrapper: styles.itemRow,
                      }}
                      textProps={{
                        type: isCompleted || isProcessing ? 'secondary' : undefined,
                      }}
                    >
                      {item.text}
                    </Checkbox>
                  );
                })}
              </div>
            </AccordionItem>
          </Accordion>
          <Tag
            size={'small'}
            variant={'filled'}
            style={{
              background: cssVar.colorSuccess,
              borderRadius: 999,
              flexShrink: 0,
              minWidth: 42,
              paddingInline: 8,
              textAlign: 'center',
            }}
          >
            <span className={styles.progressBadge}>{progress.completionPercent}%</span>
          </Tag>
        </Flexbox>
      </Flexbox>
    </>
  );
});

ProgressSection.displayName = 'ProgressSection';

export default ProgressSection;
