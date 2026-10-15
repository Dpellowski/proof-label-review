import Papa from "papaparse";

export type BatchCsvResult = {
  rows: Array<Record<string, string>>;
  errors: string[];
};

/** Parse RFC-style quoted CSV without coercing identifiers or alcohol values. */
export function parseBatchCsv(text: string): BatchCsvResult {
  if (!text.trim()) return { rows: [], errors: ["The CSV file is empty."] };
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });
  const errors = parsed.errors.map(
    (error) =>
      `${error.row === undefined ? "CSV" : `Row ${error.row + 1}`}: ${error.message}`,
  );
  const [rawHeaders, ...data] = parsed.data;
  if (!rawHeaders?.length || rawHeaders.every((header) => !header.trim())) {
    return { rows: [], errors: [...errors, "The CSV must have a header row."] };
  }
  const headers = rawHeaders.map((header) => header.trim());
  if (headers.some((header) => !header))
    errors.push("Every CSV column must have a nonempty header.");
  const normalized = headers.map((header) =>
    header.toLowerCase().replace(/[\s_-]/g, ""),
  );
  if (new Set(normalized).size !== normalized.length)
    errors.push("CSV column headers must be unique.");
  // Prototype keys are never useful application fields and need not become object keys.
  if (
    headers.some((header) =>
      ["__proto__", "constructor", "prototype"].includes(header.toLowerCase()),
    )
  ) {
    errors.push("The CSV contains a reserved column header.");
  }
  const rows = data.map((cells, index) => {
    if (cells.length !== headers.length) {
      errors.push(
        `Row ${index + 2} has ${cells.length} values; expected ${headers.length}.`,
      );
    }
    return Object.fromEntries(
      headers.map((header, column) => [header, (cells[column] ?? "").trim()]),
    );
  });
  if (!data.length) errors.push("The CSV has headers but no application rows.");
  return { rows: errors.length ? [] : rows, errors: [...new Set(errors)] };
}

/** Build exports that stay inert when opened in spreadsheet applications. */
export function downloadCsv(
  filename: string,
  rows: Array<Record<string, unknown>>,
): void {
  const safeCell = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    return /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  };
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = Papa.unparse(
    {
      fields: headers.map(safeCell),
      data: rows.map((row) => headers.map((header) => safeCell(row[header]))),
    },
    { newline: "\r\n", quotes: true },
  );
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|]/g, "_");
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Keep the object URL alive until the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
