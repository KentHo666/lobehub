import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes } from 'react-router-dom';

import { renderRoutes } from '@/utils/router';

import { desktopRoutes } from './app/[variants]/router/desktopRouter.config';

const App = () => (
  <BrowserRouter>
    <Routes>{renderRoutes(desktopRoutes)}</Routes>
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(<App />);
