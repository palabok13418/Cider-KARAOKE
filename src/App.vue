<script setup lang="ts">
import { ref } from "vue";
import KaraokeHost from "./components/KaraokeHost.vue";
import MicJoin from "./components/MicJoin.vue";
import WebHostGate from "./components/WebHostGate.vue";

const params = new URLSearchParams(location.search);
const start = params.get("mode");
const mode = ref<"home"|"host"|"join">(start === "host" ? "host" : start === "join" ? "join" : "home");
const authed = ref(sessionStorage.getItem("cider-karaoke-demo-auth") === "1");

function go(next: "home"|"host"|"join") {
  mode.value = next;
  const query = new URLSearchParams(location.search);
  if (next === "home") query.delete("mode");
  else query.set("mode", next);
  const suffix = query.toString();
  history.replaceState({}, "", location.pathname + (suffix ? "?" + suffix : ""));
}
</script>

<template>
  <div class="app-root">
    <main v-if="mode==='home'" class="landing">
      <div class="landing-glow"></div>
      <header class="landing-nav">
        <div class="brandlock"><span class="brand-mark">🎤</span><strong>CIDER KARAOKE</strong></div>
        <span class="version">WEB PROTOTYPE</span>
      </header>

      <section class="landing-hero">
        <span class="eyebrow">STANDALONE KARAOKE HOST</span>
        <h1>Bring the karaoke machine to the web.</h1>
        <p>Host a karaoke session from a browser, then connect a phone as the microphone. No regular Cider interface is shown here.</p>
        <div class="landing-actions">
          <button class="primary-btn big" @click="go('host')">Host a session</button>
          <button class="ghost-btn big" @click="go('join')">Join with microphone</button>
        </div>
      </section>

      <section class="feature-strip">
        <div><span>01</span><strong>Cider account host gate</strong><small>Hosting starts after the supported Cider sign-in flow.</small></div>
        <div><span>02</span><strong>Karaoke-only UI</strong><small>Browser, queue, lyrics, visuals, and the host code. Nothing else.</small></div>
        <div><span>03</span><strong>Phone microphone</strong><small>Join with the four-digit code and grant browser mic access.</small></div>
      </section>
    </main>

    <WebHostGate v-else-if="mode==='host' && !authed" @authenticated="authed=true;go('host')" />
    <KaraokeHost v-else-if="mode==='host'" host-mode="web" />
    <MicJoin v-else />
  </div>
</template>
