import { useCallback } from 'react';
import { useParams } from 'react-router-dom';

import { SESSION_CHAT_TOPIC_URL, SESSION_CHAT_URL } from '@/const/url';
import { useQueryRoute } from '@/hooks/useQueryRoute';
import { usePathname } from '@/libs/router/navigation';
import { useChatStore } from '@/store/chat';
import { useGlobalStore } from '@/store/global';

/**
 * Hook to handle topic navigation with automatic route detection
 * If in agent sub-route (e.g., /agent/:aid/profile), navigate back to chat first
 */
export const useTopicNavigation = () => {
  const pathname = usePathname();
  const params = useParams<{ aid?: string; topicId?: string }>();
  const [activeAgentId, activeTopicId] = useChatStore((s) => [s.activeAgentId, s.activeTopicId]);
  const router = useQueryRoute();
  const toggleConfig = useGlobalStore((s) => s.toggleMobileTopic);
  const switchTopic = useChatStore((s) => s.switchTopic);
  const routeAgentId = params.aid ?? activeAgentId;
  const routeTopicId = params.topicId ?? activeTopicId ?? undefined;

  const isInAgentSubRoute = useCallback(() => {
    if (!routeAgentId) return false;
    const agentBasePath = routeTopicId
      ? SESSION_CHAT_TOPIC_URL(routeAgentId, routeTopicId)
      : SESSION_CHAT_URL(routeAgentId);

    // If pathname has more segments after /agent/:aid, it's a sub-route
    return (
      pathname.startsWith(agentBasePath) &&
      pathname !== agentBasePath &&
      pathname !== `${agentBasePath}/`
    );
  }, [pathname, routeAgentId, routeTopicId]);

  const navigateToTopic = useCallback(
    (topicId?: string) => {
      // If in agent sub-route, navigate back to agent chat first
      if (isInAgentSubRoute() && routeAgentId) {
        const basePath = topicId
          ? SESSION_CHAT_TOPIC_URL(routeAgentId, topicId)
          : SESSION_CHAT_URL(routeAgentId);

        // Include topicId in URL when navigating from sub-route
        router.push(basePath);
        toggleConfig(false);
        return;
      }

      switchTopic(topicId);
      toggleConfig(false);
    },
    [isInAgentSubRoute, routeAgentId, router, switchTopic, toggleConfig],
  );

  return {
    isInAgentSubRoute: isInAgentSubRoute(),
    navigateToTopic,
  };
};
