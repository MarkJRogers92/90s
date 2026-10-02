// A stable local review session: R resets gameplay; source changes do not reload the room.
import { createServer } from 'vite';

process.env.VITE_ENABLE_DEBUG_BRIDGE = 'true';
const server = await createServer({
  server: { host: '127.0.0.1', port: 4194, strictPort: true, watch: null },
});
await server.listen();
console.log('DEAD MALL prop test: http://127.0.0.1:4194/?fixture=mvp-prop-test&seed=1');
console.log('Choose Night Shift. WASD move, click swing, R reset. East door out and back resets props.');
