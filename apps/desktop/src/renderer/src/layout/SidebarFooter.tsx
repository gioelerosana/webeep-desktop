import { Button, cn } from '@webeep/ui-kit';
import { LogOut, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigation } from '../lib/navigation';
import { useLogout } from '../lib/queries';
import { UserAvatar } from './UserAvatar';
import { useCurrentUser } from './useCurrentUser';

/** Utente con impostazioni e uscita, in fondo alla sidebar. */
export const SidebarFooter = (): ReactNode => {
  const user = useCurrentUser();
  const { route, navigate } = useNavigation();
  const isSettingsActive = route.name === 'settings';
  const logout = useLogout();
  if (!user) return null;
  return (
    <footer className="flex items-center gap-2 border-t p-2">
      <UserAvatar fullname={user.fullname} pictureUrl={user.userpictureurl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm text-foreground">{user.fullname}</p>
        <p className="truncate text-2xs text-muted-foreground">{user.username}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Impostazioni"
        aria-current={isSettingsActive ? 'page' : undefined}
        className={cn(isSettingsActive && 'bg-sidebar-row-active [&_svg]:text-foreground')}
        onClick={() => navigate({ name: 'settings' })}
      >
        <Settings />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Esci" disabled={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut />
      </Button>
    </footer>
  );
};
