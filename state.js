export const STORAGE_KEY = 'wmidi_state';

// Refs set by main.js after construction, so modules don't create circular deps
export const refs = {
  allKnobs:       null,  // Knob[]
  thruToggle:     null,
  sendChannel:    null,
  inSelect:       null,
  outSelect:      null,
  soundPresets:   null,
  rhythmPresets:  null,
  getCurrentProgram:  () => 0,
  getPianoStartNote:  () => 48,
};

export function saveState() {
  const knobState = {};
  for (const k of refs.allKnobs) {
    knobState[k.id] = { value: k.value, cc: k.cc, channel: k.channel };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    thru:          refs.thruToggle.checked,
    program:       refs.getCurrentProgram(),
    octave:        refs.getPianoStartNote(),
    channel:       refs.sendChannel.value,
    knobs:         knobState,
    preferredIn:   refs.inSelect.value,
    preferredOut:  refs.outSelect.value,
    soundPresets:  refs.soundPresets,
    rhythmPresets: refs.rhythmPresets,
  }));
}
