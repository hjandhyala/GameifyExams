# Prompt templates

Versioned per (engine) as `<engine>.v<N>.md`. The pipeline (`packages/pipeline/src/generate/prompts.ts`) renders them with:
`{{EXAM_FACTS}}`, `{{STYLE_RULES}}`, `{{INVARIANTS}}`, `{{DIFFICULTY_RUBRIC}}`, `{{OUTPUT_CONTRACT}}` (system, cached prefix) and
`{{SLOT}}`, `{{SEED}}`, `{{GROUNDING}}` (user message). `provenance.promptVersion` records which version produced an item.
