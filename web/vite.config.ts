import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({plugins:[vue()],root:".",build:{outDir:"dist-web",emptyOutDir:true,target:"es2020"},server:{port:4170,host:"127.0.0.1"}});
