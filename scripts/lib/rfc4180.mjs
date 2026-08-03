/**
 * Parse an RFC 4180-style CSV document without coercing field values.
 *
 * The parser accepts the conventional LF-only variant in addition to CRLF,
 * preserves embedded line endings inside quoted fields, and rejects malformed
 * quoting instead of guessing at the intended record shape.
 */
export function parseRfc4180(input) {
  if (typeof input !== "string") {
    throw new TypeError("CSV input must be a string");
  }

  const csv = input.startsWith("\uFEFF") ? input.slice(1) : input;
  const records = [];
  let record = [];
  let field = "";
  let index = 0;
  let inQuotes = false;
  let afterClosingQuote = false;
  let recordStarted = false;

  const finishField = () => {
    record.push(field);
    field = "";
    afterClosingQuote = false;
  };

  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
    recordStarted = false;
  };

  while (index < csv.length) {
    const character = csv[index];

    if (inQuotes) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        afterClosingQuote = true;
        index += 1;
        continue;
      }

      field += character;
      index += 1;
      continue;
    }

    if (afterClosingQuote) {
      if (character === ",") {
        finishField();
        recordStarted = true;
        index += 1;
        continue;
      }

      if (character === "\r") {
        if (csv[index + 1] !== "\n") {
          throw new Error(`Malformed CSV: bare carriage return at byte ${index}`);
        }
        finishRecord();
        index += 2;
        continue;
      }

      if (character === "\n") {
        finishRecord();
        index += 1;
        continue;
      }

      throw new Error(`Malformed CSV: unexpected character after quote at byte ${index}`);
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(`Malformed CSV: quote in unquoted field at byte ${index}`);
      }
      inQuotes = true;
      recordStarted = true;
      index += 1;
      continue;
    }

    if (character === ",") {
      finishField();
      recordStarted = true;
      index += 1;
      continue;
    }

    if (character === "\r") {
      if (csv[index + 1] !== "\n") {
        throw new Error(`Malformed CSV: bare carriage return at byte ${index}`);
      }
      finishRecord();
      index += 2;
      continue;
    }

    if (character === "\n") {
      finishRecord();
      index += 1;
      continue;
    }

    field += character;
    recordStarted = true;
    index += 1;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field");
  }

  if (recordStarted || record.length > 0 || field.length > 0 || afterClosingQuote) {
    finishRecord();
  }

  return records;
}
