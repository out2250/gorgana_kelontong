<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import LoadingButton from "@/components/LoadingButton.vue";
import PageErrorAlert from "@/components/PageErrorAlert.vue";
import PageHeader from "@/components/PageHeader.vue";
import { createBrand, getBrands, type BrandDto } from "@/services/api";
import { getErrorMessage } from "@/services/error";
import { useToast } from "@/services/toast";

const brands = ref<BrandDto[]>([]);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const search = ref("");
const isActiveOnly = ref(true);
const newName = ref("");
const toast = useToast();

const filteredBrands = computed(() => {
	const keyword = search.value.trim().toLowerCase();
	if (!keyword) {
		return brands.value;
	}
	return brands.value.filter((item) => item.name.toLowerCase().includes(keyword));
});

async function loadBrands() {
	loading.value = true;
	error.value = "";
	try {
		const result = await getBrands({ page: 1, pageSize: 200, isActive: isActiveOnly.value || undefined });
		brands.value = result.items;
	} catch (err) {
		error.value = getErrorMessage(err, "Gagal memuat data brand");
	} finally {
		loading.value = false;
	}
}

async function submitBrand() {
	const name = newName.value.trim();
	if (!name) {
		toast.warning("Nama brand wajib diisi");
		return;
	}

	submitting.value = true;
	try {
		await createBrand({ name, isActive: true });
		newName.value = "";
		toast.success("Brand berhasil ditambahkan");
		await loadBrands();
	} catch (err) {
		toast.error(getErrorMessage(err, "Gagal menambahkan brand"));
	} finally {
		submitting.value = false;
	}
}

onMounted(() => {
	void loadBrands();
});
</script>

<template>
	<section>
		<PageHeader title="Brand Master" subtitle="Kelola daftar brand untuk pemilihan produk via LOV." />

		<article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
			<h2 class="text-sm font-semibold text-slate-900">Tambah Brand</h2>
			<div class="mt-3 flex flex-col gap-2 md:flex-row">
				<input v-model="newName" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nama brand" />
				<LoadingButton
					:loading="submitting"
					loading-text="Menyimpan..."
					class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
					@click="submitBrand"
				>
					Simpan Brand
				</LoadingButton>
			</div>
		</article>

		<article class="mt-4 rounded-xl border border-slate-200 bg-white p-4">
			<div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
				<h2 class="text-sm font-semibold text-slate-900">Daftar Brand</h2>
				<div class="flex gap-2">
					<input v-model="search" class="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Cari brand..." />
					<label class="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700">
						<input v-model="isActiveOnly" type="checkbox" @change="loadBrands" />
						Active only
					</label>
					<button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" @click="loadBrands">Refresh</button>
				</div>
			</div>

			<PageErrorAlert :message="error" class="mt-2" />

			<div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
				<table class="min-w-full divide-y divide-slate-200 text-sm">
					<thead class="bg-slate-50 text-left text-slate-600">
						<tr>
							<th class="px-3 py-2">Nama</th>
							<th class="px-3 py-2">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-100 bg-white">
						<tr v-for="item in filteredBrands" :key="item.id">
							<td class="px-3 py-2">{{ item.name }}</td>
							<td class="px-3 py-2">{{ item.isActive ? 'Active' : 'Inactive' }}</td>
						</tr>
						<tr v-if="!loading && filteredBrands.length === 0">
							<td colspan="2" class="px-3 py-4 text-center text-slate-500">Data brand belum ada</td>
						</tr>
						<tr v-if="loading">
							<td colspan="2" class="px-3 py-4 text-center text-slate-500">Loading...</td>
						</tr>
					</tbody>
				</table>
			</div>
		</article>
	</section>
</template>
