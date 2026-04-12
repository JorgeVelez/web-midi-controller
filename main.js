'use strict';

import { Knob } from './knob.js';
import { refs, STORAGE_KEY } from './state.js';
import {
  inSelect, outSelect, thruToggle, sendChannel,
  initMidi, setOnProgramChange, setOnHighlightKey,
  selectedOutput, addLogEntry, setMidiThru,
} from './devices.js';
import {
  soundChannel, soundPresets, setAllKnobs as setSoundKnobs,
  loadSoundState, onProgramChange, getCurrentProgram,
} from './sound.js';
import {
  rhythmChannel, rhythmPresets, setAllKnobs as setRhythmKnobs,
  loadRhythmState,
} from './rhythm.js';
import {
  buildPiano, highlightKey,
  getPianoStartNote, setPianoStartNote, setTransposeAmount,
} from './piano.js';

// --- Knob groups ---
const KNOB_GROUPS = [
  {
    container: 'ctrl-sound',
    knobs: [
      { id: 'harmonics',    label: 'Harmonics',    cc: 10, value: 0  },
      { id: 'timbre',       label: 'Timbre',       cc: 11, value: 64 },
      { id: 'morph',        label: 'Morph',        cc: 12, value: 0  },
      { id: 'lpg_colour',   label: 'LPG Colour',   cc: 13, value: 64 },
      { id: 'decay',        label: 'Decay',        cc: 14, value: 64 },
      { id: 'pitch_offset', label: 'Freq',         cc: 15, value: 64 },
    ],
  },
  {
    container: 'ctrl-rhythm-1',
    knobs: [
      { id: 'x1',     label: 'X',     cc: 32, value: 64 },
      { id: 'y1',     label: 'Y',     cc: 34, value: 64 },
      { id: 'chaos1', label: 'Chaos', cc: 36, value: 0  },
    ],
  },
  {
    container: 'ctrl-rhythm-2',
    knobs: [
      { id: 'density1', label: 'Density 1', cc: 33, value: 64 },
      { id: 'density2', label: 'Density 2', cc: 35, value: 64 },
      { id: 'density3', label: 'Density 3', cc: 37, value: 0  },
    ],
  },
  {
    container: 'ctrl-global',
    knobs: [
      { id: 'bpm', label: 'BPM', cc: 70, value: 64 },
    ],
  },
  {
    container: 'ctrl-pitch',
    knobs: [
      { id: 'root',      label: 'Root',      cc: 86, value: 0   },
      { id: 'range',     label: 'Range',     cc: 87, value: 64  },
      { id: 'scale',     label: 'Scale',     cc: 88, value: 0   },
      { id: 'spread',    label: 'Spread',    cc: 89, value: 0   },
      { id: 'bias',      label: 'Bias',      cc: 90, value: 64  },
      { id: 'dejavu',    label: 'Dejavu',    cc: 91, value: 0   },
      { id: 'transpose', label: 'Transpose', cc: null, value: 0, min: -24, max: 24 },
    ],
  },
];

const SOUND_GROUP_CONTAINER = 'ctrl-sound';
const RHYTHM_CONTAINERS     = ['ctrl-rhythm-1', 'ctrl-rhythm-2'];

let allKnobs = [];

function buildKnobs() {
  allKnobs = [];
  for (const group of KNOB_GROUPS) {
    const container = document.getElementById(group.container);
    if (!container) continue;
    const isSoundGroup  = group.container === SOUND_GROUP_CONTAINER;
    const isRhythmGroup = RHYTHM_CONTAINERS.includes(group.container);
    for (const def of group.knobs) {
      const knob = new Knob(def);
      knob.onChange = (value, cc, channel) => {
        if (cc === null) {
          setTransposeAmount(value);
          return;
        }
        if (!selectedOutput) return;
        const ch = isSoundGroup ? soundChannel : isRhythmGroup ? rhythmChannel : (channel - 1);
        selectedOutput.send([0xb0 | ch, cc, value]);
        addLogEntry('CC', 'cc', `ch${ch + 1}  cc${cc}  val ${value}`);
      };
      container.appendChild(knob.el);
      allKnobs.push(knob);
    }
  }
}

function loadState() {
  let state;
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return; }
  if (!state) return;

  try {
    if (state.thru !== undefined) {
      thruToggle.checked = state.thru;
      setMidiThru(state.thru);
    }
    if (state.octave  !== undefined) setPianoStartNote(state.octave);
    if (state.channel !== undefined) sendChannel.value = state.channel;
    if (state.preferredIn)  inSelect.dataset.preferred  = state.preferredIn;
    if (state.preferredOut) outSelect.dataset.preferred = state.preferredOut;

    if (state.knobs) {
      for (const k of allKnobs) {
        const s = state.knobs[k.id];
        if (!s) continue;
        if (s.cc !== undefined && k.cc !== null) {
          k.cc = s.cc;
          const ccIn = k.el.querySelector('.knob-cc-input');
          if (ccIn) ccIn.value = k.cc;
        }
        if (s.channel !== undefined) {
          k.channel = s.channel;
          const chIn = k.el.querySelector('.knob-ch-input');
          if (chIn) chIn.value = k.channel;
        }
        if (s.value !== undefined) {
          k.setValue(s.value, true);
          if (k.id === 'transpose') setTransposeAmount(k.value);
        }
      }
    }

    loadRhythmState(state);
    loadSoundState(state);
  } catch (err) {
    console.warn('loadState failed, clearing saved state:', err);
    localStorage.removeItem(STORAGE_KEY);
  }
}

// --- Wire up state refs ---
refs.thruToggle        = thruToggle;
refs.sendChannel       = sendChannel;
refs.inSelect          = inSelect;
refs.outSelect         = outSelect;
refs.soundPresets      = soundPresets;
refs.rhythmPresets     = rhythmPresets;
refs.getCurrentProgram = getCurrentProgram;
refs.getPianoStartNote = getPianoStartNote;

// --- Wire up device callbacks ---
setOnProgramChange(onProgramChange);
setOnHighlightKey(highlightKey);

// --- Boot ---
const statusEl = document.getElementById('midi-status');
try {
  buildKnobs();
  refs.allKnobs = allKnobs;
  setSoundKnobs(allKnobs);
  setRhythmKnobs(allKnobs);

  loadState();
  buildPiano();
  initMidi();
} catch (err) {
  console.error('Boot failed:', err);
  statusEl.textContent = 'Boot error: ' + err.message;
  statusEl.className = 'status disconnected';
}
