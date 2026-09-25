import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins:[tsconfigPaths(),vue()],
  server:{port:5173,host:"127.0.0.1"},
  build:{outDir:"dist-web",target:"es2020",sourcemap:true}
});
