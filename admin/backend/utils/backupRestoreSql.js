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

    if (char === ";" && !singleQuoted && !doubleQuoted && !backtickQuoted) {
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
  return String(match[2] || "").replace(/""/g, '"');
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
    const error = new Error(
      "The selected file is not a WISDOM database backup.",
    );
    error.statusCode = 400;
    throw error;
  }

  if (!raw.trimEnd().endsWith(";")) {
    const error = new Error(
      "The selected backup appears incomplete because its final SQL statement is not terminated.",
    );
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
    const error = new Error(
      "The selected backup contains no table definitions.",
    );
    error.statusCode = 400;
    throw error;
  }

  const createdTableNames = [];

  for (const statement of statements) {
    const clean = stripLeadingComments(statement);
    if (!/^CREATE\s+TABLE\b/i.test(clean)) continue;

    const tableName = extractCreateTableName(clean);

    if (!tableName) {
      const error = new Error(
        "The selected backup contains an invalid table definition.",
      );
      error.statusCode = 400;
      throw error;
    }

    if (createdTableNames.includes(tableName)) {
      const error = new Error(
        `The selected backup contains duplicate table definitions for ${tableName}.`,
      );
      error.statusCode = 400;
      throw error;
    }

    createdTableNames.push(tableName);
  }

  if (createdTableNames.length !== createTableDdls.size) {
    const error = new Error(
      "The selected backup has inconsistent table-definition metadata.",
    );
    error.statusCode = 400;
    throw error;
  }

  for (const statement of statements) {
    const clean = stripLeadingComments(statement);
    if (!/^INSERT\s+INTO\b/i.test(clean)) continue;

    let parsed;

    try {
      parsed = parseWisdomInsertStatement(clean);
    } catch (error) {
      if (!Number.isInteger(Number(error?.statusCode))) {
        error.statusCode = 400;
      }
      throw error;
    }

    if (!createTableDdls.has(parsed.tableName)) {
      const error = new Error(
        `The backup contains data for ${parsed.tableName}, but no table definition for that table.`,
      );
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    statements,
    createTableDdls,
  };
}

function parseQuotedIdentifierList(value) {
  const input = String(value || "");
  const identifiers = [];
  let index = 0;

  while (index < input.length) {
    while (/\s/.test(input[index] || "") && index < input.length) {
      index += 1;
    }

    if (index >= input.length) break;

    if (input[index] !== "`") {
      throw new Error("Invalid quoted identifier in backup SQL.");
    }

    index += 1;
    let identifier = "";
    let closed = false;

    while (index < input.length) {
      const char = input[index];

      if (char === "`") {
        if (input[index + 1] === "`") {
          identifier += "`";
          index += 2;
          continue;
        }

        index += 1;
        closed = true;
        break;
      }

      identifier += char;
      index += 1;
    }

    if (!closed || !identifier) {
      throw new Error("Invalid quoted identifier in backup SQL.");
    }

    identifiers.push(identifier);

    while (/\s/.test(input[index] || "") && index < input.length) {
      index += 1;
    }

    if (index >= input.length) break;

    if (input[index] !== ",") {
      throw new Error("Invalid identifier list in backup SQL.");
    }

    index += 1;
  }

  if (identifiers.length === 0) {
    throw new Error("The backup INSERT statement has no columns.");
  }

  return identifiers;
}

function splitSqlTopLevelComma(value) {
  const input = String(value || "");
  const parts = [];

  let start = 0;
  let depth = 0;
  let quote = null;
  let backtickQuoted = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (backtickQuoted) {
      if (char === "`") {
        if (input[index + 1] === "`") {
          index += 1;
        } else {
          backtickQuoted = false;
        }
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "`") {
      backtickQuoted = true;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;

      if (depth < 0) {
        throw new Error("Invalid parentheses in backup INSERT values.");
      }

      continue;
    }

    if (char === "," && depth === 0) {
      parts.push(input.slice(start, index).trim());
      start = index + 1;
    }
  }

  if (quote || backtickQuoted || depth !== 0 || escaped) {
    throw new Error("Incomplete value expression in backup INSERT.");
  }

  parts.push(input.slice(start).trim());

  if (parts.some((part) => part.length === 0)) {
    throw new Error("Empty value detected in backup INSERT.");
  }

  return parts;
}

function readSqlTuple(input, startIndex) {
  if (input[startIndex] !== "(") {
    throw new Error("Invalid row structure in backup INSERT.");
  }

  let depth = 1;
  let quote = null;
  let backtickQuoted = false;
  let escaped = false;

  for (let index = startIndex + 1; index < input.length; index += 1) {
    const char = input[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (quote) {
      if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }

      continue;
    }

    if (backtickQuoted) {
      if (char === "`") {
        if (input[index + 1] === "`") {
          index += 1;
        } else {
          backtickQuoted = false;
        }
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === "`") {
      backtickQuoted = true;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return {
          value: input.slice(startIndex + 1, index),
          nextIndex: index + 1,
        };
      }
    }
  }

  throw new Error("Unclosed row in backup INSERT.");
}

function isSafeSqlLiteral(value) {
  const text = String(value ?? "").trim();

  if (/^NULL$/i.test(text)) return true;

  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    return true;
  }

  if (/^X'(?:[0-9a-f]{2})*'$/i.test(text)) return true;

  if (text.length < 2 || text[0] !== "'") return false;

  let index = 1;

  while (index < text.length) {
    const char = text[index];

    if (char === "\\") {
      if (index + 1 >= text.length) return false;
      index += 2;
      continue;
    }

    if (char === "'") {
      return index === text.length - 1;
    }

    index += 1;
  }

  return false;
}

function parseWisdomInsertStatement(statement) {
  const clean = stripLeadingComments(statement).replace(/;\s*$/, "").trim();

  const match =
    /^INSERT\s+INTO\s+`((?:``|[^`])+)`\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]+)$/i.exec(
      clean,
    );

  if (!match) {
    throw new Error("Unsupported WISDOM backup INSERT statement.");
  }

  const tableName = match[1].replace(/``/g, "`");
  const columns = parseQuotedIdentifierList(match[2]);

  if (new Set(columns).size !== columns.length) {
    throw new Error(
      `Duplicate column names in backup INSERT for table ${tableName}.`,
    );
  }
  const valuesText = match[3].trim();
  const rows = [];

  let index = 0;

  while (index < valuesText.length) {
    while (/\s/.test(valuesText[index] || "") && index < valuesText.length) {
      index += 1;
    }

    if (index >= valuesText.length) break;

    const tuple = readSqlTuple(valuesText, index);
    const values = splitSqlTopLevelComma(tuple.value);

    if (values.length !== columns.length) {
      throw new Error(
        `Column/value count mismatch in backup INSERT for table ${tableName}.`,
      );
    }

    const unsafeValueIndex = values.findIndex(
      (value) => !isSafeSqlLiteral(value),
    );

    if (unsafeValueIndex !== -1) {
      throw new Error(
        `Unsupported SQL expression in backup INSERT for table ${tableName}, column ${columns[unsafeValueIndex]}. Only serialized data literals are allowed.`,
      );
    }

    rows.push(values);
    index = tuple.nextIndex;

    while (/\s/.test(valuesText[index] || "") && index < valuesText.length) {
      index += 1;
    }

    if (index >= valuesText.length) break;

    if (valuesText[index] !== ",") {
      throw new Error(
        `Unexpected content after an INSERT row for table ${tableName}.`,
      );
    }

    index += 1;
  }

  if (rows.length === 0) {
    throw new Error(
      `The backup INSERT for table ${tableName} contains no rows.`,
    );
  }

  return {
    tableName,
    columns,
    rows,
  };
}

function projectWisdomInsertToColumns(statement, allowedColumns) {
  const parsed = parseWisdomInsertStatement(statement);
  const allowed = new Set(allowedColumns || []);

  const selectedIndexes = parsed.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => allowed.has(column));

  if (selectedIndexes.length === 0) {
    return null;
  }

  const quoteIdentifier = (identifier) =>
    `\`${String(identifier).replace(/`/g, "``")}\``;

  const columnSql = selectedIndexes
    .map(({ column }) => quoteIdentifier(column))
    .join(", ");

  const rowSql = parsed.rows
    .map(
      (row) => `(${selectedIndexes.map(({ index }) => row[index]).join(", ")})`,
    )
    .join(",\n");

  return (
    `INSERT INTO ${quoteIdentifier(parsed.tableName)} (${columnSql}) VALUES\n` +
    `${rowSql};`
  );
}

module.exports = {
  stripLeadingComments,
  splitSqlStatements,
  normalizeCreateTableDdl,
  collectCreateTableDdls,
  validateWisdomBackupSql,
  parseWisdomInsertStatement,
  projectWisdomInsertToColumns,
};
