#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Get the port from environment variable or use default 3000
const PORT = 3001;

async function killPort(port) {
  console.log(`🔍 Checking for processes using port ${port}...`);

  try {
    // Different commands for different operating systems
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: Use netstat to find PIDs using the port
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split('\n');
      const pids = new Set();

      lines.forEach(line => {
        const match = line.match(/\s+(\d+)$/);
        if (match) {
          pids.add(match[1]);
        }
      });

      if (pids.size > 0) {
        console.log(`🔪 Found processes using port ${port}: ${Array.from(pids).join(', ')}`);
        for (const pid of pids) {
          await execAsync(`taskkill /F /PID ${pid}`);
        }
        console.log('✅ Processes killed successfully');
      } else {
        console.log(`✅ Port ${port} is free`);
      }
    } else {
      // macOS/Linux: Use lsof to find PIDs using the port
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split('\n').filter(pid => pid);

      if (pids.length > 0) {
        console.log(`🔪 Found processes using port ${port}: ${pids.join(', ')}`);
        await execAsync(`echo "${pids.join(' ')}" | xargs kill -9`);
        console.log('✅ Processes killed successfully');

        // Wait a moment for processes to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log(`✅ Port ${port} is free`);
      }
    }
  } catch (error) {
    // If lsof/netstat fails, assume port is free
    console.log(`✅ Port ${port} is free`);
  }
}

async function startServer() {
  await killPort(PORT);

  console.log(`🚀 Starting server on port ${PORT}...`);

  // Start the server using npm start
  const serverProcess = exec('npm start', {
    stdio: 'inherit',
    env: { ...process.env, PORT }
  });

  serverProcess.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}

startServer().catch(console.error);