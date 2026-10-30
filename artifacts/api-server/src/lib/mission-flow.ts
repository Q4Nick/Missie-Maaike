import { PUZZLES, unlockMs } from "./mission-data";

export const SPECIAL_INDEX = 31;
export const GROUP_GATE = Date.parse("2026-10-31T15:00:00+01:00");

export type MissionStep =
  | { stage: "clue"; index: number }
  | { stage: "waiting"; index: number | null; unlockAt: number }
  | { stage: "blocked"; index: number }
  | { stage: "finished" };

/**
 * Bepaalt de ene stap waar een agent nu staat. Een clue komt pas vrij als de
 * klok op nul staat én de vorige is opgelost; vanaf 15:00 gaat de persoonlijke
 * vraag voor, zodat een agent die achterloopt de groep niet tegenhoudt.
 */
export function missionStep(input: {
  now: number;
  solved: ReadonlySet<number>;
  personalDone: boolean;
  groupComplete: boolean;
}): MissionStep {
  const { now, solved, personalDone, groupComplete } = input;
  if (now >= GROUP_GATE && !personalDone) return { stage: "clue", index: SPECIAL_INDEX };

  const index = PUZZLES.findIndex((_, candidate) => !solved.has(candidate));
  if (index < 0) return { stage: "finished" };

  const unlockAt = unlockMs(PUZZLES[index].at);
  if (now < unlockAt) {
    // Voor 15:00 is de groepsvraag altijd de eerstvolgende stap na de laatste clue.
    return { stage: "waiting", index, unlockAt: unlockAt > GROUP_GATE && now < GROUP_GATE ? GROUP_GATE : unlockAt };
  }
  if (unlockAt > GROUP_GATE && !groupComplete) return { stage: "blocked", index };
  return { stage: "clue", index };
}
