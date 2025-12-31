// ================================
// src/core/index.ts（全文差し替えOK）
// ================================
export * from "./types";
export * from "./rules";
export * from "./time";
export * from "./random";

// 重要：ロジックすべてここから export
export {
  createInitialState,
  tickCore,
  rollCatch,
  setCaught,
  adoptCaught,
  releaseCaught,
  applyWater,
  applyFeedCucumber,
} from "./logic";
