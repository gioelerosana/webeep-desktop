/*
 * Error boundary attorno all'app: un errore di render non deve lasciare una schermata
 * bianca. React intercetta questi errori solo con una classe (`componentDidCatch`):
 * è l'unica classe del renderer, e non si aggiunge una dipendenza per evitarla.
 */
import { Component, type ReactNode } from 'react';
import { CrashFallback } from './CrashFallback';
import { recordRendererError } from './rendererErrors';

type CrashBoundaryProps = { readonly children: ReactNode };
type CrashBoundaryState = { readonly failed: boolean };

export class CrashBoundary extends Component<CrashBoundaryProps, CrashBoundaryState> {
  override state: CrashBoundaryState = { failed: false };

  static getDerivedStateFromError(): CrashBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    recordRendererError(error);
  }

  override render(): ReactNode {
    return this.state.failed ? <CrashFallback /> : this.props.children;
  }
}
