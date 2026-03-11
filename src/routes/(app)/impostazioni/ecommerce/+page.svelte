<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { isAdmin as checkAdmin } from '$lib/utils/auth';
  import { ShoppingCart, Save, ChevronLeft, Activity, CheckCircle, XCircle } from 'lucide-svelte';

  let webhookUrl = '';
  let apiKey = '';
  let saving = false;
  let saved = false;
  let logs: {
    id: string;
    created: string;
    azione: string;
    record_rif: string;
    dettagli: string;
  }[] = [];
  let loadingLogs = true;

  export let data: { user?: { role?: string; ruolo?: string } | null } = { user: null };
  $: user = data.user ?? pb.authStore.model;
  $: isAdmin = checkAdmin(user as any);

  onMount(() => {
    webhookUrl = $settingsStore.ecommerceWebhookUrl ?? '';
    apiKey = $settingsStore.ecommerceApiKey ?? '';
    if (!webhookUrl && typeof window !== 'undefined') {
      webhookUrl = `${window.location.origin}/webhook/ecommerce`;
    }
    loadLogs();
  });

  async function loadLogs() {
    loadingLogs = true;
    try {
      const list = await pb.collection('activity_log').getList(1, 50, {
        filter: 'azione = "webhook_ecommerce"',
        sort: '-created'
      });
      logs = list.items as any;
    } catch {
      logs = [];
    } finally {
      loadingLogs = false;
    }
  }

  function saveConfig() {
    saving = true;
    saved = false;
    settingsStore.setEcommerceConfig(webhookUrl, apiKey);
    saving = false;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }

  function parseDetails(d: string): { status?: string; order_id?: string; error?: string; payload_summary?: object; timestamp?: string } {
    try {
      return JSON.parse(d || '{}');
    } catch {
      return {};
    }
  }

  const PAYLOAD_EXAMPLE = `{
  "order_id": "12345",
  "customer": { "email": "...", "name": "..." },
  "billing": { "address": "...", "city": "...", "postal_code": "..." },
  "items": [
    { "sku": "PROD-001", "quantity": 2, "price": 19.99 }
  ]
}`;

  function formatDate(s: string): string {
    if (!s) return '-';
    const d = new Date(s);
    return d.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>E-commerce | ERP Spirito Alchemico</title>
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
    <ShoppingCart class="h-8 w-8" />
    Integrazione E-commerce
  </h1>

  {#if isAdmin}
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <Activity class="h-4 w-4" />
        Configurazione Webhook
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Configura l'URL e il secret per ricevere ordini dal tuo e-commerce (Shopify, WooCommerce o custom).
        Il server webhook deve essere avviato separatamente: <code class="bg-black/5 px-1 rounded text-xs">node server/webhook.js</code>
      </p>
      <div class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1">URL Webhook (endpoint ERP)</label>
          <input
            type="url"
            bind:value={webhookUrl}
            placeholder="https://tuodominio.com/webhook/ecommerce"
            class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
          />
          <p class="text-xs text-[#6B7280] mt-1">
            URL da configurare nel tuo e-commerce per inviare gli ordini. Esempio Nginx: <code class="bg-black/5 px-1 rounded">location /webhook/ &#123; proxy_pass http://127.0.0.1:3001; &#125;</code>
          </p>
        </div>
        <div>
          <label class="block text-xs font-medium text-[#6B7280] mb-1">API Key / Secret (X-Webhook-Secret)</label>
          <input
            type="password"
            bind:value={apiKey}
            placeholder="Secret per autenticazione"
            class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
          />
          <p class="text-xs text-[#6B7280] mt-1">
            Deve corrispondere alla variabile <code class="bg-black/5 px-1 rounded">ECCOMMERCE_WEBHOOK_SECRET</code> sul server.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="rounded-2xl !bg-[#1A1A1A]"
          onclick={saveConfig}
          disabled={saving}
        >
          <Save class="h-4 w-4" />
          {saved ? 'Salvato' : 'Salva'}
        </Button>
      </div>

      <div class="mt-6 pt-6 border-t border-black/5">
        <h3 class="text-sm font-medium text-[#1A1A1A] mb-2">Formato payload atteso</h3>
        <pre class="text-xs bg-black/5 rounded-xl p-4 overflow-x-auto"><code>{PAYLOAD_EXAMPLE}</code></pre>
        <p class="text-xs text-[#6B7280] mt-2">
          Supporta anche <code>line_items</code>, <code>products</code> e campi alternativi per Shopify/WooCommerce.
        </p>
      </div>
    </Card>

    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <Activity class="h-4 w-4" />
        Ultimi webhook ricevuti
      </h2>
      {#if loadingLogs}
        <p class="text-sm text-[#6B7280]">Caricamento...</p>
      {:else if logs.length === 0}
        <p class="text-sm text-[#6B7280]">Nessun webhook ricevuto ancora.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-black/5 text-left">
                <th class="py-2 pr-4">Data</th>
                <th class="py-2 pr-4">Stato</th>
                <th class="py-2 pr-4">Ordine</th>
                <th class="py-2">Dettagli</th>
              </tr>
            </thead>
            <tbody>
              {#each logs as log}
                {@const details = parseDetails(log.dettagli)}
                <tr class="border-b border-black/5">
                  <td class="py-3 pr-4 text-[#6B7280]">{formatDate(log.created)}</td>
                  <td class="py-3 pr-4">
                    {#if details.status === 'success'}
                      <span class="inline-flex items-center gap-1 text-green-600">
                        <CheckCircle class="h-4 w-4" />
                        Successo
                      </span>
                    {:else}
                      <span class="inline-flex items-center gap-1 text-red-600">
                        <XCircle class="h-4 w-4" />
                        Errore
                      </span>
                    {/if}
                  </td>
                  <td class="py-3 pr-4 font-mono text-xs">{details.payload_summary?.order_id || details.order_id || log.record_rif || '-'}</td>
                  <td class="py-3">
                    {#if details.error}
                      <span class="text-red-600">{details.error}</span>
                    {:else if details.payload_summary}
                      <span class="text-[#6B7280]">
                        {details.payload_summary.items_count ?? 0} righe{#if details.payload_summary.totale != null}, totale €{details.payload_summary.totale}{/if}
                      </span>
                    {:else}
                      -
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-4"
          onclick={loadLogs}
        >
          Aggiorna
        </Button>
      {/if}
    </Card>
  {:else}
    <Card>
      <p class="text-sm text-[#6B7280]">Solo gli amministratori possono accedere a questa sezione.</p>
    </Card>
  {/if}
</div>
