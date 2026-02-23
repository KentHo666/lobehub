import './initialize';

import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes } from 'react-router-dom';

import SPAGlobalProvider from '@/layout/SPAGlobalProvider';
import { renderRoutes } from '@/utils/router';

import { desktopRoutes } from './app/[variants]/router/desktopRouter.config';

const debugProxyBase = '/__dangerous_local_dev_proxy';
const basename =
  window.__DEBUG_PROXY__ || window.location.pathname.startsWith(debugProxyBase)
    ? debugProxyBase
    : undefined;

const App = () => (
  <SPAGlobalProvider>
    <BrowserRouter basename={basename}>
      <Routes>{renderRoutes(desktopRoutes)}</Routes>
    </BrowserRouter>
  </SPAGlobalProvider>
);

createRoot(document.getElementById('root')!).render(<App />);
