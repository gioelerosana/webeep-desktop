import { Badge, Input } from '@webeep/ui-kit';
import { Bell, House, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigation } from '../lib/navigation';
import { useNotifications } from '../lib/queries';
import { SidebarCourseList } from './SidebarCourseList';
import { SidebarFooter } from './SidebarFooter';
import { SidebarItem } from './SidebarItem';
import { useSidebarCourses } from './useSidebarCourses';

const APP_NAME = 'WeBeep';

/** Sidebar a sinistra: ricerca, navigazione, corsi in corso e utente. */
export const Sidebar = (): ReactNode => {
  const { route, navigate } = useNavigation();
  const { query, setQuery, result, visibleCourses } = useSidebarCourses();
  const unreadCount = useNotifications().data?.unreadcount ?? 0;
  const activeCourseId = route.name === 'course' ? route.courseId : undefined;

  return (
    <aside className="flex h-full w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-sidebar">
      <header className="flex flex-col gap-3 p-3">
        <p className="px-1 text-sm font-semibold text-foreground">{APP_NAME}</p>
        <Input
          type="search"
          aria-label="Cerca corsi"
          placeholder="Cerca corsi"
          leading={<Search />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          wrapperClassName="bg-sidebar-control-surface"
        />
      </header>

      <nav aria-label="Navigazione" className="flex flex-col gap-0.5 px-2">
        <SidebarItem
          label="Home"
          icon={<House />}
          active={route.name === 'home'}
          onSelect={() => navigate({ name: 'home' })}
        />
        <SidebarItem
          label="Notifiche"
          icon={<Bell />}
          trailing={unreadCount > 0 ? <Badge size="sm" variant="info">{unreadCount}</Badge> : null}
          active={route.name === 'notifications'}
          onSelect={() => navigate({ name: 'notifications' })}
        />
      </nav>

      <section aria-label="Corsi" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <h2 className="px-2 pb-1 pt-4 text-2xs text-muted-foreground">Corsi</h2>
        <SidebarCourseList
          result={result}
          visibleCourses={visibleCourses}
          isSearching={query.trim() !== ''}
          activeCourseId={activeCourseId}
          onSelect={(courseId) => navigate({ name: 'course', courseId })}
        />
      </section>

      <SidebarFooter />
    </aside>
  );
};
