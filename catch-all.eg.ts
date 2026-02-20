import { type NextRequest } from 'next/server';
import { isRtlLang } from 'rtl-detect';

import { getServerFeatureFlagsValue } from '@/config/featureFlags';
import { DEFAULT_LANG, LOBE_LOCALE_COOKIE } from '@/const/locale';
import { analyticsEnv } from '@/envs/analytics';
import { appEnv } from '@/envs/app';
import { fileEnv } from '@/envs/file';
import { pythonEnv } from '@/envs/python';
import { getServerGlobalConfig } from '@/server/globalConfig';
import { serializeForHtml } from '@/server/utils/serializeForHtml';
import {
  type AnalyticsConfig,
  type SPAClientEnv,
  type SPAServerConfig,
  type SPAThemeConfig,
} from '@/types/spaServerConfig';
import { parseBrowserLanguage } from '@/utils/locale';

import { desktopHtmlTemplate, mobileHtmlTemplate } from './spaHtmlTemplates';

const isDev = process.env.NODE_ENV === 'development';
const VITE_DEV_ORIGIN = process.env.VITE_DEV_ORIGIN || 'http://localhost:3011';

async function rewriteViteAssetUrls(html: string): Promise<string> {
  const { parseHTML } = await import('linkedom');
  const { document } = parseHTML(html);

  document.querySelectorAll('script[src]').forEach((el) => {
    const src = el.getAttribute('src');
    if (src && src.startsWith('/')) {
      el.setAttribute('src', `${VITE_DEV_ORIGIN}${src}`);
    }
  });

  document.querySelectorAll('link[href]').forEach((el) => {
    const href = el.getAttribute('href');
    if (href && href.startsWith('/')) {
      el.setAttribute('href', `${VITE_DEV_ORIGIN}${href}`);
    }
  });

  // Rewrite inline module scripts (e.g., Vite's React refresh preamble)
  document.querySelectorAll('script[type="module"]:not([src])').forEach((el) => {
    const text = el.textContent || '';
    if (text.includes('/@')) {
      el.textContent = text.replaceAll(
        /from\s+["'](\/[@\w].*?)["']/g,
        (_match, p) => `from "${VITE_DEV_ORIGIN}${p}"`,
      );
    }
  });

  // Patch Worker constructor to wrap cross-origin Vite URLs as blob URLs
  const workerPatch = document.createElement('script');
  workerPatch.textContent = `(function(){
var O=globalThis.Worker;
globalThis.Worker=function(u,o){
var h=typeof u==='string'?u:u instanceof URL?u.href:'';
if(h.startsWith('${VITE_DEV_ORIGIN}')){
var b=new Blob(['import "'+h+'";'],{type:'application/javascript'});
return new O(URL.createObjectURL(b),Object.assign({},o,{type:'module'}));
}return new O(u,o)};
globalThis.Worker.prototype=O.prototype;
})();`;
  const head = document.querySelector('head');
  if (head?.firstChild) {
    head.insertBefore(workerPatch, head.firstChild);
  }

  return document.toString();
}

async function getTemplate(isMobile: boolean): Promise<string> {
  if (isDev) {
    const res = await fetch(VITE_DEV_ORIGIN);
    const html = await res.text();
    return await rewriteViteAssetUrls(html);
  }

  if (isMobile) {
    return mobileHtmlTemplate;
  }
  return desktopHtmlTemplate;
}

function buildAnalyticsConfig(): AnalyticsConfig {
  const config: AnalyticsConfig = {};

  if (analyticsEnv.ENABLE_GOOGLE_ANALYTICS && analyticsEnv.GOOGLE_ANALYTICS_MEASUREMENT_ID) {
    config.google = { measurementId: analyticsEnv.GOOGLE_ANALYTICS_MEASUREMENT_ID };
  }

  if (analyticsEnv.ENABLED_PLAUSIBLE_ANALYTICS && analyticsEnv.PLAUSIBLE_DOMAIN) {
    config.plausible = {
      domain: analyticsEnv.PLAUSIBLE_DOMAIN,
      scriptBaseUrl: analyticsEnv.PLAUSIBLE_SCRIPT_BASE_URL,
    };
  }

  if (analyticsEnv.ENABLED_UMAMI_ANALYTICS && analyticsEnv.UMAMI_WEBSITE_ID) {
    config.umami = {
      scriptUrl: analyticsEnv.UMAMI_SCRIPT_URL,
      websiteId: analyticsEnv.UMAMI_WEBSITE_ID,
    };
  }

  if (analyticsEnv.ENABLED_CLARITY_ANALYTICS && analyticsEnv.CLARITY_PROJECT_ID) {
    config.clarity = { projectId: analyticsEnv.CLARITY_PROJECT_ID };
  }

  if (analyticsEnv.ENABLED_POSTHOG_ANALYTICS && analyticsEnv.POSTHOG_KEY) {
    config.posthog = {
      debug: analyticsEnv.DEBUG_POSTHOG_ANALYTICS,
      host: analyticsEnv.POSTHOG_HOST,
      key: analyticsEnv.POSTHOG_KEY,
    };
  }

  if (analyticsEnv.REACT_SCAN_MONITOR_API_KEY) {
    config.reactScan = { apiKey: analyticsEnv.REACT_SCAN_MONITOR_API_KEY };
  }

  if (analyticsEnv.ENABLE_VERCEL_ANALYTICS) {
    config.vercel = {
      debug: analyticsEnv.DEBUG_VERCEL_ANALYTICS,
      enabled: true,
    };
  }

  if (analyticsEnv.DESKTOP_PROJECT_ID && analyticsEnv.DESKTOP_UMAMI_BASE_URL) {
    config.desktop = {
      baseUrl: analyticsEnv.DESKTOP_UMAMI_BASE_URL,
      projectId: analyticsEnv.DESKTOP_PROJECT_ID,
    };
  }

  return config;
}

function buildThemeConfig(): SPAThemeConfig {
  return {
    cdnUseGlobal: appEnv.CDN_USE_GLOBAL,
    customFontFamily: appEnv.CUSTOM_FONT_FAMILY,
    customFontURL: appEnv.CUSTOM_FONT_URL,
  };
}

function buildClientEnv(): SPAClientEnv {
  return {
    marketBaseUrl: appEnv.NEXT_PUBLIC_MARKET_BASE_URL,
    pyodideIndexUrl: pythonEnv.NEXT_PUBLIC_PYODIDE_INDEX_URL,
    pyodidePipIndexUrl: pythonEnv.NEXT_PUBLIC_PYODIDE_PIP_INDEX_URL,
    s3FilePath: fileEnv.NEXT_PUBLIC_S3_FILE_PATH,
  };
}

export async function GET(request: NextRequest) {
  const ua = request.headers.get('user-agent') || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

  const cookieLocale = request.cookies.get(LOBE_LOCALE_COOKIE)?.value;
  const browserLanguage = parseBrowserLanguage(request.headers, DEFAULT_LANG);
  const locale = cookieLocale || browserLanguage;

  const serverConfig = await getServerGlobalConfig();
  const featureFlags = getServerFeatureFlagsValue();
  const analyticsConfig = buildAnalyticsConfig();
  const theme = buildThemeConfig();
  const clientEnv = buildClientEnv();

  const spaConfig: SPAServerConfig = {
    analyticsConfig,
    clientEnv,
    config: serverConfig,
    featureFlags,
    isMobile,
    locale,
    theme,
  };

  const dir = isRtlLang(locale) ? 'rtl' : 'ltr';

  let html = await getTemplate(isMobile);

  html = html.replace(
    /window\.__SERVER_CONFIG__\s*=\s*undefined;\s*\/\*\s*SERVER_CONFIG\s*\*\//,
    `window.__SERVER_CONFIG__ = ${serializeForHtml(spaConfig)};`,
  );

  html = html.replace('<!--LOCALE-->', locale);
  html = html.replace('<!--DIR-->', dir);
  html = html.replace('<!--SEO_META-->', '');
  html = html.replace('<!--ANALYTICS_SCRIPTS-->', '');

  return new Response(html, {
    headers: {
      'cache-control': 'private, no-cache',
      'content-type': 'text/html; charset=utf-8',
      'vary': 'Accept-Language, User-Agent, Cookie',
    },
  });
}
