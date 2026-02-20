import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes } from 'react-router-dom';

import { renderRoutes } from '@/utils/router';

import { mobileRoutes } from './app/[variants]/(mobile)/router/mobileRouter.config';

const App = () => (
  <BrowserRouter>
    <Routes>{renderRoutes(mobileRoutes)}</Routes>
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(<App />);
