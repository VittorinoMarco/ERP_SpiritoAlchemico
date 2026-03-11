<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import { env } from '$env/dynamic/public';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { isAdmin as checkAdmin } from '$lib/utils/auth';
  import {
    ChevronLeft,
    Server,
    Database,
    Download,
    HardDrive,
    ExternalLink,
    FileDown,
    Calendar,
    RefreshCw
  } from 'lucide-svelte';

  const COLLECTIONS = [
    'clients',
    'products',
    'orders',
    'order_items',
    'inventory',
    'inventory_movements',
    'invoices',
    'users',
    'agent_commissions',
    'activity_log'
  ];

  type BackupFile = { key: string; size: number; modified: string };
  type SystemInfo = {
    version: string;
    recordCounts: Record<string, number>;
    diskSpace: string;
  };

  let backupApiUrl = '';
  let backupApiSecret = '';
  let saving = false;
  let saved = false;
  let systemInfo: SystemInfo = {
    version: '—',
    recordCounts: {},
    diskSpace: '—'
  };
  let backups: BackupFile[] = [];
  let loadingInfo = true;
  let loadingBackups = true;
  let creatingBackup = false;
  let exportingCsv = false;
  let error = '';

  export let data: { user?: { role?: string; ruolo?: string } | null } = { user: null };
  $: user = data.user ?? pb.authStore.model;
  $: isAdmin = checkAdmin(user as any);

  const pbUrl = env.PUBLIC_POCKETBASE_URL ?? '';

  onMount(() => {
    backupApiUrl = $settingsStore.backupApiUrl ?? '';
    backupApiSecret = $settingsStore.backupApiSecret ?? '';
    if (!backupApiUrl && typeof window !== 'undefined') {
      backupApiUrl = `${window.location.origin}/api`;
    }
    loadSystemInfo();
    loadBackups();
  });

  function getBackupBase(): string {
    return backupApiUrl.replace(/\/$/, '');
  }

  async function loadSystemInfo() {
    loadingInfo = true;
    try {
      const counts: Record<string, number> = {};
      for (const col of COLLECTIONS) {
        try {
          const r = await pb.collection(col).getList(1, 1);
          counts[col] = r.totalItems ?? 0;
        } catch {
          counts[col] = 0;
        }
      }
      systemInfo = {
        version: '—',
        recordCounts: counts,
        diskSpace: '—'
      };
      try {
        const base = getBackupBase();
        const res = await fetch(`${base}/backups/info`, {
          headers: authHeaders()
        });
        if (res.ok) {
          const info = await res.json();
          systemInfo.version = info.version ?? systemInfo.version;
        }
      } catch {
        // ignore
      }
    } catch {
      systemInfo = { version: '—', recordCounts: {}, diskSpace: '—' };
    } finally {
      loadingInfo = false;
    }
  }

  function authHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    const token = pb.authStore.token;
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (backupApiSecret) h['X-Backup-Secret'] = backupApiSecret;
    return h;
  }

  async function loadBackups() {
    loadingBackups = true;
    error = '';
    try {
      const base = getBackupBase();
      const res = await fetch(`${base}/backups`, { headers: authHeaders() });
      if (res.ok) {
        backups = await res.json();
      } else {
        const err = await res.json().catch(() => ({}));
        error = err.error || res.statusText || 'Errore caricamento backup';
        backups = [];
      }
    } catch (e: any) {
      error = e?.message || 'Backup API non raggiungibile';
      backups = [];
    } finally {
      loadingBackups = false;
    }
  }

  async function createBackup() {
    creatingBackup = true;
    error = '';
    try {
      const base = getBackupBase();
      const res = await fetch(`${base}/backups`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (res.ok) {
        await loadBackups();
      } else {
        const err = await res.json().catch(() => ({}));
        error = err.error || res.statusText || 'Errore creazione backup';
      }
    } catch (e: any) {
      error = e?.message || 'Errore creazione backup';
    } finally {
      creatingBackup = false;
    }
  }

  async function downloadBackup(key: string) {
    try {
      const base = getBackupBase();
      const res = await fetch(`${base}/backups/download/${encodeURIComponent(key)}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, '_blank');
      }
    } catch (e: any) {
      error = e?.message || 'Errore download';
    }
  }

  function saveBackupConfig() {
    saving = true;
    saved = false;
    settingsStore.setBackupConfig(backupApiUrl, backupApiSecret);
    saving = false;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  function formatBytes(n: number): string {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(s: string): string {
    if (!s) return '—';
    return new Date(s).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function exportCsv() {
    exportingCsv = true;
    error = '';
    try {
      const sections: string[] = [];
      for (const col of COLLECTIONS) {
        try {
          const items = await pb.collection(col).getFullList();
          sections.push(`--- COLLECTION: ${col} ---\n${toCsv(items)}`);
        } catch {
          sections.push(`--- COLLECTION: ${col} ---\n(errore lettura)`);
        }
      }
      const blob = new Blob([sections.join('\n\n')], {
        type: 'text/csv;charset=utf-8'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `erp_export_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      error = e?.message || 'Errore export';
    } finally {
      exportingCsv = false;
    }
  }

  function toCsv(items: any[]): string {
    if (items.length === 0) return '';
    const keys = new Set<string>();
    for (const item of items) {
      for (const k of Object.keys(item)) {
        if (k !== 'expand' && typeof item[k] !== 'object') keys.add(k);
      }
    }
    const headers = [...keys];
    const rows = items.map((item) =>
      headers
        .map((h) => {
          const v = item[h];
          if (v == null) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  const adminUrl = pbUrl ? `${pbUrl.replace(/\/$/, '')}/_/` : '';
</script>

<svelte:head>
  <title>Sistema | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex items-center gap-4">
    <button
      type="button"
      class="inline-flex items-center gap-1 text-sm text-[#6B7280] hover:text-[#1A1A1A] transition-colors"
      onclick={() => goto('/impostazioni')}
    >
      <ChevronLeft class="h-4 w-4" />
      Impostazioni
    </button>
  </div>

  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight flex items-center gap-2">
    <Server class="h-8 w-8" />
    Sistema
  </h1>

  {#if isAdmin}
    {#if error}
      <div class="rounded-2xl bg-red-50 text-red-700 px-4 py-3 text-sm">
        {error}
      </div>
    {/if}

    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <Database class="h-4 w-4" />
        Info sistema
      </h2>
      {#if loadingInfo}
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      {:else}
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div class="rounded-2xl bg-black/5 p-4">
            <p class="text-xs text-[#6B7280]">PocketBase</p>
            <p class="text-sm font-medium">{systemInfo.version}</p>
          </div>
          <div class="rounded-2xl bg-black/5 p-4">
            <p class="text-xs text-[#6B7280]">Spazio disco</p>
            <p class="text-sm font-medium">{systemInfo.diskSpace}</p>
          </div>
          <div class="rounded-2xl bg-black/5 p-4">
            <p class="text-xs text-[#6B7280]">Record totale</p>
            <p class="text-sm font-medium">
              {Object.values(systemInfo.recordCounts).reduce((a, b) => a + b, 0)}
            </p>
          </div>
        </div>
        <div class="mt-4">
          <p class="text-xs font-medium text-[#6B7280] mb-2">Record per collection</p>
          <div class="flex flex-wrap gap-2">
            {#each Object.entries(systemInfo.recordCounts) as [col, count]}
              <span class="rounded-xl bg-black/5 px-3 py-1 text-xs">
                {col}: {count}
              </span>
            {/each}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="mt-4"
          onclick={loadSystemInfo}
          disabled={loadingInfo}
        >
          <RefreshCw class="h-4 w-4" />
          Aggiorna
        </Button>
      {/if}
    </Card>

    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <HardDrive class="h-4 w-4" />
        Backup PocketBase
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Configura l'URL del server backup (es. <code class="bg-black/5 px-1 rounded">https://tuodominio.com/api</code>).
        Avvia con <code class="bg-black/5 px-1 rounded">node server/backup.js</code> e imposta BACKUP_API_SECRET se necessario.
      </p>
      <div class="space-y-4 mb-6">
        <div>
          <label for="backup-url" class="block text-xs font-medium text-[#6B7280] mb-1">URL API Backup</label>
          <input
            id="backup-url"
            type="url"
            bind:value={backupApiUrl}
            placeholder="https://tuodominio.com/api"
            class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
          />
        </div>
        <div>
          <label for="backup-secret" class="block text-xs font-medium text-[#6B7280] mb-1">Secret (opzionale)</label>
          <input
            id="backup-secret"
            type="password"
            bind:value={backupApiSecret}
            placeholder="BACKUP_API_SECRET"
            class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          className="rounded-2xl !bg-[#1A1A1A]"
          onclick={saveBackupConfig}
          disabled={saving}
        >
          {saved ? 'Salvato' : 'Salva'}
        </Button>
      </div>

      <div class="border-t border-black/5 pt-4">
        <div class="flex flex-wrap items-center gap-4 mb-4">
          <Button
            variant="primary"
            size="sm"
            onclick={createBackup}
            disabled={creatingBackup || loadingBackups}
          >
            <Download class="h-4 w-4" />
            {creatingBackup ? 'Creazione...' : 'Backup ora'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onclick={loadBackups}
            disabled={loadingBackups}
          >
            <RefreshCw class="h-4 w-4" />
            Aggiorna
          </Button>
        </div>
        {#if loadingBackups}
          <p class="text-sm text-[#6B7280]">Caricamento backup...</p>
        {:else if backups.length === 0}
          <p class="text-sm text-[#6B7280]">Nessun backup disponibile.</p>
        {:else}
          <div class="space-y-2">
            {#each backups as b (b.key)}
              <div
                class="flex items-center justify-between rounded-2xl bg-black/5 px-4 py-3"
              >
                <div>
                  <p class="text-sm font-medium">{b.key}</p>
                  <p class="text-xs text-[#6B7280]">
                    {formatBytes(b.size)} · {formatDate(b.modified)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => downloadBackup(b.key)}
                >
                  <Download class="h-4 w-4" />
                  Download
                </Button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="mt-6 pt-6 border-t border-black/5">
        <h3 class="text-sm font-medium text-[#1A1A1A] mb-2 flex items-center gap-2">
          <Calendar class="h-4 w-4" />
          Backup automatico
        </h3>
        <p class="text-sm text-[#6B7280] mb-4">
          Configura i backup schedulati dalla dashboard PocketBase: Settings → Backups.
        </p>
        {#if adminUrl}
          <a
            href={adminUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-sm font-medium text-[#1A1A1A] hover:text-[#F5D547] transition-colors"
          >
            <ExternalLink class="h-4 w-4" />
            Apri dashboard PocketBase
          </a>
        {/if}
      </div>
    </Card>

    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <FileDown class="h-4 w-4" />
        Export dati CSV
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Esporta tutte le collection in un unico file CSV.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onclick={exportCsv}
        disabled={exportingCsv}
      >
        <FileDown class="h-4 w-4" />
        {exportingCsv ? 'Export in corso...' : 'Export completo'}
      </Button>
    </Card>

    {#if adminUrl}
      <Card>
        <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
          <ExternalLink class="h-4 w-4" />
          PocketBase Admin
        </h2>
        <p class="text-sm text-[#6B7280] mb-4">
          Accedi alla dashboard amministrativa per gestire collections, utenti e impostazioni.
        </p>
        <a
          href={adminUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 rounded-2xl bg-[#1A1A1A] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#333] transition-colors"
        >
          <ExternalLink class="h-4 w-4" />
          Apri dashboard
        </a>
      </Card>
    {/if}
  {:else}
    <Card>
      <p class="text-sm text-[#6B7280]">Solo gli amministratori possono accedere a questa sezione.</p>
    </Card>
  {/if}
</div>
