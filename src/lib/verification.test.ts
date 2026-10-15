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

  it.each(["brand", "classType", "abv", "netContents", "producer"] as const)(
    "requires review when the application %s is blank",
    (key) => {
      expect(check(label, key, { ...application, [key]: "  " }).status).toBe(
        "review",
      );
    },
  );

  it.each([
    ["brand", "STONE’S THROW"],
    ["classType", application.classType],
    ["abv", "45% Alc./Vol. (90 Proof)"],
    ["netContents", application.netContents],
    ["producer", application.producer],
  ])("flags an absent label %s", (key, declaration) => {
    expect(check(label.replace(declaration, ""), key).status).toBe("mismatch");
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
  it("recognizes the assignment's Old Tom distilled-spirits example", () => {
    const oldTom = { ...application, brand: "OLD TOM DISTILLERY" };
    expect(
      verifyLabel(
        label.replace("STONE’S THROW", oldTom.brand),
        oldTom,
        96,
        true,
      ).status,
    ).toBe("matched");
  });

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

  it.each([
    "45% alcohol by weight",
    "Alcohol 45% by weight",
    "Alcohol by weight: 45%",
    "45% ABW",
    "ABW 45%",
    "45% alcohol by\nweight",
    "45%\nalcohol by weight",
    "Alcohol by weight\n45%",
    "Alcohol by\nweight: 45%",
  ])("does not treat %s as alcohol by volume", (declaration) => {
    const result = check(
      label.replace("45% Alc./Vol. (90 Proof)", declaration),
      "abv",
    );
    expect(result.status).toBe("mismatch");
    expect(result.detail).toContain("weight");
  });

  it("compares ABV independently when alcohol-by-weight information also appears", () => {
    expect(check(`${label}\n36% alcohol by weight`, "abv").status).toBe(
      "match",
    );
    expect(
      check(
        label.replace(
          "45% Alc./Vol. (90 Proof)",
          "40% Alc./Vol.\n45% alcohol by weight",
        ),
        "abv",
      ).status,
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

  it.each(["751 mL", "749 mL", "0.751 L"])(
    "does not hide a changed metric volume (%s) behind conversion rounding",
    (volume) => {
      expect(check(label.replace("750 mL", volume), "netContents").status).toBe(
        "mismatch",
      );
    },
  );

  it("requires exact quantities within US units and for small metric values", () => {
    expect(
      check(label.replace("750 mL", "12.01 fl oz"), "netContents", {
        ...application,
        netContents: "12 fl oz",
      }).status,
    ).toBe("mismatch");
    expect(
      check(label.replace("750 mL", "0.1 mL"), "netContents", {
        ...application,
        netContents: "0.2 mL",
      }).status,
    ).toBe("mismatch");
    expect(
      check(label.replace("750 mL", "0.750 L"), "netContents").status,
    ).toBe("match");
  });
});

describe("beer and wine alcohol-content review", () => {
  const tableWine: ApplicationFields = {
    ...application,
    beverage: "wine",
    classType: "Table Wine",
    abv: "12%",
  };
  const wineLabel = label
    .replace(application.classType, tableWine.classType)
    .replace("45% Alc./Vol. (90 Proof)", "12% Alc./Vol.");
  const beer: ApplicationFields = {
    ...application,
    beverage: "beer",
    classType: "Lager",
    abv: "5%",
  };
  const beerLabel = label
    .replace(application.classType, beer.classType)
    .replace("45% Alc./Vol. (90 Proof)", "5% Alc./Vol.");

  it("does not infer an exception when an application ABV is absent", () => {
    for (const fields of [beer, tableWine]) {
      const result = check(label, "abv", { ...fields, abv: "" });
      expect(result.status).toBe("review");
      expect(result.detail).toContain("exception");
    }
  });

  it("compares stated beer and wine ABV and preserves numerical mismatches", () => {
    expect(check(beerLabel, "abv", beer).status).toBe("match");
    expect(check(wineLabel, "abv", tableWine).status).toBe("match");
    expect(
      check(beerLabel.replace("5% Alc./Vol.", "6% Alc./Vol."), "abv", beer)
        .status,
    ).toBe("mismatch");
    expect(
      check(
        wineLabel.replace("12% Alc./Vol.", "13% Alc./Vol."),
        "abv",
        tableWine,
      ).status,
    ).toBe("mismatch");
  });

  it("routes an omitted beer ABV to review of added alcohol and state requirements", () => {
    const result = check(beerLabel.replace("5% Alc./Vol.", ""), "abv", beer);
    expect(result.status).toBe("review");
    expect(result.detail).toContain("state requirements");
    expect(result.detail).toContain("added flavors");
  });

  it.each(["Table Wine", "Light Wine", "Cherry Table Wine"])(
    "routes eligible %s without a numeric declaration to manual review",
    (designation) => {
      const result = check(
        wineLabel
          .replace("Table Wine", designation)
          .replace("12% Alc./Vol.", ""),
        "abv",
        { ...tableWine, classType: designation },
      );
      expect(result.status).toBe("review");
      expect(result.detail).toContain("brand label");
    },
  );

  it.each(["6.9%", "14.1%"])(
    "does not apply the table-wine omission exception at %s",
    (abv) => {
      expect(
        check(wineLabel.replace("12% Alc./Vol.", ""), "abv", {
          ...tableWine,
          abv,
        }).status,
      ).toBe("mismatch");
    },
  );

  it("requires the qualifying wine type in both application and artwork", () => {
    expect(
      check(
        wineLabel
          .replace("Table Wine", "Red Wine")
          .replace("12% Alc./Vol.", ""),
        "abv",
        { ...tableWine, classType: "Red Wine" },
      ).status,
    ).toBe("mismatch");
    expect(
      check(
        wineLabel
          .replace("Table Wine", "Red Wine")
          .replace("12% Alc./Vol.", ""),
        "abv",
        tableWine,
      ).status,
    ).toBe("mismatch");
  });

  it.each([
    "11%-13% Alc. By Vol.",
    "11% to 13% alcohol by volume",
    "ALC. 11% TO 13% BY VOL.",
  ])("routes the wine alcohol range %s to manual review", (range) => {
    expect(
      check(wineLabel.replace("12% Alc./Vol.", range), "abv", tableWine).status,
    ).toBe("review");
  });

  it("does not let a wine range hide contradictions or an out-of-range application", () => {
    const rangeLabel = wineLabel.replace(
      "12% Alc./Vol.",
      "11%-13% Alc. By Vol.",
    );
    expect(check(rangeLabel, "abv", { ...tableWine, abv: "14%" }).status).toBe(
      "mismatch",
    );
    expect(check(`${rangeLabel}\n10% Alc./Vol.`, "abv", tableWine).status).toBe(
      "mismatch",
    );
    expect(check(`${rangeLabel}\n20 proof`, "abv", tableWine).status).toBe(
      "mismatch",
    );
    expect(
      check(
        beerLabel.replace("5% Alc./Vol.", "4%-6% Alc. By Vol."),
        "abv",
        beer,
      ).status,
    ).toBe("mismatch");
  });

  it("does not use a beer/wine omission exception to accept proof-only or weight-only declarations", () => {
    expect(
      check(
        beerLabel.replace("5% Alc./Vol.", "5% alcohol by weight"),
        "abv",
        beer,
      ).status,
    ).toBe("mismatch");
    expect(
      check(wineLabel.replace("12% Alc./Vol.", "24 proof"), "abv", tableWine)
        .status,
    ).toBe("mismatch");
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
