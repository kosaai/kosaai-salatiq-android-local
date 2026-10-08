const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'validation-output/prayer');
const engine = require(path.join(root, 'services/prayerEngine.js'));
const { fajrSequence } = require(path.join(root, 'constants/fajrSequence.js'));
const { maghribSequence } = require(path.join(root, 'constants/maghribSequence.js'));
const { fourRakahSequence } = require(path.join(root, 'constants/fourRakahSequence.js'));
const poseFor = (stage) => ({
  STANDING: 'STANDING', BOWING: 'BOWING', ITIDAL: 'STANDING',
  SUJUD_1: 'PROSTRATING', SUJUD_2: 'PROSTRATING',
  SITTING_BETWEEN_SUJUD: 'SITTING', TASHAHHUD: 'SITTING',
})[stage];

const originalNow = Date.now;
let now = 1_000_000;
Date.now = () => now;
try {
  for (const [prayer, sequence] of [
    ['FAJR', fajrSequence], ['MAGHRIB', maghribSequence],
    ['DHUHR', fourRakahSequence], ['ASR', fourRakahSequence], ['ISHA', fourRakahSequence],
  ]) {
    let state = engine.createInitialPrayerState(prayer);
    for (const expected of sequence) {
      state = engine.advancePrayerSequence(state, poseFor(expected.stage));
      assert.equal(state.prayerStage, expected.stage);
      assert.equal(state.sahwAlerts.length, 0);
      now += 2_000;
    }
    assert.equal(state.prayerCompleted, true);
    assert.equal(state.currentRakah, state.totalRakahs);
    const finalState = state;
    state = engine.advancePrayerSequence(state, 'STANDING');
    const started = now;
    assert.equal(state.prayerStage, 'TASHAHHUD');
    assert.equal(state.sahwAlerts.length, 0);
    now = started + 9_999;
    state = engine.confirmFinalTashahhudTimeout(state);
    assert.equal(state.sahwAlerts.length, 0);
    now = started + 10_000;
    state = engine.confirmFinalTashahhudTimeout(state);
    assert.equal(state.sahwAlerts.at(-1).type, 'MOVEMENT_AFTER_FINAL_TASHAHHUD');
    assert(state.activeSahwEvent);
    state = engine.advancePrayerSequence(state, 'SITTING');
    assert.equal(state.activeSahwEvent, null);
    assert.equal(state.prayerStage, 'TASHAHHUD');
    // Correct sitting cancels a pending final-tashahhud confirmation.
    state = engine.advancePrayerSequence(finalState, 'BOWING');
    state = engine.advancePrayerSequence(state, 'SITTING');
    assert.equal(state.finalTashahhudConfirmationStartedAt, null);
    assert.equal(engine.confirmFinalTashahhudTimeout(state).sahwAlerts.length, 0);
    console.log(`${prayer}: four-class sequence, contextual stages, 10-second protection and sahw recovery passed.`);
  }
  assert.equal(engine.normalizePrayerEngineState({ confidence: 0.1 }).confidence, 0.1);
} finally {
  Date.now = originalNow;
}
