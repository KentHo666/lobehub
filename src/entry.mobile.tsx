import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes } from 'react-router-dom';

import SPAGlobalProvider from '@/layout/SPAGlobalProvider';
import { renderRoutes } from '@/utils/router';

import { mobileRoutes } from './app/[variants]/(mobile)/router/mobileRouter.config';

const App = () => (
  <SPAGlobalProvider>
    <BrowserRouter>
      <Routes>{renderRoutes(mobileRoutes)}</Routes>
    </BrowserRouter>
  </SPAGlobalProvider>
);

createRoot(document.getElementById('root')!).render(<App />);
