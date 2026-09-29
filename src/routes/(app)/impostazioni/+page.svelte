<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { pb } from '$lib/pocketbase';
  import { isAdmin as checkAdmin } from '$lib/utils/auth';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { settingsStore } from '$lib/stores/settings';
  import { Key, Save, ShoppingCart, Server, ChevronRight, LogOut, Building2 } from 'lucide-svelte';
  import { currentUser, currentRole, displayName, initialsOf, ROLE_LABELS } from '$lib/stores/auth';

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

<div class="space-y-5 fade-in max-w-4xl">
  <PageHeader titolo="Impostazioni" sottotitolo="Account, integrazioni e strumenti di sistema." />

  <!-- Account -->
  <Card>
    <div class="flex items-center gap-4">
      <div class="h-14 w-14 rounded-2xl bg-[#F5D547] text-[#1A1A1A] grid place-items-center text-lg font-bold shrink-0">
        {initialsOf($currentUser)}
      </div>
      <div class="min-w-0 flex-1">
        <p class="font-semibold truncate">{displayName($currentUser)}</p>
        <p class="text-sm text-[#6B7280] truncate">{$currentUser?.email ?? ''}</p>
        {#if $currentRole}
          <span class="mt-1.5 inline-flex rounded-full bg-[#FFF3CD] px-2.5 py-0.5 text-xs font-medium">{ROLE_LABELS[$currentRole]}</span>
        {/if}
      </div>
      <Button variant="ghost" size="sm" onclick={() => goto('/logout')}>
        <LogOut class="h-4 w-4" /> <span class="hidden sm:inline">Esci</span>
      </Button>
    </div>
  </Card>

  {#if isAdmin}
    <div class="grid gap-4 sm:grid-cols-2">
      <button type="button" class="text-left group" onclick={() => goto('/impostazioni/azienda')}>
        <Card className="h-full transition-shadow group-hover:shadow-lg">
          <div class="flex items-start justify-between gap-3">
            <div class="h-11 w-11 rounded-2xl bg-[#1A1A1A] text-[#F5D547] grid place-items-center"><Building2 class="h-5 w-5" /></div>
            <ChevronRight class="h-5 w-5 text-[#9CA3AF] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 class="mt-4 font-semibold">Dati fiscali</h2>
          <p class="mt-1 text-sm text-[#6B7280]">P.IVA, sede, regime e codice SDI. Serve per proforma e, dopo, FatturaPA.</p>
        </Card>
      </button>
      <button type="button" class="text-left group" onclick={() => goto('/impostazioni/ecommerce')}>
        <Card className="h-full transition-shadow group-hover:shadow-lg">
          <div class="flex items-start justify-between gap-3">
            <div class="h-11 w-11 rounded-2xl bg-[#1A1A1A] text-[#F5D547] grid place-items-center"><ShoppingCart class="h-5 w-5" /></div>
            <ChevronRight class="h-5 w-5 text-[#9CA3AF] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 class="mt-4 font-semibold">E-commerce</h2>
          <p class="mt-1 text-sm text-[#6B7280]">Webhook e sincronizzazione ordini da Shopify, WooCommerce o custom.</p>
        </Card>
      </button>
      <button type="button" class="text-left group" onclick={() => goto('/impostazioni/sistema')}>
        <Card className="h-full transition-shadow group-hover:shadow-lg">
          <div class="flex items-start justify-between gap-3">
            <div class="h-11 w-11 rounded-2xl bg-[#1A1A1A] text-[#F5D547] grid place-items-center"><Server class="h-5 w-5" /></div>
            <ChevronRight class="h-5 w-5 text-[#9CA3AF] group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 class="mt-4 font-semibold">Sistema</h2>
          <p class="mt-1 text-sm text-[#6B7280]">Info sistema, backup PocketBase, export CSV e dashboard admin.</p>
        </Card>
      </button>
    </div>

    <Card>
      <h2 class="font-semibold flex items-center gap-2"><Key class="h-4 w-4" /> API OpenAI</h2>
      <p class="text-sm text-[#6B7280] mt-2 mb-4">
        Una sola chiave per la <strong>ricerca</strong> (⌘K), l’<strong>Assistente AI</strong> e l’analisi in
        <strong>Analytics</strong>. Senza chiave la ricerca resta solo testuale. La chiave è salvata solo in questo browser.
      </p>
      <div class="flex flex-col sm:flex-row gap-3">
        <input type="password" bind:value={openaiKey} placeholder="sk-..." class="field flex-1" autocomplete="off" />
        <Button onclick={saveKey} disabled={saving}>
          <Save class="h-4 w-4" />
          {saved ? 'Salvato' : 'Salva'}
        </Button>
      </div>
    </Card>
  {:else}
    <Card>
      <p class="text-sm text-[#6B7280]">Le altre impostazioni sono riservate agli amministratori.</p>
    </Card>
  {/if}
</div>
