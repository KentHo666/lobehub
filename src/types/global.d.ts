import 'antd-style';

import { type LobeCustomStylish, type LobeCustomToken } from '@lobehub/ui';
import { type AntdToken } from 'antd-style/lib/types/theme';

declare module 'antd-style' {
  export interface CustomToken extends LobeCustomToken {}

  export interface CustomStylish extends LobeCustomStylish {}
}

declare module 'styled-components' {
  export interface DefaultTheme extends AntdToken, LobeCustomToken {}
}

declare global {
  interface Window {
    __SERVER_CONFIG__: import('./spaServerConfig').SPAServerConfig | undefined;
    lobeEnv?: {
      darwinMajorVersion?: number;
      isMacTahoe?: boolean;
    };
  }

  /** Vite define: current bundle is mobile variant */
  const __MOBILE__: boolean;
}
