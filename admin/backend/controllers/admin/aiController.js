const { GoogleGenAI, Type } = require("@google/genai");

const MODEL = "gemini-3.8-flash";

const safeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

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

exports.generateFurniture = async (req, res) => {
  try {
    const { prompt, referenceParts = [] } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        message: "Prompt is required.",
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing.");

      return res.status(500).json({
        message: "GEMINI_API_KEY is missing in the backend .env file.",
      });
    }

    const catalog = cleanReferenceParts(referenceParts);

    if (!catalog.length) {
      return res.status(400).json({
        message:
          "No valid furniture reference parts were received from the frontend.",
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

Determine which furniture family the user wants.

Return:
TASK:

Understand the user's request and divide it into one or more
furniture assemblies.

Each assembly represents ONE furniture family.

Examples:

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
  dining table × 1
  dining chair × 6

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

    const response = await ai.models.generateContent({
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
          },

          required: ["assemblies"],
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

    if (!assemblies.length) {
      return res.status(422).json({
        message: "Gemini did not return any furniture assemblies.",
      });
    }

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

        const componentTypes = requestedTypes.filter((type) =>
          validTypes.has(type),
        );

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

    if (!validAssemblies.length) {
      return res.status(422).json({
        message: "Gemini returned no supported furniture assemblies.",
      });
    }

    console.log("[AI ASSEMBLIES]", JSON.stringify(validAssemblies, null, 2));

    return res.json({
      assemblies: validAssemblies,
    });

    const requestedWidth = safeNumber(parsed?.width, 0);

    const requestedHeight = safeNumber(parsed?.height, 0);

    const requestedDepth = safeNumber(parsed?.depth, 0);

    const requestedTypes = Array.isArray(parsed?.componentTypes)
      ? parsed.componentTypes
          .map((type) => String(type || "").trim())
          .filter(Boolean)
      : [];
  } catch (err) {
    console.error("Gemini Generation Error:", err);

    console.error("Gemini error details:", {
      name: err?.name,
      message: err?.message,
      status: err?.status,
      statusText: err?.statusText,
      response: err?.response,
    });

    return res.status(500).json({
      message: err?.message || "Failed to generate furniture.",
    });
  }
};
