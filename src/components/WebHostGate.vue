<script setup lang="ts">
import { computed, ref } from "vue";

const emit = defineEmits<{authenticated:[]}>();
const demo = computed(() => !import.meta.env.VITE_CIDER_AUTH_URL);
const busy = ref(false);

function login() {
  const url = import.meta.env.VITE_CIDER_AUTH_URL;
  if (url) {
    window.location.href = url;
    return;
  }
  busy.value = true;
  setTimeout(() => {
    sessionStorage.setItem("cider-karaoke-demo-auth","1");
    busy.value = false;
    emit("authenticated");
  },450);
}
</script>

<template>
  <main class="auth-card">
    <div class="auth-badge">CK</div>
    <span class="eyebrow">HOST ACCESS</span>
    <h1>Cider KARAOKE</h1>
    <p>Web hosts sign in with their Cider account before starting a karaoke session. Microphone guests do not need a Cider account.</p>
    <button class="primary-btn big" :disabled="busy" @click="login">
      {{ busy ? "Connecting…" : demo ? "Enter prototype host" : "Sign in with Cider" }}
    </button>
    <small v-if="demo" class="demo-note">Prototype auth adapter. Set VITE_CIDER_AUTH_URL for the supported Cider login flow.</small>
  </main>
</template>
