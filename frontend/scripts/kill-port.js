const { exec } = require('child_process');
const os = require('os');

const port = process.argv[2] || 3000;
const platform = os.platform();

function killPort(port) {
  return new Promise((resolve, reject) => {
    if (platform === 'win32') {
      // Windows
      exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
        if (error) {
          console.log(`Aucun processus trouvé sur le port ${port}`);
          resolve();
          return;
        }

        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(pid)) {
            pids.add(pid);
          }
        });

        if (pids.size === 0) {
          console.log(`Aucun processus trouvé sur le port ${port}`);
          resolve();
          return;
        }

        console.log(`Processus trouvés sur le port ${port}: ${Array.from(pids).join(', ')}`);
        
        pids.forEach(pid => {
          exec(`taskkill /PID ${pid} /F`, (killError) => {
            if (killError) {
              console.error(`Erreur lors de la fermeture du processus ${pid}:`, killError.message);
            } else {
              console.log(`✅ Processus ${pid} terminé avec succès`);
            }
          });
        });

        setTimeout(() => resolve(), 1000);
      });
    } else {
      // Linux/Mac
      exec(`lsof -ti:${port}`, (error, stdout) => {
        if (error) {
          console.log(`Aucun processus trouvé sur le port ${port}`);
          resolve();
          return;
        }

        const pids = stdout.trim().split('\n').filter(pid => pid);
        
        if (pids.length === 0) {
          console.log(`Aucun processus trouvé sur le port ${port}`);
          resolve();
          return;
        }

        console.log(`Processus trouvés sur le port ${port}: ${pids.join(', ')}`);
        
        pids.forEach(pid => {
          exec(`kill -9 ${pid}`, (killError) => {
            if (killError) {
              console.error(`Erreur lors de la fermeture du processus ${pid}:`, killError.message);
            } else {
              console.log(`✅ Processus ${pid} terminé avec succès`);
            }
          });
        });

        setTimeout(() => resolve(), 1000);
      });
    }
  });
}

killPort(port)
  .then(() => {
    console.log(`\n✅ Port ${port} libéré. Vous pouvez maintenant démarrer le serveur.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erreur:', error);
    process.exit(1);
  });

