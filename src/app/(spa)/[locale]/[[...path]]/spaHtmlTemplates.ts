import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadTemplate(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export const desktopHtmlTemplate = loadTemplate(
  resolve(process.cwd(), 'public/spa/desktop/index.html'),
);

export const mobileHtmlTemplate = loadTemplate(
  resolve(process.cwd(), 'public/spa/mobile/index.html'),
);
