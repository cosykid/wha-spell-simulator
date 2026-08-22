// Shared domain types for the spell simulator pipeline.
//
// The pipeline flows: raw pointer input -> strokes -> ring detection ->
// symbol candidates -> recognition -> GlyphAST -> compiled SpellIR -> rendered
// effect. Many intermediate objects are built dynamically, so several of the
// pipeline interfaces keep fields optional and lean on structural typing.
//
// This module is a barrel: the types live in `./types/<domain>.ts`, one file per
// pipeline stage, and are re-exported here so the rest of the app keeps importing
// from `$lib/types`.

export type { AppConfig } from './config.js';

export type * from './types/geometry.js';
export type * from './types/dictionary.js';
export type * from './types/rings.js';
export type * from './types/recognition.js';
export type * from './types/glyph-ast.js';
export type * from './types/seal-reading.js';
export type * from './types/spell-plan.js';
export type * from './types/spell-score.js';
export type * from './types/spell-field.js';
export type * from './types/spell-ir.js';
export type * from './types/input.js';
export type * from './types/placement.js';
