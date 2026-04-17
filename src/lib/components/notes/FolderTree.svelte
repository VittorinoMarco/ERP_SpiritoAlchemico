<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import type { NoteFolder } from '$lib/types/adminNote';
  import { folderParentId, sortFolders } from '$lib/utils/noteFolderHelpers';
  import FolderTree from './FolderTree.svelte';

  export let allFolders: NoteFolder[];
  /** Cartelle con questo genitore (`null` = root). */
  export let parentId: string | null = null;
  export let selectedFolderId: string | null;
  export let onSelect: (id: string) => void;
  /** Profondità per indentazione (px). */
  export let depth = 0;

  $: children = allFolders
    .filter((f) => folderParentId(f) === (parentId || ''))
    .sort(sortFolders);
</script>

<ul class="space-y-0.5" role="list" style:padding-left={depth > 0 ? '0.5rem' : '0'}>
  {#each children as folder}
    <li>
      <button
        type="button"
        class="w-full text-left rounded-xl px-2 py-2 text-sm flex items-center gap-1.5 transition-colors min-h-[44px]"
        class:bg-[#FFF3CD]={selectedFolderId === folder.id}
        class:font-medium={selectedFolderId === folder.id}
        class:text-[#1A1A1A]={selectedFolderId === folder.id}
        class:text-[#6B7280]={selectedFolderId !== folder.id}
        class:hover:bg-white={selectedFolderId !== folder.id}
        onclick={() => onSelect(folder.id)}
      >
        {#if depth > 0}
          <ChevronRight class="h-3.5 w-3.5 text-[#9CA3AF] flex-shrink-0" />
        {:else}
          <span class="text-base leading-none flex-shrink-0" aria-hidden="true">📁</span>
        {/if}
        <span class="truncate">{folder.nome}</span>
      </button>
      <FolderTree
        {allFolders}
        parentId={folder.id}
        {selectedFolderId}
        {onSelect}
        depth={depth + 1}
      />
    </li>
  {/each}
</ul>
