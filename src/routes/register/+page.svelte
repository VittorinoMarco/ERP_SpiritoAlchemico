<script lang="ts">
  import Card from '$lib/components/ui/Card.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { ActionData } from './$types';

  export let form: ActionData | null = null;

  let email = form?.values?.email ?? '';
  let nome = form?.values?.nome ?? '';
  let ruolo = form?.values?.ruolo ?? 'agente';
  let password = '';
</script>

<div class="min-h-[calc(100vh-5rem)] flex items-center justify-center px-4">
  <Card className="w-full max-w-md">
    <div class="mb-6">
      <h1 class="text-3xl font-bold tracking-tight text-[#1A1A1A]">
        Invita utente
      </h1>
      <p class="mt-2 text-sm text-[#6B7280]">
        Crea un nuovo account per l’accesso all’ERP.
      </p>
    </div>

    <form method="POST" class="space-y-4">
      <Input
        id="nome"
        label="Nome completo"
        type="text"
        placeholder="Nome Cognome"
        bind:value={nome}
        required
      />

      <Input
        id="email"
        label="Email"
        type="email"
        placeholder="nome@azienda.it"
        bind:value={email}
        required
      />

      <div class="space-y-1.5">
        <label for="ruolo" class="block text-sm font-medium text-[#1A1A1A]">
          Ruolo
        </label>
        <select
          id="ruolo"
          name="ruolo"
          class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
          bind:value={ruolo}
          required
        >
          <option value="agente">Agente</option>
          <option value="magazziniere">Magazziniere</option>
          <option value="admin">Amministratore</option>
        </select>
      </div>

      <Input
        id="password"
        label="Password iniziale"
        type="password"
        placeholder="••••••••"
        bind:value={password}
        required
      />

      {#if form?.error}
        <p class="text-xs text-rose-600 mt-1">
          {form.error}
        </p>
      {/if}

      <Button variant="primary" type="submit" className="w-full mt-4">
        Crea utente
      </Button>
    </form>
  </Card>
</div>

