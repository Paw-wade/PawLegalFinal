const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function killPort(port) {
  try {
    // Windows
    if (process.platform === 'win32') {
      // Trouver le processus utilisant le port
      const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
      
      if (!stdout) {
        console.log(`✅ Aucun processus n'utilise le port ${port}`);
        return true;
      }

      // Extraire les PIDs
      const lines = stdout.trim().split('\n');
      const pids = new Set();
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0) {
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            pids.add(pid);
          }
        }
      });

      if (pids.size === 0) {
        console.log(`✅ Aucun processus trouvé sur le port ${port}`);
        return true;
      }

      // Tuer les processus
      for (const pid of pids) {
        try {
          await execPromise(`taskkill /F /PID ${pid}`);
          console.log(`✅ Processus ${pid} terminé`);
        } catch (error) {
          console.warn(`⚠️ Impossible de terminer le processus ${pid}:`, error.message);
        }
      }

      return true;
    } else {
      // Linux/Mac
      const { stdout } = await execPromise(`lsof -ti:${port}`);
      
      if (!stdout) {
        console.log(`✅ Aucun processus n'utilise le port ${port}`);
        return true;
      }

      const pids = stdout.trim().split('\n');
      
      for (const pid of pids) {
        try {
          await execPromise(`kill -9 ${pid}`);
          console.log(`✅ Processus ${pid} terminé`);
        } catch (error) {
          console.warn(`⚠️ Impossible de terminer le processus ${pid}:`, error.message);
        }
      }

      return true;
    }
  } catch (error) {
    if (error.code === 1 || error.message.includes('findstr') || error.message.includes('lsof')) {
      // Aucun processus trouvé
      console.log(`✅ Aucun processus n'utilise le port ${port}`);
      return true;
    }
    console.error(`❌ Erreur lors de la libération du port ${port}:`, error.message);
    return false;
  }
}

// Si le script est exécuté directement
if (require.main === module) {
  const port = process.argv[2] || 3005;
  killPort(port).then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { killPort };


