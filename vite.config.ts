import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import { stringify } from "yaml";
import config from "./src/plugin.config.ts";

export default defineConfig({
  plugins:[
    cssInjectedByJsPlugin(),
    AutoImport({imports:["vue"],include:[/\\.vue$/, /\\.vue\\?vue/]}),
    vue({template:{compilerOptions:{isCustomElement:(tag)=>tag.startsWith("cider-")}}}),
    {apply:"build",buildStart(){this.emitFile({fileName:"plugin.yml",type:"asset",source:stringify(config)});}}
  ],
  build:{
    outDir:"dist",
    minify:"esbuild",
    lib:{entry:"src/main.ts",fileName:"plugin",formats:["es"]},
    target:["es2020","chrome108"]
  },
  server:{port:3058,host:"127.0.0.1",cors:true}
});
