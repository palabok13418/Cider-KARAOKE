import { defineCustomElement } from "vue";
import { definePluginContext, addImmersiveLayout } from "./vendor/pluginkit";
import KaraokeHost from "./components/KaraokeHost.vue";
import config from "./plugin.config";
import "./styles.css";
import "./immersive-shell-fix.css";
import { installLibraryBridge, primeAppleMusicLibrary } from "./library-bridge";

const KaraokeElement = defineCustomElement(KaraokeHost,{shadowRoot:false});

const {plugin,customElementName} = definePluginContext({
  ...config,
  CustomElements: {"karaoke-immersive":KaraokeElement},
  setup() {
    installLibraryBridge();
    void primeAppleMusicLibrary();
    customElements.define(customElementName("karaoke-immersive"),KaraokeElement);
    addImmersiveLayout({
      name:"Karaoke",
      identifier:"cider-karaoke",
      component:customElementName("karaoke-immersive"),
      type:"normal"
    });
  }
});

export default plugin;
