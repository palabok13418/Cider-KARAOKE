import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({root:"website",plugins:[vue()],build:{outDir:"../dist-web",emptyOutDir:true}});
