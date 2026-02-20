export const isDesktop =
  typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_IS_DESKTOP_APP === '1'
    : process.env.NEXT_PUBLIC_IS_DESKTOP_APP === '1';
