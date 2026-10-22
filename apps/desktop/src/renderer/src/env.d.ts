import type { WebeepBridge } from '../../shared/ipc';

declare global {
  interface Window {
    readonly webeep: WebeepBridge;
  }
}
