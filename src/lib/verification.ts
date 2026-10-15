export type Beverage = "spirits" | "wine" | "beer";

export interface ApplicationFields {
  brand: string;
  beverage: Beverage;
  classType: string;
  abv: string;
  netContents: string;
  producer: string;
  country: string;
  imported: boolean;
}

export type FieldStatus = "match" | "mismatch" | "review";

export interface FieldCheck {
  key: string;
  label: string;
  expected: string;
  observed: string;
  status: FieldStatus;
  detail: string;
}

export interface VerificationResult {
  checks: FieldCheck[];
  status: "matched" | "flagged" | "review";
  warningText: string;
  warningExact: boolean;
  warningHeaderCorrect: boolean;
}

// TTB / 27 CFR 16.21. Only layout whitespace is ignored in this statement.
// https://www.ttb.gov/regulated-commodities/beverage-alcohol/beer/labeling/malt-beverage-health-warning
export const STANDARD_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const LOW_CONFIDENCE_THRESHOLD = 80;
const US_FLUID_OUNCE_ML = 29.5735295625;

const layoutText = (text: string): string => text.replace(/\s+/gu, " ").trim();

/** Case and typography normalization for ordinary application fields, never the warning. */
export function normalizeText(text: string): string {
  return layoutText(
    text.normalize("NFKC").replace(/[‘’‛ʼ]/gu, "'"),
  ).toLocaleLowerCase("en-US");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textCheck(
  key: string,
  label: string,
  expected: string,
  text: string,
): FieldCheck {
  const normalizedExpected = normalizeText(expected);
  if (!normalizedExpected) {
    return {
      key,
      label,
      expected: "Not supplied",
      observed: "Cannot compare",
      status: "review",
      detail: "Enter the application value before this field can be verified.",
    };
  }
  // Word boundaries prevent a short brand such as TOM from matching TOMMY.
  const expression = [...normalizedExpected]
    .map((character) =>
      character === " "
        ? "\\s+"
        : character === "'"
          ? "['‘’‛ʼ]"
          : escapeRegex(character),
    )
    .join("");
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${expression})(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  const found = pattern.exec(text.normalize("NFKC"));
  return {
    key,
    label,
    expected,
    observed: found ? layoutText(found[2]) : "Not found in extracted text",
    status: found ? "match" : "mismatch",
    detail: found
      ? "Matches after ignoring capitalization, spacing, and curly apostrophes."
      : "The application value was not found. Compare the artwork and OCR text.",
  };
}

function numericValues(text: string, expression: RegExp): number[] {
  return [...text.matchAll(expression)].map((match) => Number(match[1]));
}

function alcoholValues(text: string): number[] {
  const percentages = [
    ...text.matchAll(/(?<![\d.+-])(\d+(?:\.\d+)?)\s*(?:%|percent\b)/giu),
  ]
    .filter((match) => {
      const before = text.slice(0, match.index).split(/\r?\n/).at(-1) ?? "";
      const after = text.slice(match.index + match[0].length).split(/\r?\n/)[0];
      const alcoholAfter =
        /^\s*(?:alc(?:ohol)?\.?\b|abv\b|(?:by\s+)?vol(?:ume)?\b)/iu.test(after);
      const alcoholBefore =
        /(?:\babv|\balc(?:ohol)?\.?\s*\/?\s*(?:by\s*)?vol(?:ume)?\.?|\balcohol(?:\s+content)?)\s*:?\s*$/iu.test(
          before,
        );
      const standalone =
        !before.trim() &&
        /^\s*(?:\(\s*\d+(?:\.\d+)?\s*proof\s*\))?\s*$/iu.test(after);
      // "100% blue agave" and similar ingredient/marketing claims are not ABV.
      return alcoholAfter || alcoholBefore || standalone;
    })
    .map((match) => Number(match[1]));
  const unmarked = [
    ...text.matchAll(
      /(?:\babv\b|\balc(?:ohol)?\.?[ \t]*\/?[ \t]*(?:by[ \t]*)?vol(?:ume)?\.?)[ \t]*:?[ \t]*(\d+(?:\.\d+)?)(?![\d.%])/giu,
    ),
  ]
    // A suffix in "45 alcohol by volume 750 mL" must not bind to the volume.
    .filter(
      (match) =>
        !/\d(?:\s*(?:%|percent))?\s*$/iu.test(
          text.slice(0, match.index).split(/\r?\n/).at(-1) ?? "",
        ),
    )
    .map((match) => Number(match[1]));
  const beforeUnit = numericValues(
    text,
    /(?<![\d.+-])(\d+(?:\.\d+)?)[ \t]+(?:alc\.?[ \t]*\/[ \t]*vol\.?|alcohol[ \t]+by[ \t]+volume|abv)\b/giu,
  );
  return [...new Set([...percentages, ...unmarked, ...beforeUnit])];
}

function abvCheck(expected: string, text: string): FieldCheck {
  const field = {
    key: "abv",
    label: "Alcohol content",
    expected: expected || "Not supplied",
  };
  const expectedValues = alcoholValues(expected);
  if (!expectedValues.length && /^\s*\d+(?:\.\d+)?\s*$/.test(expected))
    expectedValues.push(Number(expected));
  if (
    expectedValues.length !== 1 ||
    expectedValues[0] < 0 ||
    expectedValues[0] > 100
  ) {
    return {
      ...field,
      observed: "Cannot compare",
      status: "review",
      detail: "Supply one application ABV between 0 and 100, for example 45%.",
    };
  }
  const target = expectedValues[0];
  const values = alcoholValues(text);
  const proofs = numericValues(
    text,
    /(?<![\d.+-])(\d+(?:\.\d+)?)\s*(?:°\s*)?proof\b/giu,
  );
  const observed =
    [
      ...values.map((value) => `${value}% ABV`),
      ...proofs.map((proof) => `${proof} proof`),
    ].join(" · ") || "Not found in extracted text";
  if (!values.length) {
    return {
      ...field,
      observed,
      status: "mismatch",
      detail: proofs.length
        ? "Proof was found, but an ABV declaration was not. Proof alone is not treated as an ABV match."
        : "No alcohol-by-volume declaration was found.",
    };
  }
  const same = values.every((value) => Math.abs(value - target) < 0.0001);
  const proofConsistent = proofs.every(
    (proof) => Math.abs(proof - target * 2) < 0.0001,
  );
  return {
    ...field,
    observed,
    status: same && proofConsistent ? "match" : "mismatch",
    detail: !same
      ? "The extracted ABV differs from the application or contains conflicting values."
      : !proofConsistent
        ? "The proof declaration conflicts with the ABV (US proof must equal twice the ABV)."
        : "ABV matches numerically. Any proof declaration is consistent.",
  };
}

interface Volume {
  display: string;
  ml: number;
}

function volumes(text: string): Volume[] {
  const pattern =
    /(?<![\d.+-])(\d+(?:\.\d+)?|\.\d+)\s*(millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|fl\.?\s*oz\.?|fluid\s+ounces?)\b/giu;
  return [...text.matchAll(pattern)].map((match) => {
    const unit = match[2].toLowerCase();
    const multiplier = /^(?:ml|millil)/.test(unit)
      ? 1
      : /^(?:l|lit)/.test(unit)
        ? 1000
        : US_FLUID_OUNCE_ML;
    return { display: match[0], ml: Number(match[1]) * multiplier };
  });
}

function netContentsCheck(expected: string, text: string): FieldCheck {
  const field = {
    key: "netContents",
    label: "Net contents",
    expected: expected || "Not supplied",
  };
  const target = volumes(expected);
  if (target.length !== 1 || target[0].ml <= 0) {
    return {
      ...field,
      observed: "Cannot compare",
      status: "review",
      detail:
        "Supply one positive application volume in mL, L, or US fluid ounces.",
    };
  }
  const found = volumes(text);
  // 0.2% permits rounded dual-unit declarations such as 750 mL / 25.4 fl oz.
  const tolerance = Math.max(0.5, target[0].ml * 0.002);
  const same =
    found.length > 0 &&
    found.every(
      (volume) =>
        volume.ml > 0 && Math.abs(volume.ml - target[0].ml) <= tolerance,
    );
  return {
    ...field,
    observed:
      found.map((volume) => volume.display).join(" · ") ||
      "Not found in extracted text",
    status: same ? "match" : "mismatch",
    detail: same
      ? "Matches after converting mL, L, and US fluid ounces (0.2% rounding tolerance, minimum 0.5 mL)."
      : found.length
        ? "The volume differs from the application or contains conflicting declarations."
        : "No supported net-contents declaration was found.",
  };
}

function extractWarning(text: string): string {
  const start = /\bgovernment\s+warning\b/iu.exec(text);
  if (!start) return "";
  const remainder = text.slice(start.index);
  const end = /health\s+problems\./iu.exec(remainder);
  if (!end) return remainder.trim();
  const endIndex = end.index + end[0].length;
  // Additional words attached to the same warning line must not disappear.
  const trailingSameLine = remainder.slice(endIndex).split(/\r?\n/)[0];
  if (trailingSameLine.trim())
    return remainder.slice(0, endIndex + trailingSameLine.length).trim();
  // An additional warning declaration needs human resolution, even if the first is exact.
  if (/\bgovernment\s+warning\b/iu.test(remainder.slice(endIndex)))
    return remainder.trim();
  return remainder.slice(0, endIndex);
}

function countryCheck(expected: string, text: string): FieldCheck {
  const check = textCheck("country", "Country of origin", expected, text);
  if (check.status !== "match") return check;
  const country = escapeRegex(normalizeText(expected)).replaceAll(" ", "\\s+");
  const declaration = new RegExp(
    `\\b(?:(?:product|produce)\\s+of|(?:made|produced|distilled|brewed)\\s+in|country\\s+of\\s+origin\\s*:?)\\s+${country}(?=$|[^\\p{L}\\p{N}])`,
    "iu",
  );
  if (!declaration.test(normalizeText(text))) {
    return {
      ...check,
      status: "review",
      detail:
        "The country name appears, but a supported origin declaration was not identified. A producer/importer address or marketing reference alone does not establish product origin.",
    };
  }
  return {
    ...check,
    detail:
      "The application country appears in an explicit product-origin declaration.",
  };
}

/**
 * Checks supplied application fields against raw OCR. Confidence is 0–100.
 * A match is decision support, never a COLA approval. Typography needs a human.
 */
export function verifyLabel(
  text: string,
  expected: ApplicationFields,
  confidence: number,
  warningBoldConfirmed = false,
): VerificationResult {
  const warningText = extractWarning(text);
  const warningExact = layoutText(warningText) === STANDARD_WARNING;
  const warningHeaderCorrect = layoutText(warningText).startsWith(
    "GOVERNMENT WARNING:",
  );
  const checks: FieldCheck[] = [
    textCheck("brand", "Brand name", expected.brand, text),
    textCheck("classType", "Class / type", expected.classType, text),
    abvCheck(expected.abv, text),
    netContentsCheck(expected.netContents, text),
    textCheck(
      "producer",
      "Producer / bottler and address",
      expected.producer,
      text,
    ),
  ];
  if (expected.imported) checks.push(countryCheck(expected.country, text));
  checks.push(
    {
      key: "warning",
      label: "Government warning wording",
      expected: STANDARD_WARNING,
      observed: warningText || "Not found in extracted text",
      status: warningExact ? "match" : "mismatch",
      detail: warningExact
        ? "Exact required text, including punctuation; line breaks and spacing are ignored."
        : "Missing or altered warning text. Compare the full statement, punctuation, and capitalization against the artwork.",
    },
    {
      key: "warningHeader",
      label: "Warning header capitals",
      expected: "GOVERNMENT WARNING:",
      observed: warningText
        ? layoutText(warningText).split(/\(1\)/)[0].trim()
        : "Not found",
      status: warningHeaderCorrect ? "match" : "mismatch",
      detail: warningHeaderCorrect
        ? "The extracted header is uppercase and includes the colon."
        : "The header must read GOVERNMENT WARNING: in capital letters.",
    },
    {
      key: "warningTypography",
      label: "Warning typography",
      expected: "Bold header; regular-weight body",
      observed: warningBoldConfirmed
        ? "Visually confirmed by reviewer"
        : "Visual confirmation needed",
      status: warningBoldConfirmed ? "match" : "review",
      detail:
        "OCR text cannot establish bold weight, minimum type size, contrast, or placement. Inspect the image before confirming typography.",
    },
  );

  const lowConfidence =
    !Number.isFinite(confidence) ||
    confidence < LOW_CONFIDENCE_THRESHOLD ||
    confidence > 100;
  if (lowConfidence) {
    for (const check of checks) {
      if (check.status === "match" && check.key !== "warningTypography") {
        check.status = "review";
        check.detail = `Low OCR confidence: confirm against the image. ${check.detail}`;
      }
    }
  }
  const status = checks.some((check) => check.status === "mismatch")
    ? "flagged"
    : checks.some((check) => check.status === "review")
      ? "review"
      : "matched";
  return { checks, status, warningText, warningExact, warningHeaderCorrect };
}
