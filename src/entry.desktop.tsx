import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes } from 'react-router-dom';

import SPAGlobalProvider from '@/layout/SPAGlobalProvider';
import { renderRoutes } from '@/utils/router';

import { desktopRoutes } from './app/[variants]/router/desktopRouter.config';

const App = () => (
  <SPAGlobalProvider>
    <BrowserRouter>
      <Routes>{renderRoutes(desktopRoutes)}</Routes>
    </BrowserRouter>
  </SPAGlobalProvider>
);

createRoot(document.getElementById('root')!).render(<App />);
