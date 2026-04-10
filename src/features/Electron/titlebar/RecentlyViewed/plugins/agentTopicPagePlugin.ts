import { FileText } from 'lucide-react';

import { getRouteById } from '@/config/routes';
import { SESSION_CHAT_PAGE_URL } from '@/const/url';
import { useChatStore } from '@/store/chat';

import { type AgentTopicPageParams, type PageReference, type ResolvedPageData } from '../types';
import { type PluginContext, type RecentlyViewedPlugin } from './types';
import { createPageReference } from './types';

const AGENT_PAGE_PATH_REGEX = /^\/agent\/([^/?]+)\/page$/;
const LEGACY_AGENT_TOPIC_PAGE_PATH_REGEX = /^\/agent\/([^/?]+)\/(tpc_[^/?]+)\/page$/;

const pageIcon = getRouteById('page')?.icon || FileText;

export const agentTopicPagePlugin: RecentlyViewedPlugin<'agent-topic-page'> = {
  checkExists(reference: PageReference<'agent-topic-page'>, ctx: PluginContext): boolean {
    const { agentId, topicId } = reference.params;
    const agentMeta = ctx.getAgentMeta(agentId);

    if (agentMeta === undefined || Object.keys(agentMeta).length === 0) return false;
    if (!topicId) return true;

    return ctx.getTopic(topicId) !== undefined;
  },

  generateId(reference: PageReference<'agent-topic-page'>): string {
    const { agentId, topicId } = reference.params;
    return topicId ? `agent-topic-page:${agentId}:${topicId}` : `agent-topic-page:${agentId}`;
  },

  generateUrl(reference: PageReference<'agent-topic-page'>): string {
    const { agentId } = reference.params;
    return SESSION_CHAT_PAGE_URL(agentId);
  },

  getDefaultIcon() {
    return pageIcon;
  },

  matchUrl(pathname: string, _searchParams: URLSearchParams): boolean {
    return (
      AGENT_PAGE_PATH_REGEX.test(pathname) || LEGACY_AGENT_TOPIC_PAGE_PATH_REGEX.test(pathname)
    );
  },

  onActivate(reference: PageReference<'agent-topic-page'>) {
    if (reference.params.topicId) {
      useChatStore.getState().switchTopic(reference.params.topicId);
    }
  },

  parseUrl(
    pathname: string,
    _searchParams: URLSearchParams,
  ): PageReference<'agent-topic-page'> | null {
    const agentPageMatch = pathname.match(AGENT_PAGE_PATH_REGEX);
    if (agentPageMatch) {
      const [, agentId] = agentPageMatch;
      const params: AgentTopicPageParams = { agentId };
      const id = this.generateId({ params } as PageReference<'agent-topic-page'>);

      return createPageReference('agent-topic-page', params, id);
    }

    const legacyMatch = pathname.match(LEGACY_AGENT_TOPIC_PAGE_PATH_REGEX);
    if (!legacyMatch) return null;

    const [, agentId, topicId] = legacyMatch;
    const params: AgentTopicPageParams = { agentId, topicId };
    const id = this.generateId({ params } as PageReference<'agent-topic-page'>);
    return createPageReference('agent-topic-page', params, id);
  },

  priority: 30,

  resolve(reference: PageReference<'agent-topic-page'>, ctx: PluginContext): ResolvedPageData {
    const { agentId, topicId } = reference.params;
    const agentMeta = ctx.getAgentMeta(agentId);
    const topic = topicId ? ctx.getTopic(topicId) : undefined;
    const cached = reference.cached;

    const agentExists = agentMeta !== undefined && Object.keys(agentMeta).length > 0;
    const topicExists = !topicId || topic !== undefined;
    const hasStoreData = agentExists && topicExists;

    return {
      avatar: agentMeta?.avatar ?? cached?.avatar,
      backgroundColor: agentMeta?.backgroundColor ?? cached?.backgroundColor,
      exists: hasStoreData || cached !== undefined,
      icon: this.getDefaultIcon!(),
      reference,
      title:
        cached?.title ||
        topic?.title ||
        agentMeta?.title ||
        ctx.t('navigation.page', { ns: 'electron' }),
      url: this.generateUrl(reference),
    };
  },

  type: 'agent-topic-page',
};
