import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Component/unit test config.
 *
 * Kept separate from vite.config.js so the app build is unaffected. E2E specs
 * live in `e2e/` and are run by Playwright, so they are excluded here.
 */
export default defineConfig({
    plugins: [react()],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.{test,spec}.{js,jsx}'],
        exclude: ['node_modules', 'dist', 'e2e'],
        css: false,
        restoreMocks: true,
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.{js,jsx}'],
            exclude: ['**/*.test.*', '**/*.spec.*', 'src/test/**']
        }
    }
});
