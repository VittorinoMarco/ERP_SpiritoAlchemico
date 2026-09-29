import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  UserCircle,
  FileText,
  Package,
  Boxes,
  Wallet,
  BarChart2,
  Kanban,
  StickyNote,
  Sparkles,
  Activity,
  Settings,
  UserPlus
} from 'lucide-svelte';
import type { Role } from '$lib/stores/auth';

export type NavGroupId = 'panoramica' | 'vendite' | 'catalogo' | 'finanza' | 'lavoro' | 'strumenti';

export type NavItem = {
  id: string;
  label: string;
  /** Etichetta breve per la bottom nav mobile */
  short?: string;
  href: string;
  icon: typeof LayoutDashboard;
  group: NavGroupId;
  roles: Role[];
};

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: 'panoramica', label: 'Panoramica' },
  { id: 'vendite', label: 'Vendite' },
  { id: 'catalogo', label: 'Prodotti & Magazzino' },
  { id: 'finanza', label: 'Finanza' },
  { id: 'lavoro', label: 'Lavoro' },
  { id: 'strumenti', label: 'Strumenti' }
];

const ALL: Role[] = ['admin', 'agente', 'magazziniere'];

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'panoramica', roles: ALL },

  { id: 'ordini', label: 'Ordini', href: '/ordini', icon: ShoppingCart, group: 'vendite', roles: ['admin', 'agente'] },
  { id: 'clienti', label: 'Clienti', href: '/clienti', icon: Users, group: 'vendite', roles: ['admin', 'agente'] },
  { id: 'agenti', label: 'Agenti', href: '/agenti', icon: UserCircle, group: 'vendite', roles: ['admin'] },
  { id: 'fatture', label: 'Fatture', href: '/fatture', icon: FileText, group: 'vendite', roles: ['admin'] },

  { id: 'prodotti', label: 'Prodotti', href: '/prodotti', icon: Package, group: 'catalogo', roles: ['admin'] },
  { id: 'magazzino', label: 'Magazzino', href: '/magazzino', icon: Boxes, group: 'catalogo', roles: ['admin', 'magazziniere'] },

  { id: 'uscite', label: 'Uscite', href: '/uscite', icon: Wallet, group: 'finanza', roles: ['admin'] },
  { id: 'analytics', label: 'Analytics', href: '/analytics', icon: BarChart2, group: 'finanza', roles: ['admin'] },

  { id: 'tasks', label: 'Task', href: '/tasks', icon: Kanban, group: 'lavoro', roles: ['admin'] },
  { id: 'note', label: 'Note', href: '/note', icon: StickyNote, group: 'lavoro', roles: ['admin'] },

  { id: 'assistente', label: 'Assistente AI', short: 'Assistente', href: '/assistente', icon: Sparkles, group: 'strumenti', roles: ALL },
  { id: 'attivita', label: 'Attività', href: '/attivita', icon: Activity, group: 'strumenti', roles: ALL }
];

export const SETTINGS_ITEM: NavItem = {
  id: 'impostazioni',
  label: 'Impostazioni',
  href: '/impostazioni',
  icon: Settings,
  group: 'strumenti',
  roles: ALL
};

export const INVITE_ITEM: NavItem = {
  id: 'utenti',
  label: 'Invita utente',
  href: '/register',
  icon: UserPlus,
  group: 'strumenti',
  roles: ['admin']
};

/** Voci fisse nella bottom nav mobile (le altre stanno nel menu completo). */
export const MOBILE_PRIMARY: Record<Role, string[]> = {
  admin: ['dashboard', 'ordini', 'clienti', 'magazzino'],
  agente: ['dashboard', 'ordini', 'clienti', 'assistente'],
  magazziniere: ['dashboard', 'magazzino', 'attivita', 'assistente']
};

export function itemsForRole(role: Role | null): NavItem[] {
  if (!role) return [];
  return NAV_ITEMS.filter((i) => i.roles.includes(role));
}

const ALL_ROUTES: NavItem[] = [...NAV_ITEMS, SETTINGS_ITEM, INVITE_ITEM];

/** Voce di menu a cui appartiene un percorso (match più specifico). */
export function matchNavItem(pathname: string): NavItem | null {
  if (pathname === '/' || pathname === '') return NAV_ITEMS[0];
  let best: NavItem | null = null;
  for (const item of ALL_ROUTES) {
    if (item.href === '/') continue;
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best;
}

/** Guard centralizzato: quali ruoli possono aprire un percorso. */
export function canAccess(role: Role | null, pathname: string): boolean {
  if (!role) return false;
  const item = matchNavItem(pathname);
  // Percorsi non mappati (404 ecc.): lasciamo passare, ci pensa la pagina di errore
  if (!item) return true;
  return item.roles.includes(role);
}
