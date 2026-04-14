import { spawn } from 'node:child_process';

import type { ChildProcess } from 'node:child_process';

import { createLogger } from '@/utils/logger';

const logger = createLogger('core:MacOSDoubleOptionMonitor');

export const MACOS_DOUBLE_OPTION_SHORTCUT = 'doubleOption';

const DOUBLE_OPTION_SIGNAL = 'DOUBLE_OPTION';
const OSASCRIPT_PATH = '/usr/bin/osascript';

const MONITOR_SCRIPT = String.raw`
ObjC.import('ApplicationServices');

const leftCommandKeyCode = 55;
const rightCommandKeyCode = 54;
const leftControlKeyCode = 59;
const rightControlKeyCode = 62;
const leftShiftKeyCode = 56;
const rightShiftKeyCode = 60;
const capsLockKeyCode = 57;
const functionKeyCode = 63;
const leftOptionKeyCode = 58;
const rightOptionKeyCode = 61;
const doubleTapIntervalMs = 300;
const pollIntervalSeconds = 0.02;

const isKeyPressed = (keyCode) =>
  Boolean($.CGEventSourceKeyState($.kCGEventSourceStateCombinedSessionState, keyCode));

let lastOptionDown = false;
let lastOptionDownAt = 0;

while (true) {
  const optionDown = isKeyPressed(leftOptionKeyCode) || isKeyPressed(rightOptionKeyCode);
  const hasOtherModifiers =
    isKeyPressed(leftCommandKeyCode) ||
    isKeyPressed(rightCommandKeyCode) ||
    isKeyPressed(leftControlKeyCode) ||
    isKeyPressed(rightControlKeyCode) ||
    isKeyPressed(leftShiftKeyCode) ||
    isKeyPressed(rightShiftKeyCode) ||
    isKeyPressed(capsLockKeyCode) ||
    isKeyPressed(functionKeyCode);

  if (optionDown && !lastOptionDown && !hasOtherModifiers) {
    const now = Date.now();

    if (now - lastOptionDownAt <= doubleTapIntervalMs) {
      console.log('DOUBLE_OPTION');
      lastOptionDownAt = 0;
    } else {
      lastOptionDownAt = now;
    }
  }

  if (hasOtherModifiers) {
    lastOptionDownAt = 0;
  }

  lastOptionDown = optionDown;
  delay(pollIntervalSeconds);
}
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

    const child = spawn(OSASCRIPT_PATH, ['-l', 'JavaScript', '-e', MONITOR_SCRIPT], {
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
