// Vitest global setup: one migrated template database per run (ADR-037).
import { buildTemplate } from "./pg";

export default async function setup() {
  await buildTemplate();
}
