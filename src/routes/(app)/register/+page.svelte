<script lang="ts">
  import { pb } from '$lib/pocketbase';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import { CheckCircle2, AlertCircle, UserPlus } from 'lucide-svelte';
  import { onMount } from 'svelte';

  let nome = '';
  let cognome = '';
  let email = '';
  let ruolo: 'agente' | 'magazziniere' | 'admin' = 'agente';
  let password = '';
  let error = '';
  let created: { email: string; ruolo: string } | null = null;
  let loading = false;
  let provvigione = '0';
  let agentePadre = '';
  let agentiPadre: { id: string; nome?: string; cognome?: string; email?: string }[] = [];

  const ROLES = [
    { value: 'agente', label: 'Agente', hint: 'Vede i propri clienti e ordini, crea nuovi ordini.' },
    { value: 'magazziniere', label: 'Magazziniere', hint: 'Gestisce giacenze e movimenti di magazzino.' },
    { value: 'admin', label: 'Amministratore', hint: 'Accesso completo a tutte le sezioni.' }
  ] as const;

  onMount(async () => {
    try {
      agentiPadre = await pb.collection('users').getFullList({ filter: 'ruolo = "agente"' });
    } catch {
      agentiPadre = [];
    }
  });

  function generatePassword() {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint32Array(12));
    password = Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    created = null;
    if (password.length < 8) {
      error = 'La password deve avere almeno 8 caratteri.';
      return;
    }
    loading = true;
    try {
      const payload: Record<string, unknown> = {
        email: email.trim(),
        password,
        passwordConfirm: password,
        nome: nome.trim(),
        cognome: cognome.trim(),
        ruolo
      };
      if (ruolo === 'agente') {
        payload.provvigione_percentuale = parseFloat(provvigione) || 0;
        if (agentePadre) payload.agente_padre = agentePadre;
      }
      await pb.collection('users').create(payload);
      created = { email: email.trim(), ruolo };
      nome = cognome = email = password = '';
      ruolo = 'agente';
      provvigione = '0';
      agentePadre = '';
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, { message?: string }> } })?.response?.data ?? {};
      const first = Object.entries(data)[0];
      error = first ? `${first[0]}: ${first[1]?.message ?? 'valore non valido'}` : "Errore nella creazione dell'utente.";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head><title>Invita utente · SpiritoAlchemico</title></svelte:head>

<PageHeader titolo="Invita utente" sottotitolo="Crea un nuovo account per l'accesso all'ERP e assegna un ruolo." />

<div class="max-w-2xl">
  {#if created}
    <div class="mb-4 flex items-start gap-3 rounded-3xl bg-emerald-50 border border-emerald-100 p-4 text-sm text-emerald-800" role="status">
      <CheckCircle2 class="h-5 w-5 mt-0.5 flex-shrink-0" />
      <p>
        Utente <strong>{created.email}</strong> creato come <strong>{created.ruolo}</strong>. Comunicagli la password
        iniziale in modo sicuro.
      </p>
    </div>
  {/if}

  <Card>
    <form onsubmit={handleSubmit} class="space-y-5">
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="space-y-1.5">
          <label for="nome" class="block text-sm font-medium">Nome</label>
          <input id="nome" class="field" bind:value={nome} required autocomplete="off" />
        </div>
        <div class="space-y-1.5">
          <label for="cognome" class="block text-sm font-medium">Cognome</label>
          <input id="cognome" class="field" bind:value={cognome} autocomplete="off" />
        </div>
      </div>

      <div class="space-y-1.5">
        <label for="email" class="block text-sm font-medium">Email</label>
        <input id="email" type="email" class="field" placeholder="nome@azienda.it" bind:value={email} required autocomplete="off" />
      </div>

      <fieldset class="space-y-2">
        <legend class="text-sm font-medium mb-1.5">Ruolo</legend>
        <div class="grid gap-2 sm:grid-cols-3">
          {#each ROLES as r}
            <label
              class="cursor-pointer rounded-2xl border p-3 transition-colors {ruolo === r.value
                ? 'border-[#1A1A1A] bg-[#FFFDE7]'
                : 'border-black/[0.07] bg-white hover:bg-[#FFFDE7]'}"
            >
              <input type="radio" name="ruolo" value={r.value} bind:group={ruolo} class="sr-only" />
              <span class="block text-sm font-semibold">{r.label}</span>
              <span class="block text-xs text-[#6B7280] mt-0.5">{r.hint}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      {#if ruolo === 'agente'}
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label for="pct" class="block text-sm font-medium">Provvigione % (sull’imponibile)</label>
            <input id="pct" type="number" min="0" max="100" step="0.5" class="field" bind:value={provvigione} />
            <p class="text-xs text-[#6B7280]">Se è un subagente, è la sua quota tolta da quella del padre (piramide).</p>
          </div>
          <div class="space-y-1.5">
            <label for="padre" class="block text-sm font-medium">Agente padre</label>
            <select id="padre" class="field" bind:value={agentePadre}>
              <option value="">Nessuno — agente diretto</option>
              {#each agentiPadre as a}
                <option value={a.id}>{[a.nome, a.cognome].filter(Boolean).join(' ') || a.email}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}

      <div class="space-y-1.5">
        <label for="password" class="block text-sm font-medium">Password iniziale</label>
        <div class="flex gap-2">
          <input id="password" type="text" class="field font-mono" bind:value={password} required minlength="8" autocomplete="new-password" />
          <button type="button" class="chip !rounded-2xl" onclick={generatePassword}>Genera</button>
        </div>
        <p class="text-xs text-[#9CA3AF]">Minimo 8 caratteri.</p>
      </div>

      {#if error}
        <div class="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700" role="alert">
          <AlertCircle class="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      {/if}

      <button
        type="submit"
        class="w-full sm:w-auto min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] px-6 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
        disabled={loading}
      >
        <UserPlus class="h-4 w-4" />
        {loading ? 'Creazione…' : 'Crea utente'}
      </button>
    </form>
  </Card>
</div>
