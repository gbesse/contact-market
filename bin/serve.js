import { createDemoServer } from '../src/server.js';
import { project } from '../src/project.js';
const demo = await createDemoServer({ port: Number(process.env.PORT) || project.port });
console.log(`${project.name}: ${demo.origin}`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await demo.close();
    process.exit(0);
  });
