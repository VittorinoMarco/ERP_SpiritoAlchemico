<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { Eye, EyeOff, FlaskConical, Loader2, AlertCircle, ShieldCheck, Boxes, LineChart } from 'lucide-svelte';
  import { pb } from '$lib/pocketbase';
  import { roleOf } from '$lib/stores/auth';

  let email = '';
  let password = '';
  let error = '';
  let loading = false;
  let showPassword = false;
  let ready = false;

  /** Destinazione post-login: accettiamo solo percorsi interni (evita open redirect). */
  function safeNext(): string {
    const n = $page.url.searchParams.get('next') ?? '';
    return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : '/';
  }

  onMount(() => {
    if (pb.authStore.isValid && roleOf(pb.authStore.model as { role?: string; ruolo?: string })) {
      goto(safeNext(), { replaceState: true });
      return;
    }
    if ($page.url.searchParams.get('error') === 'ruolo') {
      error = 'Il tuo account non ha un ruolo assegnato. Contatta un amministratore.';
    }
    ready = true;
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (loading) return;
    error = '';
    loading = true;

    try {
      const auth = await pb.collection('users').authWithPassword(email.trim(), password);
      if (!roleOf(auth.record as { role?: string; ruolo?: string })) {
        pb.authStore.clear();
        error = 'Il tuo account non ha un ruolo assegnato. Contatta un amministratore.';
        return;
      }
      // Registro attività: non deve mai bloccare l'accesso
      pb.collection('activity_log')
        .create({
          utente: auth.record?.id,
          azione: 'login',
          collection_rif: 'users',
          record_rif: auth.record?.id ?? '',
          dettagli: JSON.stringify({ messaggio: 'Accesso effettuato' })
        })
        .catch(() => {});
      await goto(safeNext(), { replaceState: true });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      error =
        status === 0
          ? 'Impossibile contattare il server. Controlla la connessione.'
          : 'Email o password non corrette.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Accedi · SpiritoAlchemico ERP</title>
</svelte:head>

<div class="min-h-dvh grid lg:grid-cols-[1.05fr_1fr]">
  <!-- Pannello brand (solo desktop) -->
  <aside class="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#1F1F1F] text-white m-4 rounded-[36px] p-12">
    <div class="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full bg-[#F5D547]/25 blur-3xl"></div>
    <div class="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-[#FF9F43]/20 blur-3xl"></div>

    <div class="relative flex items-center gap-3">
      <span class="h-12 w-12 rounded-2xl bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center">
        <FlaskConical class="h-6 w-6" />
      </span>
      <span class="text-lg font-bold tracking-tight">SpiritoAlchemico</span>
    </div>

    <div class="relative max-w-md">
      <h2 class="text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
        Ordini, magazzino e fatture in un unico posto.
      </h2>
      <ul class="mt-10 space-y-5 text-white/70">
        <li class="flex items-center gap-4">
          <span class="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F5D547]"><Boxes class="h-5 w-5" /></span>
          Giacenze sempre aggiornate, con avvisi di sotto scorta
        </li>
        <li class="flex items-center gap-4">
          <span class="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F5D547]"><LineChart class="h-5 w-5" /></span>
          Fatturato e provvigioni agenti a colpo d'occhio
        </li>
        <li class="flex items-center gap-4">
          <span class="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center text-[#F5D547]"><ShieldCheck class="h-5 w-5" /></span>
          Accessi separati per amministratori, agenti e magazzino
        </li>
      </ul>
    </div>

    <p class="relative text-xs text-white/35">© {new Date().getFullYear()} SpiritoAlchemico</p>
  </aside>

  <!-- Form -->
  <main class="flex items-center justify-center px-5 py-10 sm:px-10">
    <div class="w-full max-w-sm {ready ? 'fade-in' : 'opacity-0'}">
      <div class="lg:hidden flex items-center gap-3 mb-10">
        <span class="h-12 w-12 rounded-2xl bg-[#F5D547] text-[#1A1A1A] flex items-center justify-center shadow-[0_10px_24px_-10px_rgba(245,213,71,0.9)]">
          <FlaskConical class="h-6 w-6" />
        </span>
        <span class="text-lg font-bold tracking-tight">SpiritoAlchemico</span>
      </div>

      <h1 class="text-3xl sm:text-4xl font-bold tracking-tight text-[#1A1A1A]">Bentornato</h1>
      <p class="mt-2 text-sm text-[#6B7280]">Accedi al pannello di controllo dell'ERP.</p>

      <form onsubmit={handleSubmit} class="mt-8 space-y-4" novalidate={false}>
        <div class="space-y-1.5">
          <label for="email" class="block text-sm font-medium text-[#1A1A1A]">Email</label>
          <input
            id="email"
            type="email"
            class="field"
            placeholder="nome@azienda.it"
            autocomplete="username"
            inputmode="email"
            autocapitalize="none"
            bind:value={email}
            required
          />
        </div>

        <div class="space-y-1.5">
          <label for="password" class="block text-sm font-medium text-[#1A1A1A]">Password</label>
          <div class="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              class="field !pr-12"
              placeholder="••••••••"
              autocomplete="current-password"
              bind:value={password}
              required
            />
            <button
              type="button"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-full text-[#9CA3AF] hover:text-[#1A1A1A] hover:bg-black/5"
              onclick={() => (showPassword = !showPassword)}
              aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
            >
              {#if showPassword}<EyeOff class="h-[18px] w-[18px]" />{:else}<Eye class="h-[18px] w-[18px]" />{/if}
            </button>
          </div>
        </div>

        {#if error}
          <div class="flex items-start gap-2 rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700" role="alert">
            <AlertCircle class="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        {/if}

        <button
          type="submit"
          class="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] text-white text-sm font-semibold hover:bg-black transition-colors disabled:opacity-60"
          disabled={loading || !email || !password}
        >
          {#if loading}<Loader2 class="h-4 w-4 animate-spin" /> Accesso in corso…{:else}Accedi{/if}
        </button>
      </form>

      <p class="mt-8 text-xs text-[#9CA3AF]">
        Non riesci ad accedere? Chiedi a un amministratore di reimpostare la tua password.
      </p>
    </div>
  </main>
</div>
