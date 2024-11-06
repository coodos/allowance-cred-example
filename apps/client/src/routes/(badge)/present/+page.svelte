<script lang="ts">
	import { apiClient } from '$lib/axios/axios';
	import Qr from '$lib/components/ui/qr.svelte';
	import { createWebsocket } from '$lib/utils/ws';
	import { Card } from 'flowbite-svelte';
	import { onMount } from 'svelte';

	let qr: string | null = null;

	onMount(async () => {
		const {
			data: { uri }
		} = await apiClient.get('/oid4vc/pex');
		qr = uri;

		const ws = createWebsocket();
		ws.onmessage = async (event) => {
			const data = JSON.parse(event.data);
			console.log(data);
			if (data.success) {
				window.location.href = 'https://github.com/tangle-labs/ngdil';
			}
		};
	});
</script>

<div class="flex min-h-[100vh] w-screen justify-center items-center">
	{#if qr}
		<Card class="flex flex-col items-center justify-center">
			<Qr data={qr}></Qr>
			<h1 class="mt-5">Present "Participation Badge" Credential</h1>
		</Card>
	{/if}
</div>
