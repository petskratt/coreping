<script>
  let { bins = [] } = $props();
  const max = $derived(bins.reduce((peak, bin) => Math.max(peak, bin.count), 1));
</script>

<div class="hist">
  {#each bins as bin (bin.from)}
    <div
      class="hist-bar"
      style:height="{(bin.count / max) * 100}%"
      title="{bin.from} to {bin.to} dB: {bin.count}"
    ></div>
  {/each}
</div>
