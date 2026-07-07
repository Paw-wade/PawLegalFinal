require('dotenv').config();
const { Client } = require('ssh2');

const conn = new Client();
conn
  .on('ready', () => {
    const cmds = [
      'docker exec minio-ps0cscok88s04c8wggks000k mc alias list 2>&1 || true',
      'docker exec minio-ps0cscok88s04c8wggks000k ls /data 2>&1 | head -10',
      'find / -name "1779043199045-totalenergies*" 2>/dev/null | head -5',
      'find /root -name "*.pdf" 2>/dev/null | head -10',
    ];
    let i = 0;
    const run = () => {
      if (i >= cmds.length) {
        conn.end();
        return;
      }
      const cmd = cmds[i++];
      conn.exec(cmd, (err, stream) => {
        if (err) {
          console.log('ERR', cmd, err.message);
          run();
          return;
        }
        let out = '';
        stream.on('data', (d) => {
          out += d;
        });
        stream.stderr.on('data', (d) => {
          out += d;
        });
        stream.on('close', () => {
          console.log('---', cmd, '---');
          console.log(out.trim() || '(empty)');
          console.log('');
          run();
        });
      });
    };
    run();
  })
  .on('error', (e) => {
    console.error('SSH error:', e.message);
    process.exit(1);
  })
  .connect({
    host: process.env.VPS_SSH_HOST,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    readyTimeout: 30000,
  });
