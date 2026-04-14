// services/cronService.js – Automated backup cron (12:00 AM and 12:00 PM daily)
const cron = require('node-cron');
const path = require('path');
const fs   = require('fs');
const pool = require('../config/db');

// Pure Node.js SQL dump (no mysqldump binary needed)
async function generateSQLDump(filePath) {
  const conn = await pool.getConnection();
  const lines = [];
  lines.push('-- WISDOM Database Backup');
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS=0;');
  lines.push('SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";');
  lines.push('');
  try {
    const [tables] = await conn.query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    for (const table of tableNames) {
      const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      lines.push(`DROP TABLE IF EXISTS \`${table}\`;`);
      lines.push(createRow['Create Table'] + ';');
      lines.push('');
      const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(', ');
        const values = rows.map(row =>
          '(' + Object.values(row).map(v => {
            if (v === null) return 'NULL';
            if (typeof v === 'number') return v;
            if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
            return `'${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`;
          }).join(', ') + ')'
        ).join(',\n');
        lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES`);
        lines.push(values + ';');
        lines.push('');
      }
    }
    lines.push('SET FOREIGN_KEY_CHECKS=1;');
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  } finally {
    conn.release();
  }
}

async function runBackup(type = 'auto') {
  const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
  const absDir    = path.isAbsolute(backupDir) ? backupDir : path.join(__dirname, '..', backupDir);
  if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName  = `wisdom_backup_${type}_${timestamp}.sql`;
  const filePath  = path.join(absDir, fileName);

  let backupError = null;
  let sizeKb = 0;

  try {
    await generateSQLDump(filePath);
    sizeKb = fs.existsSync(filePath) ? Math.round(fs.statSync(filePath).size / 1024) : 0;
    console.log(`[BACKUP] ${type} SUCCESS: ${fileName} (${sizeKb} KB)`);
  } catch (e) {
    backupError = e.message;
    console.error(`[BACKUP] ${type} FAILED:`, e.message);
  }

  try {
    await pool.query(
      `INSERT INTO backup_logs (type, file_name, file_size_kb, storage_path, status, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [type, fileName, sizeKb, filePath, backupError ? 'failed' : 'success', backupError || null]
    );
  } catch (logErr) {
    console.error('Backup log insert error:', logErr.message);
  }
}

function startCronJobs() {
  cron.schedule('0 0 * * *', () => {
    console.log('[CRON] Running midnight auto-backup...');
    runBackup('auto');
  });
  cron.schedule('0 12 * * *', () => {
    console.log('[CRON] Running noon auto-backup...');
    runBackup('auto');
  });
  console.log('✅  Cron jobs started: auto-backup at 12:00 AM and 12:00 PM daily.');
}

module.exports = { startCronJobs, runBackup };
