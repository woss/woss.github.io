<script lang="ts">
  import { soundEnabled } from '$lib/stores/sounds';
  import { playPluckSound } from '$lib/utils/sounds';

  function toggle() {
    const wasOff = !$soundEnabled;
    soundEnabled.toggle();
    if (wasOff) playPluckSound(true);
  }
</script>

<button
  onclick={toggle}
  class="flex items-center justify-center w-7 h-7 border-0 rounded-md bg-transparent text-outline cursor-pointer transition-colors duration-150 hover:text-on-surface-variant hover:bg-[rgba(255,255,255,0.06)]"
  aria-label={$soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
  title={$soundEnabled ? 'Sound on' : 'Sound off'}
>
  {#if $soundEnabled}
    <!-- Speaker with sound waves (on) -->
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  {:else}
    <!-- Speaker with X (muted) -->
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  {/if}
</button>
