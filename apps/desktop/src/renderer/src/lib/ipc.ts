/*
 * Accesso al main process dal renderer.
 *
 * `invoke` scarta l'`IpcResult`: restituisce i dati o lancia `IpcError`, così
 * TanStack Query gestisce errori e retry nel modo standard.
 */
import type { IpcArgs, IpcChannel, IpcErrorKind, IpcFailure, IpcReturn } from '../../../shared/ipc';

export class IpcError extends Error {
  override readonly name = 'IpcError';
  readonly kind: IpcErrorKind;

  constructor(failure: IpcFailure) {
    super(failure.message);
    this.kind = failure.kind;
  }
}

export const invoke = async <TChannel extends IpcChannel>(
  channel: TChannel,
  ...args: IpcArgs<TChannel>
): Promise<IpcReturn<TChannel>> => {
  const result = await window.webeep.invoke(channel, ...args);
  if (!result.ok) throw new IpcError(result.error);
  return result.data;
};

export const isIpcError = (error: unknown): error is IpcError => error instanceof IpcError;
