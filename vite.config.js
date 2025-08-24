import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        outDir: 'build',
        rollupOptions: {
            input: {
                background: resolve(__dirname, 'src/background.ts')
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: '[name].js',
                assetFileNames: '[name].[ext]'
            }
        },
        minify: false,
        sourcemap: false
    },
    esbuild: {
        target: 'es2020',
        supported: {
            'top-level-await': false
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    }
});
