<script lang="ts">
  import { onMount } from 'svelte';
  import { settingsStore } from '$lib/stores/settings';
  import Card from '$lib/components/ui/Card.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { pb } from '$lib/pocketbase';
  import { sendAssistantChatStream, type ChatMessage } from '$lib/utils/assistantChat';
  import { buildAssistantDataSnapshot } from '$lib/utils/assistantContext';
  import {
    listSessions,
    createSession,
    updateSession,
    deleteSession,
    titleFromFirstMessage,
    isAiChatCollectionMissingError,
    AI_CHAT_COLLECTION,
    type AssistantSession,
    type StoredChatMessage
  } from '$lib/utils/assistantSessions';
  import { MessageSquare, Plus, Trash2, Sparkles, PanelLeftClose, PanelLeft, AlertCircle } from 'lucide-svelte';

  let sessions: AssistantSession[] = [];
  let activeId = '';
  let input = '';
  let loading = false;
  let error = '';
  let sidebarOpen = true;
  let sessionsLoading = true;
  let collectionMissing = false;
  let sessionsLoadError = '';
  /** Anteprima risposta mentre arriva lo stream OpenAI. */
  let streamPreview = '';

  $: apiKey = $settingsStore.openaiApiKey ?? '';
  $: activeSession = sessions.find((s) => s.id === activeId);
  $: messages = activeSession?.messages ?? [];

  async function refreshList() {
    try {
      sessions = await listSessions();
      sessionsLoadError = '';
      collectionMissing = false;
    } catch (e) {
      if (isAiChatCollectionMissingError(e)) {
        collectionMissing = true;
        sessionsLoadError = `Crea la collection PocketBase "${AI_CHAT_COLLECTION}" come da docs/POCKETBASE_SCHEMA.md`;
      } else {
        sessionsLoadError = e instanceof Error ? e.message : 'Errore caricamento sessioni';
      }
      sessions = [];
    }
  }

  onMount(() => {
    (async () => {
      sessionsLoading = true;
      await refreshList();
      if (!collectionMissing) {
        if (sessions.length === 0) {
          await startNewChat();
        } else {
          activeId = sessions[0].id;
        }
      }
      sessionsLoading = false;
    })();
  });

  async function startNewChat() {
    if (collectionMissing) return;
    error = '';
    try {
      const s = await createSession();
      await refreshList();
      activeId = s.id;
      input = '';
    } catch (e) {
      if (isAiChatCollectionMissingError(e)) {
        collectionMissing = true;
        sessionsLoadError = `Collection "${AI_CHAT_COLLECTION}" non trovata.`;
      } else {
        error = e instanceof Error ? e.message : 'Impossibile creare la chat';
      }
    }
  }

  function selectSession(id: string) {
    activeId = id;
    error = '';
  }

  async function removeSession(id: string, e?: Event) {
    e?.stopPropagation();
    if (collectionMissing) return;
    const wasActive = activeId === id;
    try {
      await deleteSession(id);
      await refreshList();
      if (wasActive) {
        activeId = sessions[0]?.id ?? '';
        if (!activeId) await startNewChat();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Eliminazione fallita';
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || !apiKey || collectionMissing) return;
    if (!activeId) await startNewChat();

    error = '';
    loading = true;
    input = '';

    let sid = activeId;
    let sess = sessions.find((s) => s.id === sid);
    if (!sess) {
      await startNewChat();
      await refreshList();
      sid = activeId;
      sess = sessions.find((s) => s.id === sid);
    }
    if (!sess) {
      loading = false;
      return;
    }

    const userMsg: StoredChatMessage = { role: 'user', content: text };
    const nextMessages = [...sess.messages, userMsg];
    const title =
      sess.messages.length === 0 ? titleFromFirstMessage(text) : sess.title;

    try {
      await updateSession({
        ...sess,
        title,
        messages: nextMessages,
        updatedAt: new Date().toISOString()
      });
      await refreshList();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Salvataggio messaggio fallito';
      loading = false;
      return;
    }

    const forApi: ChatMessage[] = nextMessages.map((m) => ({
      role: m.role,
      content: m.content
    }));

    streamPreview = '';
    try {
      const snapshot = await buildAssistantDataSnapshot(pb).catch(
        () =>
          '[Dati ERP — lettura non riuscita (rete o permessi PocketBase). Rispondi in modo generico e suggerisci di aprire le pagine dell’app.]'
      );
      const reply = await sendAssistantChatStream(apiKey, forApi, {
        dataSnapshot: snapshot,
        onChunk: (full) => {
          streamPreview = full;
        }
      });
      const cur = sessions.find((s) => s.id === sid);
      if (cur) {
        await updateSession({
          ...cur,
          messages: [...cur.messages, { role: 'assistant', content: reply || streamPreview }],
          updatedAt: new Date().toISOString()
        });
        await refreshList();
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Errore invio messaggio';
    } finally {
      streamPreview = '';
      loading = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }
</script>

<svelte:head>
  <title>Assistente AI | ERP Spirito Alchemico</title>
</svelte:head>

<div class="flex flex-col gap-4 min-h-[calc(100vh-8rem)]">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div class="flex items-center gap-3">
      <div
        class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F5D547] to-[#FFF8E7] text-[#1A1A1A]"
      >
        <Sparkles class="h-5 w-5" />
      </div>
      <div>
        <h1 class="text-2xl font-bold text-[#1A1A1A] tracking-tight">Assistente AI</h1>
        <p class="text-sm text-[#6B7280]">
          Chat dedicata · lo storico è salvato su PocketBase (sessioni per utente)
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="sm" className="!px-3" onclick={() => (sidebarOpen = !sidebarOpen)}>
        {#if sidebarOpen}
          <PanelLeftClose class="h-4 w-4" />
        {:else}
          <PanelLeft class="h-4 w-4" />
        {/if}
        <span class="hidden sm:inline">Storico</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onclick={() => startNewChat()}
        disabled={collectionMissing || sessionsLoading}
        className="inline-flex items-center gap-1.5"
      >
        <Plus class="h-4 w-4" />
        Nuova chat
      </Button>
    </div>
  </div>

  {#if collectionMissing || sessionsLoadError}
    <div
      class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 items-start"
    >
      <AlertCircle class="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div>
        <p class="font-medium">Configurazione PocketBase</p>
        <p class="text-amber-800/90">{sessionsLoadError}</p>
        <p class="text-xs mt-2 text-amber-800/80">
          Collection: <code class="bg-black/5 px-1 rounded">{AI_CHAT_COLLECTION}</code> — vedi
          <code class="bg-black/5 px-1 rounded">docs/POCKETBASE_SCHEMA.md</code>
        </p>
      </div>
    </div>
  {/if}

  {#if !apiKey}
    <Card>
      <p class="text-sm text-[#6B7280]">
        Configura la chiave API OpenAI in
        <a href="/impostazioni" class="text-[#F5D547] font-medium underline">Impostazioni</a>
        per usare l’assistente.
      </p>
    </Card>
  {/if}

  {#if sessionsLoading}
    <Card>
      <p class="text-sm text-[#6B7280] py-8 text-center">Caricamento sessioni…</p>
    </Card>
  {:else}
    <div class="flex flex-1 gap-4 min-h-0">
      {#if sidebarOpen && !collectionMissing}
        <aside
          class="w-full sm:w-64 flex-shrink-0 flex flex-col rounded-3xl border border-black/5 bg-white/80 shadow-sm overflow-hidden max-h-[420px] sm:max-h-[calc(100vh-14rem)]"
        >
          <div class="px-4 py-3 border-b border-black/5 flex items-center gap-2 text-xs font-semibold text-[#6B7280]">
            <MessageSquare class="h-4 w-4" />
            Conversazioni
          </div>
          <div class="overflow-y-auto flex-1 p-2 space-y-1">
            {#each sessions as s (s.id)}
              <div class="group relative">
                <button
                  type="button"
                  class="w-full text-left rounded-2xl px-3 py-2.5 text-sm transition-colors"
                  class:bg-[#FFF3CD]={activeId === s.id}
                  class:font-medium={activeId === s.id}
                  class:text-[#1A1A1A]={activeId === s.id}
                  class:text-[#6B7280]={activeId !== s.id}
                  class:hover:bg-neutral-100={activeId !== s.id}
                  onclick={() => selectSession(s.id)}
                >
                  <span class="line-clamp-2">{s.title}</span>
                  <span class="block text-[10px] text-[#9CA3AF] mt-0.5">
                    {new Date(s.updatedAt).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  class="absolute top-2 right-2 p-1 rounded-lg text-[#9CA3AF] opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 transition-all"
                  aria-label="Elimina chat"
                  onclick={(e) => removeSession(s.id, e)}
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </button>
              </div>
            {/each}
          </div>
        </aside>
      {/if}

      <Card className="flex-1 flex flex-col min-h-[420px] sm:min-h-[calc(100vh-14rem)] overflow-hidden !p-0">
        <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {#if collectionMissing}
            <div class="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <Sparkles class="h-10 w-10 text-[#E5E7EB] mb-3" />
              <p class="text-[#1A1A1A] font-medium">Assistente non disponibile</p>
              <p class="text-sm text-[#6B7280] mt-2 max-w-md">
                Crea la collection <code class="bg-black/5 px-1 rounded text-xs">{AI_CHAT_COLLECTION}</code> in
                PocketBase per abilitare le chat salvate nel database.
              </p>
            </div>
          {:else if messages.length === 0}
            <div class="h-full flex flex-col items-center justify-center text-center py-12 px-4">
              <Sparkles class="h-10 w-10 text-[#E5E7EB] mb-3" />
              <p class="text-[#1A1A1A] font-medium">Come posso aiutarti?</p>
              <p class="text-sm text-[#6B7280] mt-2 max-w-md">
                A ogni messaggio l’assistente legge un <strong>riepilogo aggiornato</strong> da PocketBase (ordini, magazzino,
                fatture…) e risponde in <strong>streaming</strong> mentre scrive.
              </p>
            </div>
          {:else}
            {#each messages as m, i (i + m.role + (m.content?.slice(0, 24) ?? ''))}
              <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
                <div
                  class="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words"
                  class:bg-[#1A1A1A]={m.role === 'user'}
                  class:text-white={m.role === 'user'}
                  class:bg-[#F3F4F6]={m.role === 'assistant'}
                  class:text-[#1A1A1A]={m.role === 'assistant'}
                >
                  {m.content}
                </div>
              </div>
            {/each}
          {/if}
          {#if loading}
            <div class="flex justify-start">
              <div
                class="max-w-[85%] rounded-2xl bg-[#F3F4F6] px-4 py-2.5 text-sm text-[#1A1A1A] whitespace-pre-wrap break-words"
              >
                {#if streamPreview}
                  {streamPreview}<span class="text-[#F5D547] font-bold" aria-hidden="true">▌</span>
                {:else}
                  <span class="text-[#6B7280] animate-pulse">Lettura dati aggiornati dall’ERP…</span>
                {/if}
              </div>
            </div>
          {/if}
        </div>

        {#if error}
          <p class="px-4 sm:px-6 text-xs text-rose-600">{error}</p>
        {/if}

        <div class="border-t border-black/5 p-3 sm:p-4 bg-white/90">
          <div class="flex gap-2 items-end">
            <textarea
              rows="2"
              class="flex-1 rounded-2xl border border-black/10 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#F5D547]"
              placeholder={collectionMissing
                ? 'Configura PocketBase…'
                : apiKey
                  ? 'Scrivi un messaggio… (Invio per inviare)'
                  : 'Configura la API key in Impostazioni'}
              bind:value={input}
              disabled={!apiKey || loading || collectionMissing}
              onkeydown={onKeydown}
            ></textarea>
            <Button
              variant="primary"
              size="sm"
              className="!py-3 self-stretch"
              onclick={() => send()}
              disabled={!apiKey || loading || collectionMissing || !input.trim()}
            >
              Invia
            </Button>
          </div>
        </div>
      </Card>
    </div>
  {/if}
</div>
