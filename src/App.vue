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
  else query.set("mode",next);
  const suffix = query.toString();
  history.replaceState({}, "", location.pathname + (suffix ? "?"+suffix : ""));
}
</script>

<template>
  <div class="app-root">
    <main v-if="mode==='home'" class="landing">
      <div class="landing-glow"></div>
      <header class="landing-nav">
        <div class="brandlock"><span class="brand-mark">🎤</span><strong>CIDER KARAOKE</strong></div>
        <span class="version">PROTOTYPE 0.1</span>
      </header>
      <section class="landing-hero">
        <span class="eyebrow">A NEW KARAOKE LAYOUT FOR CIDER</span>
        <h1>Turn Cider into a karaoke machine.</h1>
        <p>Host on Cider, host on the web, or turn a phone into the microphone. One karaoke session, two host shells.</p>
        <div class="landing-actions">
          <button class="primary-btn big" @click="go('host')">Host on the web</button>
          <button class="ghost-btn big" @click="go('join')">Join with microphone</button>
        </div>
      </section>
      <section class="feature-strip">
        <div><span>01</span><strong>Apple Music Sing</strong><small>Browse and queue karaoke songs.</small></div>
        <div><span>02</span><strong>Local lyrics</strong><small>On-device translation and supported-script pronunciation.</small></div>
        <div><span>03</span><strong>Wireless mic</strong><small>Join with a four-digit host code.</small></div>
      </section>
    </main>

    <WebHostGate v-else-if="mode==='host' && !authed" @authenticated="authed=true;go('host')" />
    <KaraokeHost v-else-if="mode==='host'" host-mode="web" />
    <MicJoin v-else />
  </div>
</template>
