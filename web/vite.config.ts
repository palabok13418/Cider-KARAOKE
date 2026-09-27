import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  root: webRoot,
  plugins: [vue()],
  build: { outDir: fileURLToPath(new URL("../dist-web/", import.meta.url)), emptyOutDir: true, target: "es2020" },
  server: { port: 4170, host: "127.0.0.1" }
});
