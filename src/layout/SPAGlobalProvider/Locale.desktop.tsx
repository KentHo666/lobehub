'use client';

import { ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { type PropsWithChildren, memo, useEffect, useState } from 'react';
import { isRtlLang } from 'rtl-detect';

import { createI18nNext } from '@/locales/create';
import { getAntdLocale } from '@/utils/locale';

import Editor from '@/layout/GlobalProvider/Editor';

// eager: true — dayjs locale fully inlined at build time
const dayjsLocaleModules = import.meta.glob<{ default: ILocale }>(
  '/node_modules/dayjs/locale/*.js',
  { eager: true },
);

const updateDayjs = (lang: string) => {
  const locale = lang.toLowerCase() === 'en-us' ? 'en' : lang.toLowerCase();
  const key = `/node_modules/dayjs/locale/${locale}.js`;
  const mod = dayjsLocaleModules[key] ?? dayjsLocaleModules['/node_modules/dayjs/locale/en.js'];

  if (mod) dayjs.locale((mod as any).default);
};

interface LocaleLayoutProps extends PropsWithChildren {
  antdLocale?: any;
  defaultLang?: string;
}

const Locale = memo<LocaleLayoutProps>(({ children, defaultLang, antdLocale }) => {
  const [i18n] = useState(() => createI18nNext(defaultLang));
  const [lang, setLang] = useState(defaultLang);
  const [locale, setLocale] = useState(antdLocale);

  if (!i18n.instance.isInitialized)
    i18n.init().then(() => {
      if (!lang) return;
      updateDayjs(lang);
    });

  useEffect(() => {
    const handleLang = async (lng: string) => {
      setLang(lng);
      if (lang === lng) return;
      const newLocale = await getAntdLocale(lng);
      setLocale(newLocale);
      updateDayjs(lng);
    };

    i18n.instance.on('languageChanged', handleLang);
    return () => {
      i18n.instance.off('languageChanged', handleLang);
    };
  }, [i18n, lang]);

  const documentDir = isRtlLang(lang!) ? 'rtl' : 'ltr';

  return (
    <ConfigProvider
      direction={documentDir}
      locale={locale}
      theme={{
        components: {
          Button: {
            contentFontSizeSM: 12,
          },
        },
      }}
    >
      <Editor>{children}</Editor>
    </ConfigProvider>
  );
});

Locale.displayName = 'Locale';

export default Locale;
