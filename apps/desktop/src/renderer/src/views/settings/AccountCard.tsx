import { Button, Card, CardHeader, Skeleton } from '@webeep/ui-kit';
import type { ReactNode } from 'react';
import { useAuthState, useLogout } from '../../lib/queries';

export const AccountCard = (): ReactNode => {
  const authQuery = useAuthState();
  const logout = useLogout();
  const authState = authQuery.data;

  return (
    <Card>
      <CardHeader
        title="Account"
        description="Accesso a WeBeep su questo computer."
        action={
          <Button variant="destructive" size="sm" loading={logout.isPending} onClick={() => logout.mutate()}>
            Esci
          </Button>
        }
      />
      <div className="flex flex-col gap-1 px-4 py-3">
        {authQuery.isPending ? <Skeleton className="h-4 w-1/2" /> : null}
        {authState?.status === 'signed-in' ? (
          <>
            <p className="text-sm font-medium">{authState.user.fullname}</p>
            <p className="font-mono text-sm text-muted-foreground">{authState.user.username}</p>
          </>
        ) : null}
        <p className="text-2xs text-muted-foreground">Il token di accesso è salvato cifrato su questo computer.</p>
      </div>
    </Card>
  );
};
