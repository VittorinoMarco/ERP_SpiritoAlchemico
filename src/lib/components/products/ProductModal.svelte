<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import type { Product, ProductCategory } from '$lib/types/product';
  import { pb } from '$lib/pocketbase';
  import { Upload, X } from 'lucide-svelte';

  export let open = false;
  export let product: Product | null = null;

  const dispatch = createEventDispatcher<{ close: void; saved: Product }>();

  let nome = '';
  let sku = '';
  let descrizione = '';
  let categoria: ProductCategory = 'liquore';
  let prezzo_listino = '';
  let prezzo_horeca = '';
  let prezzo_ecommerce = '';
  let volume_ml = '';
  let gradazione = '';
  let attivo = true;
  let imageFile: File | null = null;
  let imagePreview = '';
  let errors: Record<string, string> = {};
  let saving = false;
  let dragOver = false;

  $: if (open && product) {
    nome = product.nome ?? '';
    sku = product.sku ?? '';
    descrizione = product.descrizione ?? '';
    categoria = (product.categoria as ProductCategory) ?? 'liquore';
    prezzo_listino = String(product.prezzo_listino ?? '');
    prezzo_horeca = String(product.prezzo_horeca ?? '');
    prezzo_ecommerce = String(product.prezzo_ecommerce ?? '');
    volume_ml = String(product.volume_ml ?? '');
    gradazione = String(product.gradazione ?? '');
    attivo = product.attivo ?? true;
    imageFile = null;
    imagePreview = product.immagine
      ? pb.files.getUrl(product as any, product.immagine)
      : '';
    errors = {};
  } else if (open && !product) {
    nome = sku = descrizione = '';
    categoria = 'liquore';
    prezzo_listino = prezzo_horeca = prezzo_ecommerce = volume_ml = gradazione = '';
    attivo = true;
    imageFile = null;
    imagePreview = '';
    errors = {};
  }

  function validate(): boolean {
    errors = {};
    if (!nome.trim()) errors.nome = 'Nome obbligatorio';
    if (!sku.trim()) errors.sku = 'SKU obbligatorio';
    const prezzoListino = parseFloat(prezzo_listino);
    const prezzoHoreca = parseFloat(prezzo_horeca);
    const prezzoEcommerce = parseFloat(prezzo_ecommerce);
    if (isNaN(prezzoListino) || prezzoListino < 0) errors.prezzo_listino = 'Prezzo non valido';
    if (isNaN(prezzoHoreca) || prezzoHoreca < 0) errors.prezzo_horeca = 'Prezzo non valido';
    if (isNaN(prezzoEcommerce) || prezzoEcommerce < 0) errors.prezzo_ecommerce = 'Prezzo non valido';
    if (volume_ml && (isNaN(parseFloat(volume_ml)) || parseFloat(volume_ml) < 0))
      errors.volume_ml = 'Valore non valido';
    if (gradazione && (isNaN(parseFloat(gradazione)) || parseFloat(gradazione) < 0))
      errors.gradazione = 'Valore non valido';
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!validate() || saving) return;
    saving = true;

    try {
      const data: Record<string, unknown> = {
        nome: nome.trim(),
        sku: sku.trim(),
        descrizione: descrizione.trim() || undefined,
        categoria,
        prezzo_listino: parseFloat(prezzo_listino),
        prezzo_horeca: parseFloat(prezzo_horeca),
        prezzo_ecommerce: parseFloat(prezzo_ecommerce),
        volume_ml: volume_ml ? parseFloat(volume_ml) : undefined,
        gradazione: gradazione ? parseFloat(gradazione) : undefined,
        attivo
      };

      if (imageFile) {
        data.immagine = imageFile;
      }

      let saved: Product;
      if (product?.id) {
        saved = await pb.collection('products').update(product.id, data) as Product;
      } else {
        saved = await pb.collection('products').create(data) as Product;
      }
      dispatch('saved', saved);
      dispatch('close');
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as any).message) : 'Errore salvataggio';
      errors.submit = msg;
    } finally {
      saving = false;
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.type.startsWith('image/')) {
      imageFile = file;
      imagePreview = URL.createObjectURL(file);
    }
    input.value = '';
  }

  function handleDrop(e: DragEvent) {
    dragOver = false;
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      imageFile = file;
      imagePreview = URL.createObjectURL(file);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function removeImage() {
    imageFile = null;
    imagePreview = '';
  }
</script>

<Modal open={open} title={product ? 'Modifica prodotto' : 'Nuovo prodotto'} size="xl" on:close={() => dispatch('close')}>
  <form onsubmit={handleSubmit} class="space-y-5">
    <div class="grid gap-5 sm:grid-cols-2">
      <Input
        id="nome"
        label="Nome"
        bind:value={nome}
        placeholder="Es. Limoncello"
        required
        error={errors.nome}
      />
      <Input
        id="sku"
        label="SKU"
        bind:value={sku}
        placeholder="Es. LIM-001"
        required
        error={errors.sku}
      />
    </div>

    <div>
      <label for="descrizione" class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Descrizione</label>
      <textarea
        id="descrizione"
        bind:value={descrizione}
        rows="3"
        class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
        placeholder="Descrizione del prodotto"
      ></textarea>
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <div class="space-y-1.5">
        <label for="categoria" class="block text-sm font-medium text-[#1A1A1A]">Categoria</label>
        <select
          id="categoria"
          bind:value={categoria}
          class="w-full rounded-2xl border border-black/5 bg-white/80 px-4 py-2.5 text-sm text-[#1A1A1A] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F5D547] focus-visible:ring-offset-2 transition-all duration-200"
        >
          <option value="liquore">Liquore</option>
          <option value="amaro">Amaro</option>
          <option value="gin">Gin</option>
        </select>
      </div>
      <div class="flex items-end gap-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={attivo} class="rounded border-black/20 text-[#F5D547] focus:ring-[#F5D547]" />
          <span class="text-sm text-[#1A1A1A]">Attivo</span>
        </label>
      </div>
    </div>

    <div class="grid gap-5 sm:grid-cols-3">
      <Input
        id="prezzo_listino"
        label="Prezzo listino (€)"
        type="number"
        step="0.01"
        min="0"
        bind:value={prezzo_listino}
        required
        error={errors.prezzo_listino}
      />
      <Input
        id="prezzo_horeca"
        label="Prezzo HORECA (€)"
        type="number"
        step="0.01"
        min="0"
        bind:value={prezzo_horeca}
        required
        error={errors.prezzo_horeca}
      />
      <Input
        id="prezzo_ecommerce"
        label="Prezzo E-commerce (€)"
        type="number"
        step="0.01"
        min="0"
        bind:value={prezzo_ecommerce}
        required
        error={errors.prezzo_ecommerce}
      />
    </div>

    <div class="grid gap-5 sm:grid-cols-2">
      <Input
        id="volume_ml"
        label="Volume (ml)"
        type="number"
        min="0"
        bind:value={volume_ml}
        placeholder="700"
        error={errors.volume_ml}
      />
      <Input
        id="gradazione"
        label="Gradazione (°)"
        type="number"
        step="0.1"
        min="0"
        bind:value={gradazione}
        placeholder="40"
        error={errors.gradazione}
      />
    </div>

    <div>
      <span class="block text-sm font-medium text-[#1A1A1A] mb-1.5">Immagine</span>
      <div
        role="button"
        tabindex="0"
        class="relative rounded-2xl border-2 border-dashed transition-colors {dragOver
          ? 'border-[#F5D547] bg-[#FFFDE7]'
          : 'border-black/10 bg-white/50'}"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        ondragleave={handleDragLeave}
      >
        <input
          type="file"
          accept="image/*"
          class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onchange={handleFileSelect}
        />
        {#if imagePreview}
          <div class="flex items-center gap-4 p-4">
            <img src={imagePreview} alt="Anteprima" class="h-20 w-20 rounded-xl object-cover" />
            <div class="flex-1">
              <p class="text-sm text-[#1A1A1A]">Immagine selezionata</p>
              <button
                type="button"
                class="mt-1 text-xs text-rose-600 hover:underline"
                onclick={(e) => { e.preventDefault(); removeImage(); }}
              >
                Rimuovi
              </button>
            </div>
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-8 text-center">
            <Upload class="h-10 w-10 text-[#9CA3AF] mb-2" />
            <p class="text-sm text-[#6B7280]">Trascina un'immagine qui o clicca per selezionare</p>
          </div>
        {/if}
      </div>
    </div>

    {#if errors.submit}
      <p class="text-xs text-rose-600">{errors.submit}</p>
    {/if}

    <div class="flex justify-end gap-3 pt-2">
      <Button type="button" variant="ghost" onclick={() => dispatch('close')}>
        Annulla
      </Button>
      <Button type="submit" variant="primary" disabled={saving}>
        {saving ? 'Salvataggio...' : product ? 'Salva modifiche' : 'Crea prodotto'}
      </Button>
    </div>
  </form>
</Modal>
