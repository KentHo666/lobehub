import { spawn, type ChildProcess } from 'node:child_process';

import { createLogger } from '@/utils/logger';

const logger = createLogger('core:MacOSDoubleOptionMonitor');

export const MACOS_DOUBLE_OPTION_SHORTCUT = 'doubleOption';

const DOUBLE_OPTION_SIGNAL = 'DOUBLE_OPTION';

const MONITOR_SCRIPT = String.raw`
ObjC.import('Cocoa');

const optionMask = Number($.NSEventModifierFlagOption);
const blockedMask =
  Number($.NSEventModifierFlagCommand) |
  Number($.NSEventModifierFlagControl) |
  Number($.NSEventModifierFlagShift) |
  Number($.NSEventModifierFlagCapsLock) |
  Number($.NSEventModifierFlagFunction);

const leftOptionKeyCode = 58;
const rightOptionKeyCode = 61;
const doubleTapIntervalMs = 300;

let lastOptionDownAt = 0;

const handler = ObjC.block('void', ['id'], function(event) {
  const keyCode = Number(event.keyCode);

  if (keyCode !== leftOptionKeyCode && keyCode !== rightOptionKeyCode) return;

  const flags = Number(event.modifierFlags);
  const optionDown = (flags & optionMask) !== 0;
  const hasOtherModifiers = (flags & blockedMask) !== 0;

  if (!optionDown || hasOtherModifiers) return;

  const now = Date.now();

  if (now - lastOptionDownAt <= doubleTapIntervalMs) {
    console.log('DOUBLE_OPTION');
    lastOptionDownAt = 0;
    return;
  }

  lastOptionDownAt = now;
});

$.NSEvent.addGlobalMonitorForEventsMatchingMaskHandler($.NSEventMaskFlagsChanged, handler);
$.NSRunLoop.currentRunLoop.run();
`;

export class MacOSDoubleOptionMonitor {
  private process: ChildProcess | null = null;
  private stdoutBuffer = '';

  constructor(private readonly onTrigger: () => void) {}

  get isRunning() {
    return this.process !== null;
  }

  start() {
    if (process.platform !== 'darwin' || this.process) return;

    logger.info('Starting macOS double Option monitor');

    const child = spawn('osascript', ['-l', 'JavaScript', '-e', MONITOR_SCRIPT], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process = child;

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      this.handleStdout(chunk.toString());
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (!message) return;
      logger.warn(`monitor stderr: ${message}`);
    });

    child.on('error', (error) => {
      logger.error('Failed to start macOS double Option monitor:', error);
      this.process = null;
      this.stdoutBuffer = '';
    });

    child.on('exit', (code, signal) => {
      logger.info(`macOS double Option monitor exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      this.process = null;
      this.stdoutBuffer = '';
    });
  }

  stop() {
    if (!this.process) return;

    logger.info('Stopping macOS double Option monitor');
    this.process.kill();
    this.process = null;
    this.stdoutBuffer = '';
  }

  private handleStdout(chunk: string) {
    this.stdoutBuffer += chunk;

    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line === DOUBLE_OPTION_SIGNAL) {
        this.onTrigger();
        continue;
      }

      logger.debug(`monitor stdout: ${line}`);
    }
  }
}
