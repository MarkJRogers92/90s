import { defineConfig } from 'vitest/config';
export default defineConfig({test:{environment:'node',include:['diagnostics/weapon-visuals/replay.test.ts'],testTimeout:120000,maxWorkers:1}});
