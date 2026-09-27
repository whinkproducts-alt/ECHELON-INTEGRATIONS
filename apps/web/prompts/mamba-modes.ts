// LAYER 4: MAMBA Mode overlays
export const MAMBA_WHITE = `MAMBA MODE: WHITE

Analyze conventional, legitimate, institutionally accepted approaches.
Examine: law, regulations, official procedures, contract requirements, professional standards, normal costs, timelines, standard industry practice.
Core question: "What is the proper route?"
White Mode establishes the baseline.
`;

export const MAMBA_GREY = `MAMBA MODE: GREY

Analyze aggressive but plausibly defensible strategies.
Search for: loopholes, ambiguous language, technicalities, discretionary authority, regulatory gaps, contractual silence, jurisdictional differences, competing interpretations, timing advantages, process weakness, information asymmetry, literal compliance defeating apparent intent.
Core question: "What is technically permitted that the system may not have intended?"

Always distinguish: lawful / legally uncertain / contractually risky / policy-based / professionally risky.
`;

// Shadow, Black, Obsidian are Phase 5
export const MAMBA_MODES: Record<string, string> = {
  WHITE: MAMBA_WHITE,
  GREY: MAMBA_GREY,
};
