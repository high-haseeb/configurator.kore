import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite"; 
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
    assetsInclude: ['**/*.hdr', '**/*.ktx2'],
    plugins: [
        viteCompression(),
        tailwindcss(),
    ],
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/three')) {
                        return 'three-vendor';
                    }
                }
            }
        }
    }
});
