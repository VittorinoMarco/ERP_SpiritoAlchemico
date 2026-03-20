import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import { isSottoScortaGiacenza } from '$lib/constants/inventory';

const READ_KEY = 'erp_notifications_read';

export type NotificationTipo = 'sotto_scorta' | 'fattura_scaduta' | 'ordine_attesa';

export interface Notification {
  id: string;
  tipo: NotificationTipo;
  titolo: string;
  link: string;
  created: string;
  recordId: string;
}

function loadReadIds(): Set<string> {
  if (!browser) return new Set();
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveReadIds(ids: Set<string>) {
  if (!browser) return;
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    // ignore
  }
}

function createNotificationsStore() {
  const { subscribe, set } = writable<Notification[]>([]);
  const readIds = writable<Set<string>>(loadReadIds());
  let currentItems: Notification[] = [];

  const store = {
    subscribe,
    readIds: { subscribe: readIds.subscribe },
    setRead: (id: string) => {
      readIds.update((s) => {
        const next = new Set(s);
        next.add(id);
        saveReadIds(next);
        return next;
      });
    },
    setAllRead: () => {
      readIds.update((s) => {
        const next = new Set(s);
        for (const n of currentItems) next.add(n.id);
        saveReadIds(next);
        return next;
      });
    },
    fetch: async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [invList, invList2, ordList] = await Promise.all([
          pb.collection('inventory').getFullList({ expand: 'prodotto' }),
          pb.collection('invoices').getFullList({
            expand: 'cliente',
            filter: `data_scadenza < "${today}" && stato != "pagata"`
          }),
          pb.collection('orders').getFullList({
            filter: 'stato = "confermato"',
            sort: '-data_ordine'
          })
        ]);

        const notifs: Notification[] = [];

        const sottoScorta = invList.filter((i) => isSottoScortaGiacenza(i.giacenza));
        if (sottoScorta.length > 0) {
          notifs.push({
            id: 'sotto_scorta:summary',
            tipo: 'sotto_scorta',
            titolo: `${sottoScorta.length} prodotto${sottoScorta.length > 1 ? 'i' : ''} con giacenza ≤ 6`,
            link: '/magazzino',
            created: new Date().toISOString(),
            recordId: 'summary'
          });
        }

        for (const inv of invList2) {
          const exp = inv.expand as { cliente?: { ragione_sociale?: string } } | undefined;
          const cliente = exp?.cliente?.ragione_sociale ?? 'Cliente';
          notifs.push({
            id: `fattura_scaduta:${inv.id}`,
            tipo: 'fattura_scaduta',
            titolo: `Fattura scaduta: ${inv.numero_fattura ?? inv.id} - ${cliente}`,
            link: `/fatture/${inv.id}`,
            created: inv.updated ?? inv.created,
            recordId: inv.id
          });
        }

        for (const ord of ordList) {
          notifs.push({
            id: `ordine_attesa:${ord.id}`,
            tipo: 'ordine_attesa',
            titolo: `Ordine in attesa: ${ord.numero_ordine ?? ord.id}`,
            link: `/ordini/${ord.id}`,
            created: ord.updated ?? ord.created,
            recordId: ord.id
          });
        }

        notifs.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
        currentItems = notifs;
        set(notifs);
      } catch {
        currentItems = [];
        set([]);
      }
    },
    subscribeRealtime: () => {
      if (!browser) return () => {};
      const handler = () => {
        store.fetch();
      };
      const topics = ['inventory/*', 'invoices/*', 'orders/*'];
      topics.forEach((t) => pb.realtime.subscribe(t, handler));
      return () => {
        topics.forEach((t) => pb.realtime.unsubscribe(t));
      };
    }
  };
  return store;
}

export const notificationsStore = createNotificationsStore();

export const unreadCount = derived(
  [notificationsStore, notificationsStore.readIds],
  ([notifs, read]) => {
    const items = notifs as Notification[];
    const readSet = read as Set<string>;
    return items.filter((n) => !readSet.has(n.id)).length;
  }
);
