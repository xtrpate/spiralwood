const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.8-flash";

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanReferenceParts = (parts) => {
  if (!Array.isArray(parts)) return [];

  return parts
    .map((part) => ({
      templateType: String(part?.templateType || "").trim(),
      type: String(part?.type || "").trim(),
      partCode: String(part?.partCode || "").trim(),
      label: String(part?.label || "").trim(),

      width: safeNumber(part?.width),
      height: safeNumber(part?.height),
      depth: safeNumber(part?.depth),

      localX: safeNumber(part?.localX),
      localY: safeNumber(part?.localY),
      localZ: safeNumber(part?.localZ),
    }))
    .filter(
      (part) =>
        part.type && part.width > 0 && part.height > 0 && part.depth > 0,
    );
};

// WISDOM AI DEFAULT COMPONENT FALLBACK V1.0.0
// Full set of real component types available for each known template.
// Used both by the local fast-path parser and as a rescue for Gemini
// responses whose componentTypes selection doesn't fully resolve.
const buildDefaultComponentTypesByTemplate = (catalog) =>
  catalog.reduce((acc, part) => {
    if (!part.templateType) return acc;
    if (!acc[part.templateType]) acc[part.templateType] = new Set();
    acc[part.templateType].add(part.type);
    return acc;
  }, {});

// ---------------------------------------------------------------------
// WISDOM AI LOCAL FAST-PATH PARSER V1.0.0
// ---------------------------------------------------------------------
// Handles the common, structurally simple prompts (bare "create a
// table", sized table + N chairs, etc.) entirely locally — no Gemini
// call, no quota usage, no dependency on the API being up. Anything
// the parser isn't confident about falls through to Gemini untouched.

// Furniture nouns we do NOT have templates for. If the prompt mentions
// one of these, bail out to Gemini rather than let the local parser
// guess or silently ignore the request.
const OTHER_FURNITURE_HINTS =
  /\b(sofa|couch|bed|shelf|shelving|cabinet|desk|bench|stool|dresser|wardrobe|nightstand|bookcase|drawer)\b/i;

// e.g. "1600x800mm", "1800 x 900 x 750mm", "1600×800"
const DIMENSION_REGEX =
  /(\d{2,5})\s*[x×]\s*(\d{2,5})(?:\s*[x×]\s*(\d{2,5}))?\s*mm\b/i;

const buildTemplateKeywordMap = (catalog) => {
  const templateTypes = [
    ...new Set(catalog.map((part) => part.templateType).filter(Boolean)),
  ];

  return templateTypes.map((templateType) => {
    const words = templateType
      .replace(/^template_/, "")
      .split("_")
      .filter(Boolean);

    const lastWord = words[words.length - 1] || "item";

    return {
      templateType,
      furnitureType: words.join(" ") || templateType,
      // Matches "table"/"tables", "chair"/"chairs", etc.
      keywordRegex: new RegExp(`\\b${lastWord}s?\\b`, "i"),
      // Requires the number to sit directly against the furniture word
      // (only through a small set of harmless connector words), so
      // "4 legged table" or "1800x900mm ... table" never get misread
      // as a quantity of 4 or 1800 tables.
      quantityRegex: new RegExp(
        `(\\d+)\\s*(?:sturdy\\s+|matching\\s+|dining\\s+)?${lastWord}s?\\b`,
        "i",
      ),
    };
  });
};

const tryParsePromptLocally = ({
  prompt,
  catalog,
  defaultComponentTypesByTemplate,
}) => {
  const text = String(prompt || "").trim();
  if (!text) return null;

  // Never guess at furniture we don't actually have templates for.
  if (OTHER_FURNITURE_HINTS.test(text)) return null;

  const templates = buildTemplateKeywordMap(catalog);

  const matches = templates
    .map((tpl) => {
      if (!tpl.keywordRegex.test(text)) return null;

      const qtyMatch = text.match(tpl.quantityRegex);
      const quantity = qtyMatch
        ? Math.max(1, Math.round(Number(qtyMatch[1]) || 1))
        : 1;

      return { ...tpl, quantity };
    })
    .filter(Boolean);

  // Nothing recognized locally (unusual phrasing, unsupported item,
  // creative/free-form request) — let Gemini take it.
  if (!matches.length) return null;

  const dimMatch = text.match(DIMENSION_REGEX);
  const dims = dimMatch
    ? {
        width: Number(dimMatch[1]) || 0,
        depth: Number(dimMatch[2]) || 0,
        height: dimMatch[3] ? Number(dimMatch[3]) || 0 : 0,
      }
    : null;

  // Explicit dimensions apply to the table when one is present,
  // otherwise to the single item that was requested.
  const tableMatch = matches.find((m) => /table/i.test(m.furnitureType));
  const dimensionTarget =
    tableMatch || (matches.length === 1 ? matches[0] : null);

  const assemblies = matches.map((m) => ({
    furnitureType: m.furnitureType,
    templateType: m.templateType,
    quantity: m.quantity,
    width: dims && dimensionTarget === m ? dims.width : 0,
    height: dims && dimensionTarget === m ? dims.height : 0,
    depth: dims && dimensionTarget === m ? dims.depth : 0,
    componentTypes: [
      ...(defaultComponentTypesByTemplate[m.templateType] || []),
    ],
  }));

  // If we can't resolve a full component list for a matched template,
  // don't return a half-built assembly — defer to Gemini instead.
  if (assemblies.some((assembly) => !assembly.componentTypes.length)) {
    return null;
  }

  return assemblies;
};

// ---------------------------------------------------------------------
// WISDOM AI GEMINI RETRY/BACKOFF V1.0.0
// ---------------------------------------------------------------------
// 503 (UNAVAILABLE) is transient — retry a few times with backoff.
// 429 (RESOURCE_EXHAUSTED) means the quota is genuinely used up for the
// window; Gemini tells us how long to wait via retryDelay, so we honor
// a short wait once, and otherwise fail fast with a clear message
// rather than blocking the request indefinitely.

const parseGeminiErrorPayload = (err) => {
  try {
    return JSON.parse(err?.message || "{}");
  } catch {
    return null;
  }
};

const getRetryDelayMs = (err) => {
  const payload = parseGeminiErrorPayload(err);
  const details = payload?.error?.details;
  if (!Array.isArray(details)) return null;

  const retryInfo = details.find((detail) =>
    String(detail?.["@type"] || "").includes("RetryInfo"),
  );

  const raw = retryInfo?.retryDelay;
  if (!raw) return null;

  const seconds = parseFloat(String(raw).replace(/s$/i, ""));
  return Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : null;
};

const MAX_ACCEPTABLE_AUTO_RETRY_MS = 15000;

const callGeminiWithRetry = async (ai, params, { maxAttempts = 3 } = {}) => {
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      lastErr = err;
      const status = err?.status;

      if (status === 503 && attempt < maxAttempts) {
        const backoffMs =
          1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        console.warn(
          `Gemini 503 (high demand), attempt ${attempt}/${maxAttempts}, retrying in ${backoffMs}ms`,
        );
        await sleep(backoffMs);
        continue;
      }

      if (status === 429) {
        const retryDelayMs = getRetryDelayMs(err);
        if (
          retryDelayMs &&
          attempt < maxAttempts &&
          retryDelayMs <= MAX_ACCEPTABLE_AUTO_RETRY_MS
        ) {
          console.warn(
            `Gemini 429 (rate limited), retrying in ${retryDelayMs}ms as instructed`,
          );
          await sleep(retryDelayMs);
          continue;
        }

        // Quota is genuinely exhausted or the wait is too long to hold
        // the request open for — fail fast with a clear message.
        throw err;
      }

      throw err;
    }
  }

  throw lastErr;
};

exports.generateFurniture = async (req, res) => {
  try {
    const { prompt, referenceParts = [] } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        message: "Prompt is required.",
      });
    }

    const catalog = cleanReferenceParts(referenceParts);

    if (!catalog.length) {
      return res.status(400).json({
        message:
          "No valid furniture reference parts were received from the frontend.",
      });
    }

    const defaultComponentTypesByTemplate =
      buildDefaultComponentTypesByTemplate(catalog);

    // --- Local fast-path: no Gemini call, no quota used --------------
    const localAssemblies = tryParsePromptLocally({
      prompt,
      catalog,
      defaultComponentTypesByTemplate,
    });

    if (localAssemblies) {
      console.log(
        "[AI ASSEMBLIES:LOCAL]",
        JSON.stringify(localAssemblies, null, 2),
      );

      return res.json({
        assemblies: localAssemblies,
        source: "local",
      });
    }

    // --- Fall through to Gemini for anything the local parser can't
    // confidently handle -------------------------------------------
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing.");

      return res.status(500).json({
        message: "GEMINI_API_KEY is missing in the backend .env file.",
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Only send a compact catalog to Gemini.
    const compactCatalog = catalog.map((part) => ({
      templateType: part.templateType,
      type: part.type,
      partCode: part.partCode,
      label: part.label,
      width: part.width,
      height: part.height,
      depth: part.depth,
    }));

    const allowedTypes = [...new Set(compactCatalog.map((part) => part.type))];

    const validTypes = new Set(catalog.map((part) => part.type));

    const promptText = `
You are a furniture assembly planner for a woodworking 3D editor.

The application already has real furniture components.
You MUST use only component types from the reference catalog.

Do NOT invent component types.

REFERENCE COMPONENTS:
${JSON.stringify(compactCatalog, null, 2)}

ALLOWED TYPES:
${JSON.stringify(allowedTypes, null, 2)}

USER REQUEST:
${String(prompt).trim()}

TASK:

Understand the user's request and divide it into one or more
furniture assemblies.

Each assembly represents ONE furniture family.

Examples:

"Create me a table"
→ 1 assembly:
  dining table × 1
  (no width/height/depth — leave dimensions unset so the
  application uses the template's default size)

"Create me a chair"
→ 1 assembly:
  dining chair × 1
  (no width/height/depth — leave dimensions unset)

"Create a dining chair"
→ 1 assembly:
  dining chair × 1

"Create 4 dining chairs"
→ 1 assembly:
  dining chair × 4

"Create a dining table with 6 chairs"
→ 2 assemblies:
  dining table × 1
  dining chair × 6

"Create a 1600x800mm dining table with 4 sturdy legs
and 6 matching chairs around it"
→ 2 assemblies:
  dining table × 1 (width 1600, depth 800)
  dining chair × 6

"Create me a 4 legged table with 1800x900mm and 8 chairs around it"
→ 2 assemblies:
  dining table × 1 (width 1800, depth 900)
  dining chair × 8

GENERATIVE CASEGOODS (cabinets, sideboards, bookcases, dressers, TV
stands, or any drawer/door/shelf furniture that is NOT a dining table
or dining chair): do not force these into "assemblies". Instead return
a "generativeAssemblies" entry describing the STRUCTURE only — never
raw coordinates, never exact panel positions. The application computes
all real geometry deterministically from this structural plan, so you
only decide composition, not millimeters-exact placement.

Each generativeAssemblies entry has this shape:
{
  "furnitureType": "cabinet",
  "carcass": { "width": 900, "height": 450, "depth": 400 },
  "material": "Mahogany Wood",
  "hasLegs": true,
  "sections": [
    { "type": "open" },
    { "type": "open" },
    { "type": "drawer_stack", "drawers": 3 }
  ]
}

"sections[].type" must be one of: "open", "drawer_stack", "door_single",
"door_double". Sections are laid out left to right in the order given.
"widthShare" (optional, default 1) controls relative width if sections
should not be equal width. "drawers" (only for drawer_stack) is how
many stacked drawer fronts that section has. "shelves" (only for
"open" sections, optional, default 0) is how many horizontal shelf
boards sit inside that compartment, stacked vertically — use this for
bookcases and shelving, not extra left-right sections.

Example:
"Create me a stylish mahogany cabinet with 3 boxes"
→ 1 generativeAssemblies entry:
  furnitureType: "cabinet"
  material: "Mahogany Wood"
  sections: 2 open + 1 drawer_stack (3 drawers) — "3 boxes" most
  naturally reads as 3 compartments; when genuinely ambiguous, default
  to a reasonable, evenly-proportioned interpretation rather than
  asking a follow-up question, since the person can see and adjust
  the result afterward.

"Create a walnut bookcase with 4 shelves, no drawers"
→ 1 generativeAssemblies entry:
  furnitureType: "bookcase"
  material: "Walnut Wood"
  hasLegs: false
  sections: 1 open section with shelves: 4

Only use "assemblies" for dining table / dining chair requests. Only
use "generativeAssemblies" for everything else. A single request may
use both arrays if it genuinely asks for both kinds of furniture.

IMPORTANT for bare/minimal requests ("create a table", "create a chair",
or any request with no explicit size or component detail): still return
a complete assembly with quantity 1 and a FULL componentTypes list drawn
from the reference catalog for that furniture's templateType — do not
omit or guess a partial component list just because the user didn't list
parts explicitly. Leave width/height/depth unset (0 or omitted) so the
application falls back to that template's default dimensions.

For EACH assembly return:
- furnitureType
- templateType
- quantity
- requested dimensions when explicitly provided
- componentTypes required by that furniture template

IMPORTANT:
- Do not create coordinates.
- Do not invent geometry.
- Do not invent component types.
- Use only component types in the supplied reference catalog.
- The application will construct the actual geometry.

For a dining chair, select the actual chair component types from the catalog.

For a dining table, select the actual dining table component types.

For multiple furniture pieces, specify the quantity.

DO NOT generate coordinates.
DO NOT invent geometry.
DO NOT generate arbitrary panel types.

Return JSON only.
`;

    const response = await callGeminiWithRetry(ai, {
      model: MODEL,
      contents: promptText,
      config: {
        responseMimeType: "application/json",

        responseSchema: {
          type: Type.OBJECT,

          properties: {
            assemblies: {
              type: Type.ARRAY,
              description:
                "Every furniture assembly requested by the user. Each assembly is one furniture type and may have a quantity greater than one.",

              items: {
                type: Type.OBJECT,

                properties: {
                  furnitureType: {
                    type: Type.STRING,
                  },

                  templateType: {
                    type: Type.STRING,
                  },

                  quantity: {
                    type: Type.NUMBER,
                  },

                  width: {
                    type: Type.NUMBER,
                  },

                  height: {
                    type: Type.NUMBER,
                  },

                  depth: {
                    type: Type.NUMBER,
                  },

                  componentTypes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.STRING,
                    },
                  },
                },

                required: [
                  "furnitureType",
                  "templateType",
                  "quantity",
                  "componentTypes",
                ],
              },
            },

            generativeAssemblies: {
              type: Type.ARRAY,
              description:
                "Structural plans for casegood furniture with no fixed template (cabinets, sideboards, bookcases, dressers, TV stands, etc). Structure only — no coordinates.",

              items: {
                type: Type.OBJECT,

                properties: {
                  furnitureType: { type: Type.STRING },

                  carcass: {
                    type: Type.OBJECT,
                    properties: {
                      width: { type: Type.NUMBER },
                      height: { type: Type.NUMBER },
                      depth: { type: Type.NUMBER },
                    },
                  },

                  material: { type: Type.STRING },

                  hasLegs: { type: Type.BOOLEAN },

                  sections: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        type: { type: Type.STRING },
                        widthShare: { type: Type.NUMBER },
                        drawers: { type: Type.NUMBER },
                        shelves: { type: Type.NUMBER },
                      },
                      required: ["type"],
                    },
                  },
                },

                required: ["furnitureType", "sections"],
              },
            },
          },

          required: [],
        },

        thinkingConfig: {
          thinkingLevel: "low",
        },
      },
    });

    const responseText = String(response?.text || "").trim();

    if (!responseText) {
      throw new Error("Gemini returned an empty response.");
    }

    let parsed;

    try {
      parsed = JSON.parse(responseText);
    } catch (jsonError) {
      console.error("Gemini returned invalid JSON:", responseText);

      throw new Error(`Gemini returned invalid JSON: ${jsonError.message}`);
    }

    const assemblies = Array.isArray(parsed?.assemblies)
      ? parsed.assemblies
      : [];

    const rawGenerativeAssemblies = Array.isArray(parsed?.generativeAssemblies)
      ? parsed.generativeAssemblies
      : [];

    if (!assemblies.length && !rawGenerativeAssemblies.length) {
      return res.status(422).json({
        message: "Gemini did not return any furniture assemblies.",
      });
    }

    // WISDOM AI GENERATIVE CASEGOOD SANITIZER V1.0.0
    // The AI only ever decides structure (section count/type, rough
    // dimensions, material). Clamp everything to sane furniture ranges
    // here so a stray model response can't produce absurd geometry —
    // the frontend's deterministic layout engine trusts these bounds.
    const ALLOWED_SECTION_TYPES = new Set([
      "open",
      "drawer_stack",
      "door_single",
      "door_double",
    ]);

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const validGenerativeAssemblies = rawGenerativeAssemblies
      .map((assembly) => {
        const furnitureType = String(assembly?.furnitureType || "").trim();
        if (!furnitureType) return null;

        const rawSections = Array.isArray(assembly?.sections)
          ? assembly.sections
          : [];

        const sections = rawSections.slice(0, 8).map((section) => ({
          type: ALLOWED_SECTION_TYPES.has(section?.type)
            ? section.type
            : "open",
          widthShare:
            Number(section?.widthShare) > 0 ? Number(section.widthShare) : 1,
          drawers: clamp(Math.round(safeNumber(section?.drawers, 3)), 1, 6),
          shelves: clamp(Math.round(safeNumber(section?.shelves, 0)), 0, 8),
        }));

        if (!sections.length) return null;

        return {
          furnitureType,
          carcass: {
            width: clamp(safeNumber(assembly?.carcass?.width, 900), 200, 3000),
            height: clamp(
              safeNumber(assembly?.carcass?.height, 450),
              200,
              2400,
            ),
            depth: clamp(safeNumber(assembly?.carcass?.depth, 400), 200, 900),
          },
          material:
            String(assembly?.material || "Oak Wood").trim() || "Oak Wood",
          hasLegs: assembly?.hasLegs !== false,
          sections,
        };
      })
      .filter(Boolean);

    const validAssemblies = assemblies
      .map((assembly) => {
        const furnitureType = String(assembly?.furnitureType || "").trim();

        const templateType = String(assembly?.templateType || "").trim();

        const quantity = Math.max(
          1,
          Math.round(safeNumber(assembly?.quantity, 1)),
        );

        const width = safeNumber(assembly?.width, 0);

        const height = safeNumber(assembly?.height, 0);

        const depth = safeNumber(assembly?.depth, 0);

        const requestedTypes = Array.isArray(assembly?.componentTypes)
          ? assembly.componentTypes
              .map((type) => String(type || "").trim())
              .filter(Boolean)
          : [];

        let componentTypes = requestedTypes.filter((type) =>
          validTypes.has(type),
        );

        // Rescue assemblies where Gemini's component selection didn't
        // resolve against the catalog (common on bare/minimal prompts)
        // by falling back to the template's full default part list.
        if (
          !componentTypes.length &&
          defaultComponentTypesByTemplate[templateType]
        ) {
          componentTypes = [...defaultComponentTypesByTemplate[templateType]];
        }

        if (!furnitureType || !templateType || !componentTypes.length) {
          return null;
        }

        return {
          furnitureType,
          templateType,
          quantity,
          width,
          height,
          depth,
          componentTypes,
        };
      })
      .filter(Boolean);

    if (!validAssemblies.length && !validGenerativeAssemblies.length) {
      return res.status(422).json({
        message: "Gemini returned no supported furniture assemblies.",
      });
    }

    console.log(
      "[AI ASSEMBLIES:GEMINI]",
      JSON.stringify({ validAssemblies, validGenerativeAssemblies }, null, 2),
    );

    return res.json({
      assemblies: validAssemblies,
      generativeAssemblies: validGenerativeAssemblies,
      source: "gemini",
    });
  } catch (err) {
    console.error("Gemini Generation Error:", err);

    console.error("Gemini error details:", {
      name: err?.name,
      message: err?.message,
      status: err?.status,
      statusText: err?.statusText,
      response: err?.response,
    });

    const status = err?.status;

    if (status === 429) {
      const retryDelayMs = getRetryDelayMs(err);

      return res.status(429).json({
        message: retryDelayMs
          ? `The AI generation service is rate-limited right now. Please try again in about ${Math.ceil(
              retryDelayMs / 1000,
            )} seconds.`
          : "The AI generation service is rate-limited right now (quota exceeded). Please wait a bit and try again.",
      });
    }

    if (status === 503) {
      return res.status(503).json({
        message:
          "The AI generation service is temporarily unavailable (high demand). Please try again in a moment.",
      });
    }

    return res.status(500).json({
      message: err?.message || "Failed to generate furniture.",
    });
  }
};
