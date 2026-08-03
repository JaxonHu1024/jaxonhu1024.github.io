import { parseRfc4180 } from "./rfc4180.mjs";

export function indexRequiredFields(header, requiredFields, sourceName) {
  const indexes = new Map();

  for (const fieldName of requiredFields) {
    const matchingIndexes = [];
    for (let index = 0; index < header.length; index += 1) {
      if (header[index] === fieldName) matchingIndexes.push(index);
    }
    if (matchingIndexes.length !== 1) {
      throw new Error(`${sourceName} must contain exactly one ${fieldName} column`);
    }
    indexes.set(fieldName, matchingIndexes[0]);
  }

  return indexes;
}

export function selectCsvRows(csvText, requiredFields, sourceName) {
  const records = parseRfc4180(csvText);
  if (records.length === 0) throw new Error(`${sourceName} is empty`);

  const header = records[0];
  const indexes = indexRequiredFields(header, requiredFields, sourceName);

  return records.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== header.length) {
      throw new Error(
        `${sourceName} row ${rowNumber} has ${row.length} fields; expected ${header.length}`,
      );
    }

    return {
      rowNumber,
      values: Object.fromEntries(
        requiredFields.map((fieldName) => [fieldName, row[indexes.get(fieldName)]]),
      ),
    };
  });
}
