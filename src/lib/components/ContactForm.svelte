<script lang="ts">
  import { browser } from '$app/environment';
  import { toast } from 'svelte-sonner';

  let {
    showContactForm = $bindable(false),
    userId = '',
    chatId = '',
    ondismiss = () => {},
    /* eslint-disable-next-line no-useless-assignment -- written to propagate via $bindable() to parent */
    contactDismissed = $bindable(false),
  } = $props();

  let contactSubmitted = $state(false);
  let contactError = $state('');

  $effect(() => {
    if (contactSubmitted && browser) {
      const timer = setTimeout(() => {
        dismissContactForm();
      }, 4000);
      return () => clearTimeout(timer);
    }
  });

  let isSubmittingContact = $state(false);
  let contactName = $state('');
  let contactEmail = $state('');
  let contactCompany = $state('');
  let contactRole = $state('');
  let contactMessage = $state('');

  async function submitContact(e: Event): Promise<void> {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim()) return;
    isSubmittingContact = true;
    contactError = '';
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: contactName.trim(),
          email: contactEmail.trim(),
          companyName: contactCompany.trim(),
          role: contactRole.trim(),
          message: contactMessage.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      contactSubmitted = true;
      toast.success('Message sent!');
    } catch {
      contactError =
        'Something went wrong. Try again or email daniel@woss.io directly.';
    } finally {
      isSubmittingContact = false;
    }
  }

  function dismissContactForm(): void {
    showContactForm = false;
    contactDismissed = true;
    ondismiss();
    if (browser && chatId) {
      try {
        const dismissed = JSON.parse(
          localStorage.getItem('contact_dismissed_chats') || '[]',
        );
        if (!dismissed.includes(chatId)) {
          dismissed.push(chatId);
          localStorage.setItem(
            'contact_dismissed_chats',
            JSON.stringify(dismissed),
          );
        }
      } catch {
        /* ignore */
      }
    }
  }
</script>

{#if showContactForm && !contactSubmitted}
  <div
    class="border-t border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(0,255,136,0.015)] to-transparent"
  >
    <div class="px-8 py-8 max-md:px-4 max-w-[520px] mx-auto">
      <div class="flex items-center gap-3 mb-5">
        <div
          class="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20 shrink-0"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-primary"
          >
            <path
              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            />
          </svg>
        </div>
        <div>
          <p class="font-heading text-sm text-primary">Let's talk</p>
          <p class="font-body text-xs text-on-surface-variant mt-0.5">
            I'll forward your request to Daniel directly.
          </p>
        </div>
      </div>
      <form onsubmit={submitContact} class="flex flex-col gap-3.5">
        <div class="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Name *"
            bind:value={contactName}
            required
            class="flex-1 min-w-[180px] px-4 py-3 font-body text-sm bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary/50 focus:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)]"
          />
          <input
            type="email"
            placeholder="Email *"
            bind:value={contactEmail}
            required
            class="flex-1 min-w-[180px] px-4 py-3 font-body text-sm bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary/50 focus:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)]"
          />
        </div>
        <div class="flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Company"
            bind:value={contactCompany}
            class="flex-1 min-w-[140px] px-4 py-3 font-body text-sm bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary/50 focus:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)]"
          />
          <input
            type="text"
            placeholder="Role"
            bind:value={contactRole}
            class="flex-1 min-w-[140px] px-4 py-3 font-body text-sm bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary/50 focus:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)]"
          />
        </div>
        <textarea
          placeholder="Message"
          bind:value={contactMessage}
          rows="3"
          class="w-full px-4 py-3 font-body text-sm bg-surface-container-high border border-[rgba(255,255,255,0.08)] rounded-lg text-on-surface placeholder:text-outline outline-none transition-all duration-200 focus:border-primary/50 focus:shadow-[0_0_0_1px_rgba(0,255,136,0.15),0_0_20px_rgba(0,255,136,0.05)] resize-none"
        ></textarea>
        {#if contactError}
          <div
            class="flex items-center gap-2 px-3 py-2.5 bg-secondary/10 border border-secondary/20 rounded-lg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="text-secondary shrink-0"
              ><circle cx="12" cy="12" r="10" /><line
                x1="12"
                y1="8"
                x2="12"
                y2="12"
              /><line x1="12" y1="16" x2="12.01" y2="16" /></svg
            >
            <p class="text-xs text-secondary/90">{contactError}</p>
          </div>
        {/if}
        <div class="flex items-center gap-3 pt-0.5">
          <button
            type="submit"
            disabled={isSubmittingContact}
            class="flex items-center gap-2 px-6 py-2.5 font-body text-sm font-medium text-surface bg-primary border-0 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-[0_0_24px_rgba(0,255,136,0.2)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:scale-100"
          >
            {#if isSubmittingContact}
              <span
                class="w-4 h-4 rounded-full border-2 border-surface/30 border-t-surface animate-spin"
              ></span>
              Sending...
            {:else}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><line x1="22" y1="2" x2="11" y2="13" /><polygon
                  points="22 2 15 22 11 13 2 9 22 2" /></svg
              >
              Send
            {/if}
          </button>
          <button
            type="button"
            onclick={dismissContactForm}
            class="flex items-center gap-1.5 px-3.5 py-2.5 font-body text-xs text-outline bg-transparent border border-[rgba(255,255,255,0.06)] rounded-lg cursor-pointer transition-all duration-200 hover:text-on-surface-variant hover:border-[rgba(255,255,255,0.12)] hover:bg-white/[0.02] active:scale-95"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              ><line x1="18" y1="6" x2="6" y2="18" /><line
                x1="6"
                y1="6"
                x2="18"
                y2="18"
              /></svg
            >
            Not now
          </button>
        </div>
      </form>
    </div>
  </div>
{:else if contactSubmitted}
  <div
    class="border-t border-[rgba(255,255,255,0.08)] bg-gradient-to-b from-[rgba(0,255,136,0.015)] to-transparent"
  >
    <div class="px-8 py-8 max-md:px-4 max-w-[520px] mx-auto">
      <div class="flex items-center gap-3">
        <div
          class="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 border border-primary/20 shrink-0"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-primary"><polyline points="20 6 9 17 4 12" /></svg
          >
        </div>
        <div>
          <p class="font-heading text-sm text-primary">Message sent!</p>
          <p class="font-body text-xs text-on-surface-variant mt-0.5">
            Thanks for reaching out. Daniel will get back to you soon.
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
