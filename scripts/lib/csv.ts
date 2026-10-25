// Minimal RFC 4180 CSV read/write. Files are written as UTF-8 with a BOM
// so Excel shows the hanzi correctly; reading strips the BOM and accepts
// CRLF or LF line endings.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type Cell = string | number | null | undefined;

function quote(value: Cell) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function writeCsv(path: string, header: string[], rows: Cell[][]) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [header, ...rows].map((row) => row.map(quote).join(","));
  writeFileSync(path, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
}

/** Parse a CSV file into objects keyed by the header row. */
export function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell !== ""));
  if (!header) return [];
  return body.map((r) =>
    Object.fromEntries(header.map((name, i) => [name.trim(), r[i] ?? ""])),
  );
}
