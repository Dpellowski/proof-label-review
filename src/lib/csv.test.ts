import { describe, expect, it, vi } from "vitest";
import { downloadCsv, parseBatchCsv } from "./csv";

describe("batch CSV boundary", () => {
  it("preserves identifiers, quoted commas, and multiline application text", () => {
    const parsed = parseBatchCsv(
      '\uFEFFid,brand,warning\r\n00042,"Still, River","Line one\nLine two"\r\n',
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { id: "00042", brand: "Still, River", warning: "Line one\nLine two" },
    ]);
  });

  it("rejects ambiguous or structurally broken rows without returning partial data", () => {
    expect(parseBatchCsv("brand,Brand\nA,B").errors).toContain(
      "CSV column headers must be unique.",
    );
    const broken = parseBatchCsv("id,brand\n1,Brand,unexpected");
    expect(broken.rows).toEqual([]);
    expect(broken.errors[0]).toContain("Row 2 has 3 values; expected 2.");
    expect(
      parseBatchCsv('id,brand\n1,"unfinished').errors.length,
    ).toBeGreaterThan(0);
  });

  it("requires headers and at least one application row", () => {
    expect(parseBatchCsv("").rows).toEqual([]);
    expect(parseBatchCsv("id,brand").errors).toContain(
      "The CSV has headers but no application rows.",
    );
  });

  it("neutralizes spreadsheet formulas in exported headers and values", async () => {
    let exported: Blob | undefined;
    const createUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob) => {
        exported = blob as Blob;
        return "blob:test";
      });
    const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { append: vi.fn() },
    });
    vi.useFakeTimers();
    const revokeUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    try {
      downloadCsv("results.csv", [
        { "=SUM(A1)": "=1+1", note: "  @SUM(A1)", id: "00042" },
      ]);
      const text = await exported!.text();
      expect(text).toContain('"\'=SUM(A1)"');
      expect(text).toContain('"\'=1+1"');
      expect(text).toContain('"\'  @SUM(A1)"');
      expect(text).toContain('"00042"');
      expect(anchor.click).toHaveBeenCalledOnce();
      vi.runAllTimers();
      expect(revokeUrl).toHaveBeenCalledWith("blob:test");
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      createUrl.mockRestore();
      revokeUrl.mockRestore();
    }
  });
});
