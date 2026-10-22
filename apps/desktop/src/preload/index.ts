/*
 * Preload: espone `window.webeep` (tipo `WebeepBridge`) e nient'altro.
 * Niente accesso diretto a `ipcRenderer` dal renderer.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { toAssetUrl, type IpcEventName, type IpcEvents, type WebeepBridge } from '../shared/ipc.js';

const bridge: WebeepBridge = {
  kind: 'electron',
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: <TEvent extends IpcEventName>(event: TEvent, listener: (payload: IpcEvents[TEvent]) => void) => {
    const wrapped = (_event: IpcRendererEvent, payload: IpcEvents[TEvent]): void => listener(payload);
    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.off(event, wrapped);
    };
  },
  assetUrl: toAssetUrl,
  platform: process.platform,
};

contextBridge.exposeInMainWorld('webeep', bridge);
