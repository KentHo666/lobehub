import { normalizeLocale } from '@/locales/resources';

// eager: true — antd locale fully inlined at build time
const antdLocaleModules = import.meta.glob('/node_modules/antd/es/locale/*.js', { eager: true });

export const getAntdLocale = async (lang?: string) => {
  let normalLang: any = normalizeLocale(lang);

  // due to antd only have ar-EG locale, we need to convert ar to ar-EG
  // refs: https://ant.design/docs/react/i18n
  if (normalLang === 'ar') normalLang = 'ar-EG';

  const localePath = `/node_modules/antd/es/locale/${normalLang.replace('-', '_')}.js`;
  const mod = antdLocaleModules[localePath];

  if (!mod) {
    throw new Error(`Unsupported antd locale: ${normalLang}`);
  }

  return (mod as any).default;
};
