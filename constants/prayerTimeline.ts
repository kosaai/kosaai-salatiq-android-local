import type { PrayerStage, PrayerState, PrayerType } from '../types/prayer';
import { prayerConfig } from './prayers';

type TashahhudKind = 'first' | 'final' | null;

export type PrayerTimelineNode = {
  id: string;
  rakah: number;
  stage: Exclude<PrayerStage, null>;
  tashahhud: TashahhudKind;
  label: string;
};

export type PrayerTimelineRow = {
  rakah: number;
  nodes: PrayerTimelineNode[];
};

const baseRakahStages: ReadonlyArray<Pick<PrayerTimelineNode, 'stage' | 'label'>> = [
  { stage: 'STANDING', label: 'قيام' },
  { stage: 'BOWING', label: 'ركوع' },
  { stage: 'ITIDAL', label: 'اعتدال' },
  { stage: 'SUJUD_1', label: 'سجود أول' },
  { stage: 'SITTING_BETWEEN_SUJUD', label: 'جلوس' },
  { stage: 'SUJUD_2', label: 'سجود ثانٍ' },
];

function createNode(
  rakah: number,
  stage: Exclude<PrayerStage, null>,
  label: string,
  tashahhud: TashahhudKind = null,
): PrayerTimelineNode {
  return {
    id: `${rakah}-${stage}-${tashahhud ?? 'none'}`,
    rakah,
    stage,
    tashahhud,
    label,
  };
}

/** Visible, per-rakah sequence for the selected prayer. */
export function createPrayerTimeline(prayer: PrayerType): PrayerTimelineRow[] {
  const totalRakahs = prayerConfig[prayer].rakahs;

  return Array.from({ length: totalRakahs }, (_, index) => {
    const rakah = index + 1;
    const nodes = baseRakahStages.map(({ stage, label }) => createNode(rakah, stage, label));

    if (rakah === 2 && totalRakahs > 2) {
      nodes.push(createNode(rakah, 'TASHAHHUD', 'التشهد الأول', 'first'));
    }

    if (rakah === totalRakahs) {
      nodes.push(createNode(rakah, 'TASHAHHUD', 'التشهد الأخير', 'final'));
    }

    return { rakah, nodes };
  });
}

/** Maps the live engine state to one concrete timeline item. */
export function getActivePrayerTimelineNodeId(state: PrayerState): string | null {
  if (!state.prayerStage) return null;

  let rakah = state.currentRakah;
  if (
    state.prayerStage === 'SUJUD_2' &&
    !state.sequence.awaitingFirstTashahhud &&
    !state.sequence.awaitingFinalTashahhud
  ) {
    rakah -= 1;
  }

  if (rakah < 1) return null;

  const tashahhud =
    state.prayerStage === 'TASHAHHUD'
      ? state.sequence.awaitingFinalTashahhud
        ? 'final'
        : state.sequence.awaitingFirstTashahhud
          ? 'first'
          : null
      : null;

  return `${rakah}-${state.prayerStage}-${tashahhud ?? 'none'}`;
}
