<script lang="ts">
	import { apiClient } from '$lib/axios/axios';
	import Qr from '$lib/components/ui/qr.svelte';
	import { Card } from 'flowbite-svelte';
	import { onMount } from 'svelte';

	let qr: string | null = null;

	onMount(async () => {
		const {
			data: { uri }
		} = await apiClient.get('/oid4vc/credentials/offer');
		qr = uri;
	});
</script>

<div class="flex h-screen w-screen justify-between items-center">
	{#if qr}
		<Card>
			<Qr data={qr}></Qr>
		</Card>
	{/if}
</div>
