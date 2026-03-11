<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import { isAdmin as checkAdmin } from '$lib/utils/auth';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { Key, Save, ShoppingCart, Server } from 'lucide-svelte';

  let openaiKey = '';
  let saving = false;
  let saved = false;

  export let data: { user?: { role?: string; ruolo?: string } | null } = { user: null };
  $: user = data.user ?? pb.authStore.model;
  $: isAdmin = checkAdmin(user as any);

  onMount(() => {
    openaiKey = $settingsStore.openaiApiKey ?? '';
  });

  function saveKey() {
    saving = true;
    saved = false;
    settingsStore.setOpenAiKey(openaiKey);
    saving = false;
    saved = true;
    setTimeout(() => (saved = false), 2000);
  }
</script>

<svelte:head>
  <title>Impostazioni | ERP Spirito Alchemico</title>
</svelte:head>

<div class="space-y-6">
  <h1 class="text-3xl font-bold text-[#1A1A1A] tracking-tight">Impostazioni</h1>

  {#if isAdmin}
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <ShoppingCart class="h-4 w-4" />
        E-commerce
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Configura webhook e monitora la sincronizzazione ordini da Shopify, WooCommerce o e-commerce custom.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="rounded-2xl"
        onclick={() => goto('/impostazioni/ecommerce')}
      >
        Configura E-commerce
      </Button>
    </Card>
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <Server class="h-4 w-4" />
        Sistema
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Info sistema, backup PocketBase, export CSV e link alla dashboard admin.
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="rounded-2xl"
        onclick={() => goto('/impostazioni/sistema')}
      >
        Configura Sistema
      </Button>
    </Card>
    <Card>
      <h2 class="text-sm font-medium text-[#1A1A1A] mb-4 flex items-center gap-2">
        <Key class="h-4 w-4" />
        API OpenAI (ricerca AI)
      </h2>
      <p class="text-sm text-[#6B7280] mb-4">
        Configura la chiave API OpenAI per abilitare la ricerca in linguaggio naturale (es. "ordini di Bar Roma", "prodotti sotto scorta").
        Se non configurata, viene usata la ricerca testuale standard.
      </p>
      <div class="flex gap-3">
        <input
          type="password"
          bind:value={openaiKey}
          placeholder="sk-..."
          class="flex-1 rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#F5D547]"
        />
        <Button
          variant="primary"
          size="sm"
          className="rounded-2xl !bg-[#1A1A1A]"
          onclick={saveKey}
          disabled={saving}
        >
          <Save class="h-4 w-4" />
          {saved ? 'Salvato' : 'Salva'}
        </Button>
      </div>
    </Card>
  {:else}
    <Card>
      <p class="text-sm text-[#6B7280]">Solo gli amministratori possono modificare le impostazioni.</p>
    </Card>
  {/if}
</div>
