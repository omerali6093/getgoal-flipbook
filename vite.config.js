import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Builds a single self-contained IIFE bundle (JS) + extracted CSS
// into /dist so the WordPress plugin can simply enqueue two static files.
// No hashed filenames -> predictable enqueue paths inside the PHP plugin file.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'oxc',
    lib: {
      entry: resolve(__dirname, 'src/main.js'),
      name: 'GETGOALFlipbook',
      formats: ['iife'],
      fileName: () => 'flipbook.js',
    },
    rollupOptions: {
      output: {
        // Force a predictable, non-hashed CSS filename
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'flipbook.css';
          }
          return 'assets/[name][extname]';
        },
      },
    },
  },
});
