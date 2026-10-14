import fs from "node:fs";
import path from "node:path";
import { SECTIONS } from "@/config/sections";
import type { Snapshot } from "@/types";

/** Desk pet's latest app version: the one-line desk-pet/VERSION file. desk-pet/build.sh compiles the same file into the app. */
export const petVersion = () => fs.readFileSync(path.join(process.cwd(), "desk-pet", "VERSION"), "utf8").trim();

/** Section display names for the pet, derived from SECTIONS (the pet falls back to its built-in map when absent). */
export const sectionLabels = () =>
  Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, { ko: s.ko, en: s.en }]));

export const PET_UPDATE_COMMAND = "cd ai-trend/desk-pet && git pull && ./install.sh";

/** latest.json: the latest edition as-is plus `sections` and `pet` for the desk pet. Old pets ignore the extra fields. */
export const buildLatest = (snap: Snapshot | null) => ({
  ...(snap ?? {}),
  sections: sectionLabels(),
  pet: { version: petVersion(), update: PET_UPDATE_COMMAND },
});
