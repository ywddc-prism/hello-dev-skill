const fs = require('fs');
const content = fs.readFileSync('test-memory.js', 'utf8');

const oldCode = ` // Synchronous wait: spawnSync starts a sh to wait for all child processes
 cp.spawnSync('sh', ['-c', 'wait'], { cwd: r });
 const deadline = Date.now() + 5000;
 while (spawns.some(p => p.exitCode === null) && Date.now() < deadline) {
 cp.spawnSync('sh', ['-c', 'sleep 0.05'], { cwd: r });
 }`;

const newCode = ` // Synchronously wait for all child processes (using spawnSync to wait for each process, with timeout protection)
 for (const p of spawns) {
 try {
 // Wait for process exit, max 5 seconds
 const start = Date.now();
 while (p.exitCode === null && Date.now() - start < 5000) {
 // Use Atomics.wait instead of sleep (Node.js 22+)
 // Fallback: busy wait 10ms
 const waitUntil = Date.now() + 10;
 while (Date.now() < waitUntil && p.exitCode === null) {
 // busy wait
 }
 }
 if (p.exitCode === null) {
 try { p.kill(); } catch (e) {}
 }
 } catch (e) {
 // Ignore cleanup errors
 }
 }`;

const fixed = content.replace(oldCode, newCode);
fs.writeFileSync('test-memory.js', fixed);
console.log(' Fixed');
