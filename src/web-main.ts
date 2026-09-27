import { createApp } from "vue";
import KaraokeHost from "./components/KaraokeHost.vue";
import "./styles.css";

createApp(KaraokeHost, { hostMode: "web" }).mount("#app");
