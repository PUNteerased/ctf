/**
 * Playable game stages are 1..3.
 * Dify workflow stages keep original numbering (skip old stage 2): 1, 3, 4.
 */
const GAME_TO_DIFY_STAGE: Record<number, number> = {
  1: 1,
  2: 3,
  3: 4,
}

const DIFY_TO_GAME_STAGE: Record<number, number> = {
  1: 1,
  3: 2,
  4: 3,
}

export function gameStageToDifyStage(stage: number): number {
  return GAME_TO_DIFY_STAGE[stage] ?? stage
}

export function difyStageToGameStage(stage: number): number {
  return DIFY_TO_GAME_STAGE[stage] ?? stage
}
