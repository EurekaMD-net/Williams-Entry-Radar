import { describe, it, expect } from "vitest";
import { csvEscape, csvRow } from "./csv.js";

describe("csvEscape", () => {
  it("leaves bare alphanumerics untouched", () => {
    expect(csvEscape("SO")).toBe("SO");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape("3.14")).toBe("3.14");
  });

  it("quotes fields containing a comma", () => {
    expect(csvEscape("Berkshire, Inc.")).toBe('"Berkshire, Inc."');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(csvEscape('He said "hi"')).toBe('"He said ""hi"""');
  });

  it("quotes fields containing newlines or CRs", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("converts null/undefined to empty string", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("csvRow", () => {
  it("joins fields with commas, escaping each", () => {
    expect(csvRow(["SO", 42, "Hello, world"])).toBe('SO,42,"Hello, world"');
  });

  it("produces an empty string for an empty array", () => {
    expect(csvRow([])).toBe("");
  });
});
