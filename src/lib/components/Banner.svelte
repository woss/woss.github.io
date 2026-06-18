<script lang="ts">
  import { Banner as SvBanner } from 'sv5ui';

  let {
    type = 'info',
    message = '',
    persistent = false,
    onclose = () => {},
  }: {
    type?: 'info' | 'warning' | 'pro';
    message?: string;
    persistent?: boolean;
    onclose?: () => void;
  } = $props();
</script>

{#if type === 'info'}
  <SvBanner color="info" title={message} close={!persistent} onClose={onclose} icon="lucide:info" />
{:else if type === 'warning'}
  <SvBanner color="warning" title={message} close={!persistent} onClose={onclose} icon="lucide:triangle-alert" />
{:else if type === 'pro'}
  <SvBanner
    color="info"
    title={message}
    close={!persistent}
    onClose={onclose}
    icon="lucide:sparkles"
    class="bg-[#00da8c]/10 text-[#00da8c]"
    actions={[{ label: 'Upgrade', variant: 'solid', color: 'success' }]}
  />
{/if}
