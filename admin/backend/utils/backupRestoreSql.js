// utils/backupRestoreSql.js
// Pure helpers for validating and parsing WISDOM-generated database backups.

function stripLeadingComments(statement) {
  let value = String(statement || "");

  while (true) {
    const next = value.replace(/^\s*--[^\n]*(?:\n|$)/, "");
    if (next === value) break;
    value = next;
  }

  return value.trim();
}

function splitSqlStatements(sql) {
  const input = String(sql || "");
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let doubleQuoted = false;
  let backtickQuoted = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    current += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if ((singleQuoted || doubleQuoted) && char === "\\") {
      escaped = true;
      continue;
    }

    if (!doubleQuoted && !backtickQuoted && char === "'") {
      singleQuoted = !singleQuoted;
      continue;
    }

    if (!singleQuoted && !backtickQuoted && char === '"') {
      doubleQuoted = !doubleQuoted;
      continue;
    }

    if (!singleQuoted && !doubleQuoted && char === "`") {
      backtickQuoted = !backtickQuoted;
      continue;
    }

    if (
      char === ";" &&
      !singleQuoted &&
      !doubleQuoted &&
      !backtickQuoted
    ) {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  return statements;
}

function normalizeCreateTableDdl(value) {
  return stripLeadingComments(value)
    .replace(/\bAUTO_INCREMENT=\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCreateTableName(statement) {
  const clean = String(statement || "");
  const match = clean.match(
    /^CREATE\s+TABLE\s+(?:`([^`]+)`|"((?:""|[^"])*)")\s+/i,
  );

  if (!match) return null;
  if (match[1] !== undefined) return match[1];

  // ANSI_QUOTES permits SHOW CREATE TABLE to emit double-quoted identifiers.
  // Inside a double-quoted identifier, a literal quote is represented as "".
  return String(match[2] || "").replace(/""/g, "\"");
}

function collectCreateTableDdls(statements) {
  const tables = new Map();

  for (const statement of statements || []) {
    const clean = stripLeadingComments(statement);
    const tableName = extractCreateTableName(clean);
    if (!tableName) continue;

    tables.set(tableName, clean);
  }

  return tables;
}

function validateWisdomBackupSql(sql) {
  const raw = String(sql || "");

  if (!raw.startsWith("-- WISDOM Database Backup")) {
    const error = new Error("The selected file is not a WISDOM database backup.");
    error.statusCode = 400;
    throw error;
  }

  const statements = splitSqlStatements(raw);
  if (statements.length === 0) {
    const error = new Error("The selected backup contains no SQL statements.");
    error.statusCode = 400;
    throw error;
  }

  const allowedPrefixes = [
    /^SET\s+@WISDOM_OLD_/i,
    /^SET\s+FOREIGN_KEY_CHECKS\s*=/i,
    /^SET\s+SESSION\s+sql_mode\s*=/i,
    /^SET\s+SESSION\s+time_zone\s*=/i,
    /^DROP\s+TABLE\s+IF\s+EXISTS\s+`/i,
    /^CREATE\s+TABLE\s+(?:`[^`]+`|"(?:""|[^"])+")\s+/i,
    /^INSERT\s+INTO\s+`/i,
  ];

  for (const statement of statements) {
    const clean = stripLeadingComments(statement);
    if (!clean) continue;

    if (!allowedPrefixes.some((pattern) => pattern.test(clean))) {
      const error = new Error(
        "The selected backup contains an unsupported SQL statement and cannot be restored automatically.",
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const createTableDdls = collectCreateTableDdls(statements);
  if (createTableDdls.size === 0) {
    const error = new Error("The selected backup contains no table definitions.");
    error.statusCode = 400;
    throw error;
  }

  return {
    statements,
    createTableDdls,
  };
}

module.exports = {
  stripLeadingComments,
  splitSqlStatements,
  normalizeCreateTableDdl,
  collectCreateTableDdls,
  validateWisdomBackupSql,
};
