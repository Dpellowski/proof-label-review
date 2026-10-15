import { describe, expect, it } from "vitest";
import {
  normalizeText,
  STANDARD_WARNING,
  verifyLabel,
  type ApplicationFields,
} from "./verification";

const application: ApplicationFields = {
  brand: "Stone's Throw",
  beverage: "spirits",
  classType: "Kentucky Straight Bourbon Whiskey",
  abv: "45%",
  netContents: "750 mL",
  producer: "Stone House Distilling Co., Louisville, KY",
  country: "",
  imported: false,
};

const label = `STONE’S THROW\nKentucky Straight Bourbon Whiskey\n45% Alc./Vol. (90 Proof)\n750 mL\nStone House Distilling Co., Louisville, KY\n${STANDARD_WARNING}`;
const check = (text: string, key: string, fields = application) =>
  verifyLabel(text, fields, 96, true).checks.find(
    (field) => field.key === key,
  )!;

describe("application matching", () => {
  it("normalizes case, curly apostrophes, and layout without changing punctuation", () => {
    expect(normalizeText("  STONE’S\n  THROW  ")).toBe("stone's throw");
    expect(verifyLabel(label, application, 96, true).status).toBe("matched");
    expect(check(label, "brand").observed).toBe("STONE’S THROW");
  });

  it("does not match substrings within a different brand", () => {
    expect(
      check(label.replace("STONE’S THROW", "STONE’S THROWBACK"), "brand")
        .status,
    ).toBe("mismatch");
  });

  it("does not match producer or country names inside larger words", () => {
    expect(
      check(
        label.replace(
          "Stone House Distilling Co., Louisville, KY",
          "Stone House Distilling Co., Louisville, KYLAND",
        ),
        "producer",
      ).status,
    ).toBe("mismatch");
    expect(
      check(`${label}\nProduct of Scotlandia`, "country", {
        ...application,
        imported: true,
        country: "Scotland",
      }).status,
    ).toBe("mismatch");
  });

  it("never passes missing application values or missing label fields", () => {
    expect(
      check(label, "producer", { ...application, producer: "" }).status,
    ).toBe("review");
    expect(
      check(
        label.replace("Stone House Distilling Co., Louisville, KY", ""),
        "producer",
      ).status,
    ).toBe("mismatch");
    expect(check(label, "abv", { ...application, abv: "" }).status).toBe(
      "review",
    );
  });

  it("requires country of origin on imports", () => {
    const imported = { ...application, imported: true, country: "Scotland" };
    expect(check(label, "country", imported).status).toBe("mismatch");
    expect(
      check(`${label}\nProduct of Scotland`, "country", imported).status,
    ).toBe("match");
    expect(check(label, "country", { ...imported, country: "" }).status).toBe(
      "review",
    );
    expect(
      verifyLabel(label, application, 96).checks.some(
        (field) => field.key === "country",
      ),
    ).toBe(false);
  });

  it("does not treat an importer address or marketing mention as confirmed origin", () => {
    const imported = { ...application, imported: true, country: "Scotland" };
    expect(
      check(
        `${label}\nImported by Scotland Spirits, London`,
        "country",
        imported,
      ).status,
    ).toBe("review");
    expect(
      check(`${label}\nInspired by Scotland`, "country", imported).status,
    ).toBe("review");
    expect(
      check(`${label}\nCountry of origin: Scotland`, "country", imported)
        .status,
    ).toBe("match");
  });
});

describe("numeric declarations", () => {
  it("matches decimal ABV and checks proof against it", () => {
    expect(
      check(
        label.replace("45% Alc./Vol. (90 Proof)", "45.0% alc/vol (90 proof)"),
        "abv",
      ).status,
    ).toBe("match");
    expect(check(label.replace("90 Proof", "80 Proof"), "abv").status).toBe(
      "mismatch",
    );
    expect(
      check(
        label.replace("45% Alc./Vol. (90 Proof)", "40% Alc./Vol. (80 Proof)"),
        "abv",
      ).status,
    ).toBe("mismatch");
  });

  it("recognizes textual alcohol-by-volume declarations and does not infer ABV from proof alone", () => {
    expect(
      check(
        label.replace("45% Alc./Vol. (90 Proof)", "45 alcohol by volume"),
        "abv",
      ).status,
    ).toBe("match");
    expect(
      check(label.replace("45% Alc./Vol. (90 Proof)", "90 Proof"), "abv")
        .status,
    ).toBe("mismatch");
    expect(
      check(label.replace("45% Alc./Vol. (90 Proof)", "2024\nABV 45"), "abv")
        .status,
    ).toBe("match");
    expect(
      check(
        label.replace("45% Alc./Vol. (90 Proof)", "45% Alc./Vol. 750 mL"),
        "abv",
      ).status,
    ).toBe("match");
  });

  it("rejects a conflicting second ABV even if one value matches", () => {
    expect(check(`${label}\n40% ABV`, "abv").status).toBe("mismatch");
  });

  it("ignores ingredient percentages while requiring a real alcohol declaration", () => {
    expect(
      check(`${label}\n100% BLUE AGAVE\n20% ORGANIC INGREDIENTS`, "abv").status,
    ).toBe("match");
    expect(
      check(label.replace("45% Alc./Vol. (90 Proof)", "45% BLUE AGAVE"), "abv")
        .status,
    ).toBe("mismatch");
    expect(
      check(label.replace("45% Alc./Vol. (90 Proof)", "-45% Alc./Vol."), "abv")
        .status,
    ).toBe("mismatch");
  });

  it("converts liters and rounded US fluid ounces", () => {
    expect(check(label.replace("750 mL", "0.75 L"), "netContents").status).toBe(
      "match",
    );
    expect(
      check(label.replace("750 mL", "25.4 fl oz"), "netContents").status,
    ).toBe("match");
    expect(
      check(label.replace("750 mL", "750 mL / 25.4 fl. oz."), "netContents")
        .status,
    ).toBe("match");
    expect(check(label.replace("750 mL", "700 mL"), "netContents").status).toBe(
      "mismatch",
    );
    expect(check(`${label}\n1 L`, "netContents").status).toBe("mismatch");
    expect(
      check(label.replace("750 mL", "-750 mL"), "netContents").status,
    ).toBe("mismatch");
  });

  it("does not pass missing or unparseable volumes", () => {
    expect(check(label.replace("750 mL", ""), "netContents").status).toBe(
      "mismatch",
    );
    expect(
      check(label, "netContents", { ...application, netContents: "750" })
        .status,
    ).toBe("review");
  });
});

describe("government warning and review safeguards", () => {
  it("accepts wrapped warning lines while preserving exact wording", () => {
    const wrapped = label.replace(
      STANDARD_WARNING,
      STANDARD_WARNING.replaceAll(" ", "\n"),
    );
    expect(verifyLabel(wrapped, application, 96, true).warningExact).toBe(true);
  });

  it("flags punctuation changes, missing words, and incorrect header capitalization", () => {
    for (const altered of [
      label.replace("machinery,", "machinery"),
      label.replace("during pregnancy", "when pregnant"),
      label.replace("GOVERNMENT WARNING:", "Government Warning:"),
      label.replace("GOVERNMENT WARNING:", "GOVERNMENT WARNING :"),
      label.replace("problems.", "problems"),
    ]) {
      expect(verifyLabel(altered, application, 96, true).status).toBe(
        "flagged",
      );
      expect(verifyLabel(altered, application, 96, true).warningExact).toBe(
        false,
      );
    }
    expect(
      verifyLabel(
        label.replace("GOVERNMENT WARNING:", "Government Warning:"),
        application,
        96,
        true,
      ).warningHeaderCorrect,
    ).toBe(false);
  });

  it("flags a missing warning even when confidence is low", () => {
    const result = verifyLabel(
      label.replace(STANDARD_WARNING, ""),
      application,
      45,
      true,
    );
    expect(result.status).toBe("flagged");
    expect(result.warningText).toBe("");
  });

  it("does not silently truncate words added to the warning or a duplicate warning", () => {
    expect(
      verifyLabel(`${label} Extra warning words.`, application, 96, true)
        .warningExact,
    ).toBe(false);
    expect(
      verifyLabel(
        `${label}\nGovernment Warning: alcohol is safe.`,
        application,
        96,
        true,
      ).warningExact,
    ).toBe(false);
    expect(
      verifyLabel(`${label}\nLOT 20261015`, application, 96, true).warningExact,
    ).toBe(true);
    expect(
      verifyLabel(
        label.replace("GOVERNMENT WARNING:", "NONGOVERNMENT WARNING:"),
        application,
        96,
        true,
      ).warningExact,
    ).toBe(false);
  });

  it("requires manual typography confirmation instead of inferring bold from OCR", () => {
    const result = verifyLabel(label, application, 96);
    expect(result.status).toBe("review");
    expect(
      result.checks.find((field) => field.key === "warningTypography")?.status,
    ).toBe("review");
  });

  it("routes low or invalid OCR confidence to review even after typography confirmation", () => {
    for (const confidence of [79, Number.NaN, 101]) {
      const result = verifyLabel(label, application, confidence, true);
      expect(result.status).toBe("review");
      expect(result.checks.find((field) => field.key === "brand")?.status).toBe(
        "review",
      );
    }
    expect(verifyLabel(label, application, 80, true).status).toBe("matched");
  });
});
