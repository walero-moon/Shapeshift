import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./src/test/setup-env.ts'],
        include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}', 'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        exclude: ['node_modules', 'dist'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            include: ['src/**/*.ts'],
            exclude: [
                'node_modules/',
                'dist/',
                // Test files verify production code; including them inflates coverage and hides product gaps.
                'src/**/tests/**',
                'tests/**',
                'src/test/**',
                // Runtime boot and command deployment scripts require live Discord tokens/network, so unit tests cover mounted handlers instead.
                'src/index.ts',
                'src/adapters/discord/client.ts',
                'src/adapters/discord/register-commands.ts',
                'src/adapters/discord/clear-commands.ts',
                // Declarative config/schema/type contracts have no executable branch behavior worth unit-testing.
                'src/shared/db/schema.ts',
                'src/shared/ports/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
});
