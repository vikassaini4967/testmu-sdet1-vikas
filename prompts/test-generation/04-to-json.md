TASK: Convert the three feature files above into one JSON document.

SHAPE:
{
  "modules": [
    { "name": "<the module's name: Login, Dashboard or REST API>",
      "cases": [ { "id", "title", "priority", "type", "tags", "preconditions", "steps", "expected", "assumptions" } ] }
  ],
  "coverage": { "total", "byModule", "byPriority" },
  "warnings": []
}

RULES:
- IDs and titles must match the Gherkin exactly. If they drift, the two files are useless to each other.
- priority: P0 only when a failure means "do not ship"; P1 = fix this sprint; P2 = everything else.
- assumptions: copy any @assumption notes; an empty array if there are none.
- Do NOT invent cases that are not in the Gherkin. If your count differs from the number of scenarios, say so in "warnings" instead of padding.

OUTPUT CONTRACT: only the JSON object — no markdown fence, no prose.
