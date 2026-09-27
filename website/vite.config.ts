import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins:[vue()],
  build:{
    outDir:"dist",
    emptyOutDir:true,
    target:"es2020",
    sourcemap:true,
    rollupOptions:{input:fileURLToPath(new URL("./index.html",import.meta.url))}
  }
});
