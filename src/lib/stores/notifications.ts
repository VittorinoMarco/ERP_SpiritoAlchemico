import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import { pb } from '$lib/pocketbase';
import { isSottoScortaGiacenza } from '$lib/constants/inventory';
import { sottoScortaCount } from '$lib/stores/magazzino';
import type { Role } from '$lib/stores/auth';

const READ_KEY = 'erp_notifications_read';
const MAX_READ_IDS = 500;

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
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function saveReadIds(ids: Set<string>) {
  if (!browser) return;
  try {
    // Evita che la lista cresca all'infinito: teniamo solo gli ultimi ID
    const arr = [...ids].slice(-MAX_READ_IDS);
    localStorage.setItem(READ_KEY, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

/** Data locale YYYY-MM-DD (toISOString userebbe UTC e sbaglierebbe dopo mezzanotte). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function createNotificationsStore() {
  const { subscribe, set } = writable<Notification[]>([]);
  const readIds = writable<Set<string>>(loadReadIds());
  let currentItems: Notification[] = [];
  let currentRole: Role | null = null;

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
    /** Carica le notifiche pertinenti per il ruolo (ogni sorgente è indipendente dalle altre). */
    fetch: async (role: Role | null = currentRole) => {
      currentRole = role;
      if (!role) {
        currentItems = [];
        set([]);
        return;
      }

      const wantsInventory = role === 'admin' || role === 'magazziniere';
      const wantsInvoices = role === 'admin';
      const wantsOrders = role === 'admin';
      const today = localToday();

      const [inv, invoices, orders] = await Promise.allSettled([
        wantsInventory
          ? pb.collection('inventory').getFullList({ expand: 'prodotto' })
          : Promise.resolve([]),
        wantsInvoices
          ? pb.collection('invoices').getFullList({
              expand: 'cliente',
              filter: `data_scadenza < "${today}" && stato != "pagata"`
            })
          : Promise.resolve([]),
        wantsOrders
          ? pb.collection('orders').getFullList({
              // confermati da evadere + bozze inviate dagli agenti in attesa di conferma
              filter: 'stato = "confermato" || (stato = "bozza" && agente != "")',
              sort: '-data_ordine'
            })
          : Promise.resolve([])
      ]);

      const notifs: Notification[] = [];

      if (inv.status === 'fulfilled') {
        const sottoScorta = inv.value.filter((i) => isSottoScortaGiacenza(i.giacenza));
        sottoScortaCount.set(sottoScorta.length);
        if (sottoScorta.length > 0) {
          // L'ID dipende dall'elenco dei prodotti: se ne finiscono di nuovi, la notifica ricompare
          const signature = sottoScorta
            .map((i) => i.id)
            .sort()
            .join(',');
          notifs.push({
            id: `sotto_scorta:${signature}`,
            tipo: 'sotto_scorta',
            titolo: `${sottoScorta.length} prodott${sottoScorta.length > 1 ? 'i' : 'o'} con giacenza ≤ 6`,
            link: '/magazzino',
            created: new Date().toISOString(),
            recordId: 'summary'
          });
        }
      }

      if (invoices.status === 'fulfilled') {
        for (const f of invoices.value) {
          const exp = f.expand as { cliente?: { ragione_sociale?: string } } | undefined;
          const cliente = exp?.cliente?.ragione_sociale ?? 'Cliente';
          notifs.push({
            id: `fattura_scaduta:${f.id}`,
            tipo: 'fattura_scaduta',
            titolo: `Fattura scaduta: ${f.numero_fattura ?? f.id} - ${cliente}`,
            link: `/fatture/${f.id}`,
            created: f.updated ?? f.created,
            recordId: f.id
          });
        }
      }

      if (orders.status === 'fulfilled') {
        for (const o of orders.value) {
          notifs.push({
            id: `ordine_attesa:${o.id}`,
            tipo: 'ordine_attesa',
            titolo:
              o.stato === 'bozza'
                ? `Ordine da confermare: ${o.numero_ordine ?? o.id}`
                : `Ordine da evadere: ${o.numero_ordine ?? o.id}`,
            link: `/ordini/${o.id}`,
            created: o.updated ?? o.created,
            recordId: o.id
          });
        }
      }

      notifs.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
      currentItems = notifs;
      set(notifs);
    },
    subscribeRealtime: () => {
      if (!browser) return () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Debounce: una raffica di eventi (es. import di più righe) genera un solo refresh
      const handler = () => {
        clearTimeout(timer);
        timer = setTimeout(() => store.fetch(), 600);
      };
      const topics = ['inventory/*', 'invoices/*', 'orders/*'];
      const unsubs: Promise<() => Promise<void>>[] = [];
      for (const t of topics) {
        unsubs.push(pb.realtime.subscribe(t, handler).catch(() => async () => {}));
      }
      return () => {
        clearTimeout(timer);
        unsubs.forEach((p) => p.then((off) => off()).catch(() => {}));
      };
    },
    reset: () => {
      currentItems = [];
      set([]);
      sottoScortaCount.set(0);
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
