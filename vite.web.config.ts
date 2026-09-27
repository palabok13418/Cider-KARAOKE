import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins:[vue({template:{compilerOptions:{isCustomElement:(tag)=>tag.startsWith("cider-")}}})],
  server:{port:4173,host:"0.0.0.0"},
  build:{
    outDir:"dist-web",
    target:"es2020",
    sourcemap:true,
    rollupOptions:{input:fileURLToPath(new URL("./web.html", import.meta.url))}
  }
});
