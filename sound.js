import { saveState } from './state.js';
import { selectedOutput, addLogEntry } from './devices.js';

const pcPrevBtn = document.getElementById('pc-prev-btn');
const pcNextBtn = document.getElementById('pc-next-btn');
const pcLabelEl = document.getElementById('pc-label');
const pcNameEl  = document.getElementById('pc-name');

// --- Program Change ---
const PROGRAM_NAMES = [
  'Virtual Analog VCF', 'Phase Distortion', '6-Op FM I', '6-Op FM II',
  '6-Op FM III', 'Wave Terrain', 'String Machine', 'Chiptune',
  'Virtual Analog', 'Waveshaping', 'FM', 'Grain', 'Additive', 'Wavetable',
  'Chord', 'Speech', 'Swarm', 'Noise', 'Particle', 'String',
  'Modal', 'Bass Drum', 'Snare Drum', 'Hi-Hat',
];

let currentProgram = 0;
export function getCurrentProgram() { return currentProgram; }

export function updatePcLabel() {
  pcLabelEl.textContent = currentProgram + 1;
  pcNameEl.textContent  = PROGRAM_NAMES[currentProgram] ?? '';
}

export function onProgramChange(prog) {
  currentProgram = prog;
  updatePcLabel();
}

function sendProgramChange(prog) {
  currentProgram = Math.max(0, Math.min(127, prog));
  updatePcLabel();
  if (!selectedOutput) return;
  selectedOutput.send([0xc0 | soundChannel, currentProgram]);
  addLogEntry('Prog Chg', 'pc', `ch${soundChannel + 1}  prog ${currentProgram}`);
}

pcPrevBtn.addEventListener('click', () => { sendProgramChange(currentProgram - 1); saveState(); });
pcNextBtn.addEventListener('click', () => { sendProgramChange(currentProgram + 1); saveState(); });

// --- Sound presets ---
const SOUND_KNOB_IDS = ['harmonics','timbre','morph','lpg_colour','decay','pitch_offset'];
export let soundChannel  = 1;
let currentPreset = 0;
export const soundPresets = Array.from({ length: 6 }, () => ({ rhythmEngine: 0, program: 0 }));

let _allKnobs = null;
export function setAllKnobs(knobs) { _allKnobs = knobs; }

function savePreset(slot) {
  for (const id of SOUND_KNOB_IDS) {
    const k = _allKnobs.find(k => k.id === id);
    if (k) soundPresets[slot][id] = k.value;
  }
  const active = document.querySelector('.rhythm-btn.active');
  if (active) soundPresets[slot].rhythmEngine = parseInt(active.dataset.rhythm);
  soundPresets[slot].program = currentProgram;
}

function loadPreset(slot) {
  for (const id of SOUND_KNOB_IDS) {
    const k = _allKnobs.find(k => k.id === id);
    if (k && soundPresets[slot][id] !== undefined) k.setValue(soundPresets[slot][id]);
  }
  const engine = soundPresets[slot].rhythmEngine ?? 0;
  document.querySelectorAll('.rhythm-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.rhythm) === engine));
  if (selectedOutput) {
    selectedOutput.send([0xb0 | soundChannel, 31, engine]);
    addLogEntry('CC', 'cc', `ch${soundChannel}  cc31  val ${engine} (rhythm assign)`);
  }
  const prog = soundPresets[slot].program ?? 0;
  currentProgram = prog;
  updatePcLabel();
  if (selectedOutput) {
    selectedOutput.send([0xc0 | soundChannel, prog]);
    addLogEntry('Prog Chg', 'pc', `ch${soundChannel + 1}  prog ${prog}`);
  }
}

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.preset === 'all') {
      soundChannel = 0;
      for (let i = 0; i < 6; i++) savePreset(i);
      document.querySelectorAll('.preset-btn:not(.preset-btn--all)').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      saveState();
      return;
    }
    const slot = parseInt(btn.dataset.preset);
    savePreset(currentPreset);
    currentPreset = slot;
    soundChannel  = slot + 1;
    loadPreset(slot);
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.toggle('active', b === btn));
    saveState();
  });
});

// --- Rhythm assign buttons ---
document.querySelectorAll('.rhythm-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const value = parseInt(btn.dataset.rhythm);
    document.querySelectorAll('.rhythm-btn').forEach(b => b.classList.toggle('active', b === btn));
    soundPresets[currentPreset].rhythmEngine = value;
    if (!selectedOutput) return;
    selectedOutput.send([0xb0 | soundChannel, 31, value]);
    addLogEntry('CC', 'cc', `ch${soundChannel}  cc31  val ${value} (rhythm assign)`);
    saveState();
  });
});

// --- Load state ---
export function loadSoundState(state) {
  if (!state.soundPresets) return;
  state.soundPresets.forEach((p, i) => {
    if (!soundPresets[i]) return;
    if (p.rhythmEngine !== undefined) soundPresets[i].rhythmEngine = p.rhythmEngine;
    if (p.program      !== undefined) soundPresets[i].program      = p.program;
  });
  const engine = soundPresets[currentPreset].rhythmEngine ?? 0;
  document.querySelectorAll('.rhythm-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.rhythm) === engine));
  currentProgram = soundPresets[currentPreset].program ?? 0;
  updatePcLabel();
}
