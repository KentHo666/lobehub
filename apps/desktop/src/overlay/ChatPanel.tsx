import type {
  ScreenCaptureAgentOption,
  ScreenCaptureModelOption,
  ScreenCaptureOverlayTheme,
} from '@lobechat/electron-client-ipc';
import { ModelIcon } from '@lobehub/icons';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import OverlayAvatar from './Avatar';
import * as styles from './chatPanel.css.ts';
import { cn } from './cn';
import { OVERLAY_COPY, OVERLAY_LAYOUT, OVERLAY_SHORTCUTS } from './constants';
import {
  createDockedPanelPlacement,
  createInitialPanelPlacement,
  type PanelPlacement,
  resolvePanelPlacement,
} from './panelPlacement';
import { computeDockPosition, connectorPoint, type DockResult, type Rect } from './useDockPosition';

export interface ChatPanelSelection {
  dataUrl: string;
  label: string;
  rect: Rect;
}

export interface ChatPanelSubmitPayload {
  agentId?: string;
  modelId?: string;
  prompt: string;
  provider?: string;
  selection: ChatPanelSelection;
}

export interface ChatPanelProps {
  agentId?: string;
  agents?: ScreenCaptureAgentOption[];
  hidden?: boolean;
  modelId?: string;
  models?: ScreenCaptureModelOption[];
  onClearSelection: () => void;
  onSubmit: (payload: ChatPanelSubmitPayload) => void;
  selection: ChatPanelSelection | null;
  theme?: ScreenCaptureOverlayTheme;
  viewportHeight: number;
  viewportWidth: number;
}

const formatBytes = (rect: Rect): string =>
  `${Math.round(rect.width)} × ${Math.round(rect.height)} · ${OVERLAY_COPY.selectionFormatLabel}`;

const SendIcon = () => (
  <svg
    aria-hidden="true"
    fill="currentColor"
    focusable="false"
    height={14}
    viewBox="0 0 14 14"
    width={14}
  >
    <path d="M13.55 0.45a.7.7 0 0 1 .16.76l-4.8 12a.7.7 0 0 1-1.27.06L5.5 8.5 0.73 6.36a.7.7 0 0 1 .06-1.3l12-4.77a.7.7 0 0 1 .76.16Z" />
  </svg>
);

const ChatPanel = memo<ChatPanelProps>(
  ({
    agentId: initialAgentId,
    agents,
    hidden = false,
    modelId: initialModelId,
    models,
    onClearSelection,
    onSubmit,
    selection,
    theme,
    viewportHeight,
    viewportWidth,
  }) => {
    const [prompt, setPrompt] = useState('');
    const [agentId, setAgentId] = useState<string | undefined>(initialAgentId);
    const [modelId, setModelId] = useState<string | undefined>(initialModelId);
    const lastSelectionPlacementRef = useRef<PanelPlacement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const selected = !!selection;

    const currentAgent = useMemo(
      () => agents?.find((item) => item.id === agentId),
      [agents, agentId],
    );
    const currentModel = useMemo(
      () => models?.find((item) => item.id === modelId),
      [models, modelId],
    );

    useEffect(() => {
      if (!initialAgentId) return;
      setAgentId(initialAgentId);
    }, [initialAgentId]);

    useEffect(() => {
      if (!initialModelId) return;
      setModelId(initialModelId);
    }, [initialModelId]);

    useEffect(() => {
      if (!agents?.length) return;
      if (agentId && agents.some((item) => item.id === agentId)) return;

      const nextAgentId =
        (initialAgentId && agents.some((item) => item.id === initialAgentId)
          ? initialAgentId
          : undefined) ?? agents[0]?.id;

      if (nextAgentId !== agentId) {
        setAgentId(nextAgentId);
      }
    }, [agents, agentId, initialAgentId]);

    useEffect(() => {
      if (!models?.length) return;
      if (modelId && models.some((item) => item.id === modelId)) return;

      const nextModelId =
        (initialModelId && models.some((item) => item.id === initialModelId)
          ? initialModelId
          : undefined) ?? models[0]?.id;

      if (nextModelId !== modelId) {
        setModelId(nextModelId);
      }
    }, [initialModelId, modelId, models]);

    const initialPlacement = useMemo(
      () => createInitialPanelPlacement(viewportWidth, viewportHeight),
      [viewportWidth, viewportHeight],
    );

    const dock: DockResult | null = useMemo(() => {
      if (!selection) return null;
      return computeDockPosition({
        gap: OVERLAY_LAYOUT.dockGap,
        panelHeight: OVERLAY_LAYOUT.panelHeightEstimate,
        panelWidth: OVERLAY_LAYOUT.panelWidthDocked,
        rect: selection.rect,
        viewportHeight,
        viewportWidth,
      });
    }, [selection, viewportWidth, viewportHeight]);

    const dockedPlacement: PanelPlacement | null = dock ? createDockedPanelPlacement(dock) : null;

    useEffect(() => {
      if (dockedPlacement) {
        lastSelectionPlacementRef.current = dockedPlacement;
      }
    }, [dockedPlacement]);

    const placement = resolvePanelPlacement({
      dockedPlacement,
      initialPlacement,
      lastSelectionPlacement: lastSelectionPlacementRef.current,
    });

    const connector = useMemo(() => {
      if (!selection || !dock || dock.side === 'edge') return null;
      const pt = connectorPoint(selection.rect, dock.side);
      return {
        left: pt.x - OVERLAY_LAYOUT.connectorSize / 2,
        top: pt.y - OVERLAY_LAYOUT.connectorSize / 2,
      };
    }, [selection, dock]);

    const themeStyle = useMemo<CSSProperties | undefined>(() => {
      if (!theme) return undefined;

      return {
        '--lobe-overlay-bg-elevated': theme.colorBgElevated,
        '--lobe-overlay-border-secondary': theme.colorBorderSecondary,
        '--lobe-overlay-fill': theme.colorFill,
        '--lobe-overlay-fill-quaternary': theme.colorFillQuaternary,
        '--lobe-overlay-fill-secondary': theme.colorFillSecondary,
        '--lobe-overlay-fill-tertiary': theme.colorFillTertiary,
        '--lobe-overlay-panel-border': theme.panelBorder,
        '--lobe-overlay-primary': theme.colorPrimary,
        '--lobe-overlay-primary-active': theme.colorPrimaryActive,
        '--lobe-overlay-primary-hover': theme.colorPrimaryHover,
        '--lobe-overlay-shadow': theme.panelShadow,
        '--lobe-overlay-text': theme.colorText,
        '--lobe-overlay-text-light-solid': theme.colorTextLightSolid,
        '--lobe-overlay-text-quaternary': theme.colorTextQuaternary,
        '--lobe-overlay-text-secondary': theme.colorTextSecondary,
        '--lobe-overlay-text-tertiary': theme.colorTextTertiary,
      } as CSSProperties;
    }, [theme]);

    useLayoutEffect(() => {
      if (selected && !hidden && textareaRef.current) {
        textareaRef.current.focus();
      }
    }, [hidden, selected]);

    useEffect(() => {
      if (!selected) setPrompt('');
    }, [selected]);

    const submit = useCallback(() => {
      if (!selection || !prompt.trim()) return;
      onSubmit({
        agentId,
        modelId,
        prompt: prompt.trim(),
        provider: currentModel?.provider,
        selection,
      });
    }, [selection, prompt, agentId, modelId, currentModel, onSubmit]);

    const handleKeyDown = useCallback(
      (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          submit();
        }
      },
      [submit],
    );

    const canSend = selected && prompt.trim().length > 0;

    const handleAgentChange = useCallback((e: ReactChangeEvent<HTMLSelectElement>) => {
      setAgentId(e.target.value || undefined);
    }, []);

    const handleModelChange = useCallback((e: ReactChangeEvent<HTMLSelectElement>) => {
      setModelId(e.target.value || undefined);
    }, []);

    const hasAgents = !!agents && agents.length > 0;
    const hasModels = !!models && models.length > 0;

    return (
      <>
        {connector && (
          <div
            className={cn(
              styles.connector,
              selected && styles.connectorVisible,
              hidden && styles.connectorHidden,
            )}
            style={{ ...(themeStyle || {}), left: connector.left, top: connector.top }}
          />
        )}
        <div
          aria-hidden={hidden}
          className={cn(
            styles.panel,
            !selected && styles.initialEnter,
            hidden && styles.panelHidden,
          )}
          style={{
            ...(themeStyle || {}),
            cursor: 'default',
            left: placement.left,
            top: placement.top,
            width: placement.width,
          }}
          onMouseDown={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseMove={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
          onMouseUp={(e: ReactMouseEvent<HTMLDivElement>) => e.stopPropagation()}
        >
          {selection && (
            <div className={styles.selectionSummary}>
              <div
                aria-label="screenshot thumbnail"
                className={styles.thumb}
                style={{ backgroundImage: `url(${selection.dataUrl})` }}
              />
              <div className={styles.summaryText}>
                <div className={styles.summaryTitle}>
                  {OVERLAY_COPY.screenshotLabel} · {selection.label}
                </div>
                <div className={styles.summaryMeta}>{formatBytes(selection.rect)}</div>
              </div>
              <button
                aria-label={OVERLAY_COPY.removeSelectionLabel}
                className={styles.iconBtn}
                type="button"
                onClick={onClearSelection}
              >
                <XIcon size={14} strokeWidth={2} />
              </button>
            </div>
          )}

          <div className={styles.inputRow}>
            <textarea
              className={styles.textarea}
              ref={textareaRef}
              rows={2}
              spellCheck={false}
              value={prompt}
              placeholder={
                selected ? OVERLAY_COPY.selectedPlaceholder : OVERLAY_COPY.idlePlaceholder
              }
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className={styles.actionBar}>
            <div className={styles.actionBarLeft}>
              <label
                aria-label={OVERLAY_COPY.agentSelectLabel}
                className={cn(styles.selectChip, !hasAgents && styles.selectChipDisabled)}
              >
                <OverlayAvatar
                  avatar={currentAgent?.avatar}
                  background={currentAgent?.backgroundColor}
                  size={18}
                  title={currentAgent?.title}
                />
                <span className={styles.chipLabel}>
                  {currentAgent?.title ?? OVERLAY_COPY.agentSelectPlaceholder}
                </span>
                <ChevronDownIcon className={styles.chevron} size={12} strokeWidth={2} />
                <select
                  aria-label={OVERLAY_COPY.agentSelectLabel}
                  className={styles.nativeSelect}
                  disabled={!hasAgents}
                  value={agentId ?? ''}
                  onChange={handleAgentChange}
                >
                  {!hasAgents && <option value="">{OVERLAY_COPY.agentSelectPlaceholder}</option>}
                  {agents?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.avatar && typeof item.avatar === 'string' && item.avatar.length <= 4
                        ? `${item.avatar} ${item.title}`
                        : item.title}
                    </option>
                  ))}
                </select>
              </label>

              <label
                aria-label={OVERLAY_COPY.modelSelectLabel}
                className={cn(styles.selectChip, !hasModels && styles.selectChipDisabled)}
              >
                {currentModel ? (
                  <span className={styles.modelIconBox}>
                    <ModelIcon model={currentModel.id} size={16} />
                  </span>
                ) : (
                  <span className={styles.modelIconBoxFallback} />
                )}
                <span className={styles.chipLabel}>
                  {currentModel?.displayName ??
                    currentModel?.id ??
                    OVERLAY_COPY.modelSelectPlaceholder}
                </span>
                <ChevronDownIcon className={styles.chevron} size={12} strokeWidth={2} />
                <select
                  aria-label={OVERLAY_COPY.modelSelectLabel}
                  className={styles.nativeSelect}
                  disabled={!hasModels}
                  value={modelId ?? ''}
                  onChange={handleModelChange}
                >
                  {!hasModels && <option value="">{OVERLAY_COPY.modelSelectPlaceholder}</option>}
                  {models?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.displayName ?? item.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.actionBarRight}>
              <button
                aria-label={OVERLAY_COPY.sendAriaLabel}
                className={styles.sendBtn}
                disabled={!canSend}
                title={`${OVERLAY_COPY.sendAriaLabel} · ${OVERLAY_SHORTCUTS.send}\n${OVERLAY_COPY.newlineHint} · ${OVERLAY_SHORTCUTS.newline}\n${OVERLAY_COPY.closeLabel} · ${OVERLAY_SHORTCUTS.close}`}
                type="button"
                onClick={submit}
              >
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </>
    );
  },
);

ChatPanel.displayName = 'ChatPanel';

export default ChatPanel;
