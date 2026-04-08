'use strict';

// --- State ---
let midiAccess     = null;
let selectedInput  = null;
let selectedOutput = null;
let midiThru       = true;

// --- DOM refs ---
const statusEl      = document.getElementById('midi-status');
const inSelect      = document.getElementById('midi-in-select');
const outSelect     = document.getElementById('midi-out-select');
const logEl         = document.getElementById('midi-log');
const thruToggle    = document.getElementById('thru-toggle');
const clearBtn      = document.getElementById('clear-btn');
const sendBtn       = document.getElementById('send-btn');
const sendSysex     = document.getElementById('send-sysex');
const fieldSysex    = document.getElementById('field-sysex');
const sendType      = document.getElementById('send-type');
const sendChannel   = document.getElementById('send-channel');
const sendByte1     = document.getElementById('send-byte1');
const sendByte2     = document.getElementById('send-byte2');
const fieldByte2    = document.getElementById('field-byte2');
const pcPrevBtn     = document.getElementById('pc-prev-btn');
const pcNextBtn     = document.getElementById('pc-next-btn');
const pcLabelEl     = document.getElementById('pc-label');
const pcNameEl      = document.getElementById('pc-name');
const octDownBtn    = document.getElementById('oct-down-btn');
const octUpBtn      = document.getElementById('oct-up-btn');
const pianoRangeLbl = document.getElementById('piano-range-label');

// --- MIDI init ---
async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    setStatus('Web MIDI not supported in this browser', false);
    return;
  }
  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    setStatus('MIDI connected', true);
    populateDevices();
    midiAccess.onstatechange = onStateChange;
  } catch (err) {
    setStatus('MIDI access denied', false);
    console.error(err);
  }
}

function setStatus(text, ok) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + (ok ? 'connected' : 'disconnected');
}

// --- Device population ---
function populateDevices() {
  populateSelect(inSelect,  [...midiAccess.inputs.values()],  'in');
  populateSelect(outSelect, [...midiAccess.outputs.values()], 'out');
}

function populateSelect(selectEl, devices, dir) {
  const prevId = selectEl.value;
  selectEl.innerHTML = '';

  if (devices.length === 0) {
    selectEl.appendChild(new Option('-- No devices --', ''));
    selectEl.disabled = true;
    if (dir === 'in')  bindInput(null);
    if (dir === 'out') { selectedOutput = null; updateButtons(); }
    return;
  }

  selectEl.appendChild(new Option('-- Select device --', ''));
  for (const dev of devices) selectEl.appendChild(new Option(dev.name, dev.id));
  selectEl.disabled = false;

  if (prevId && [...selectEl.options].some(o => o.value === prevId)) {
    selectEl.value = prevId;
  }

  // Auto-select Daisy Seed if available, otherwise first device
  if (!selectEl.value) {
    const daisy = devices.find(d => d.name.toLowerCase().includes('daisy'));
    selectEl.value = (daisy ?? devices[0]).id;
  }

  if (dir === 'in')  bindInput(selectEl.value ? midiAccess.inputs.get(selectEl.value)  : null);
  if (dir === 'out') { selectedOutput = selectEl.value ? midiAccess.outputs.get(selectEl.value) : null; updateButtons(); }
}

function onStateChange(e) {
  const { port: { type, state, name } } = e;
  logSystem(`Device ${state}: ${name} (${type})`);
  populateDevices();
}

// --- Input binding ---
function bindInput(port) {
  if (selectedInput) selectedInput.onmidimessage = null;
  selectedInput = port || null;
  if (selectedInput) selectedInput.onmidimessage = onMidiMessage;
}

// --- MIDI message handler ---
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function noteName(n) {
  return NOTE_NAMES[n % 12] + Math.floor(n / 12 - 1);
}

function onMidiMessage(e) {
  const [status, byte1, byte2] = e.data;

  // SysEx
  if (midiThru && selectedOutput) selectedOutput.send(e.data);

  if (status === 0xf0) {
    // strip F0/F7, filter to printable ASCII, trim leading non-text header bytes (e.g. manufacturer ID)
    const text = [...e.data].filter(b => b >= 0x20 && b <= 0x7e).map(b => String.fromCharCode(b)).join('').replace(/^[^a-zA-Z0-9\[{(]+/, '');
    addLogEntry('SysEx', 'sysex', text);
    return;
  }

  const type    = status >> 4;
  const channel = (status & 0x0f) + 1;
  let typeName, dataStr, cssClass;

  switch (type) {
    case 0x9:
      if (byte2 > 0) {
        typeName = 'Note On';  cssClass = 'noteon';
        highlightKey(byte1, true);
      } else {
        typeName = 'Note Off'; cssClass = 'noteoff';
        highlightKey(byte1, false);
      }
      dataStr = `ch${channel}  ${noteName(byte1)} (${byte1})  vel ${byte2}`;
      break;
    case 0x8:
      typeName = 'Note Off'; cssClass = 'noteoff';
      dataStr  = `ch${channel}  ${noteName(byte1)} (${byte1})  vel ${byte2}`;
      highlightKey(byte1, false);
      break;
    case 0xb:
      typeName = 'CC';  cssClass = 'cc';
      dataStr  = `ch${channel}  cc${byte1}  val ${byte2}`;
      break;
    case 0xc:
      typeName = 'Prog Chg'; cssClass = 'pc';
      dataStr  = `ch${channel}  prog ${byte1}`;
      currentProgram = byte1;
      updatePcLabel();
      break;
    case 0xe:
      typeName = 'Pitch Bend'; cssClass = 'other';
      dataStr  = `ch${channel}  val ${((byte2 << 7) | byte1) - 8192}`;
      break;
    case 0xa:
      typeName = 'Aftertouch'; cssClass = 'other';
      dataStr  = `ch${channel}  note ${byte1}  val ${byte2}`;
      break;
    case 0xd:
      typeName = 'Chan Press'; cssClass = 'other';
      dataStr  = `ch${channel}  val ${byte1}`;
      break;
    default:
      typeName = `0x${type.toString(16).toUpperCase()}`; cssClass = 'other';
      dataStr  = [...e.data].map(b => b.toString(16).padStart(2,'0')).join(' ');
  }

  addLogEntry(typeName, cssClass, dataStr);
}

// --- Log ---
function addLogEntry(typeName, cssClass, dataStr) {
  const placeholder = logEl.querySelector('.placeholder');
  if (placeholder) placeholder.remove();

  const now  = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false }) +
               '.' + String(now.getMilliseconds()).padStart(3,'0');

  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML =
    `<span class="log-time">${time}</span>` +
    `<span class="log-type ${cssClass}">${typeName}</span>` +
    `<span class="log-data">${dataStr}</span>`;

  logEl.prepend(entry);
  while (logEl.children.length > 200) logEl.removeChild(logEl.lastChild);
}

function logSystem(msg) { addLogEntry('System', 'other', msg); }

// --- Send MIDI ---
function getChannel() {
  return Math.max(1, Math.min(16, parseInt(sendChannel.value, 10) || 1)) - 1;
}

function buildMessage() {
  const ch = getChannel();
  const b1 = Math.max(0, Math.min(127, parseInt(sendByte1.value, 10) || 0));
  const b2 = Math.max(0, Math.min(127, parseInt(sendByte2.value, 10) || 0));
  switch (sendType.value) {
    case 'noteon':  return [0x90 | ch, b1, b2];
    case 'noteoff': return [0x80 | ch, b1, b2];
    case 'cc':      return [0xb0 | ch, b1, b2];
    case 'pc':      return [0xc0 | ch, b1];
    case 'sysex': {
      const bytes = sendSysex.value.trim().split(/\s+/).map(s => parseInt(s, 16)).filter(n => !isNaN(n));
      if (bytes.length < 2 || bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7) return null;
      return bytes;
    }
    default:        return null;
  }
}

function sendMessage() {
  if (!selectedOutput) return;
  const msg = buildMessage();
  if (!msg) return;
  selectedOutput.send(msg);
  if (sendType.value === 'sysex') {
    const hex = msg.map(b => b.toString(16).padStart(2, '0')).join(' ');
    addLogEntry('SysEx', 'sysex', hex);
  } else {
    onMidiMessage({ data: msg });
  }
}

function updateButtons() {
  const has = !!selectedOutput;
  sendBtn.disabled   = !has;
  pcPrevBtn.disabled = !has;
  pcNextBtn.disabled = !has;
}

// --- Send type UI ---
sendType.addEventListener('change', () => {
  const isPc     = sendType.value === 'pc';
  const isCC     = sendType.value === 'cc';
  const isSysex  = sendType.value === 'sysex';
  fieldByte2.style.display  = (isPc || isSysex) ? 'none' : '';
  document.getElementById('field-byte1').style.display = isSysex ? 'none' : '';
  document.getElementById('field-sysex').style.display = isSysex ? '' : 'none';
  document.querySelector('label[for="send-byte1"]').textContent =
    isCC ? 'CC Number' : isPc ? 'Program' : 'Note';
  document.querySelector('label[for="send-byte2"]').textContent =
    isCC ? 'Value' : 'Velocity';
});

// --- Piano keyboard ---
const PIANO_OCTAVES = 3;
const BLACK_NOTES   = new Set([1, 3, 6, 8, 10]);
const WHITE_KEY_W   = 32;   // px — matches CSS --white-key-w
const BLACK_KEY_W   = 20;   // px — matches CSS --black-key-w
const OCT_MIN       = 12;   // C0
const OCT_MAX       = 84;   // C6

// Computer keyboard → semitone offset from pianoStartNote
// Home row = lower octave, upper row = upper octave (standard DAW layout)
const KEY_MAP = new Map([
  // Lower octave  (home row)
  ['KeyA', 0],  ['KeyW', 1],  ['KeyS', 2],  ['KeyE', 3],
  ['KeyD', 4],  ['KeyF', 5],  ['KeyT', 6],  ['KeyG', 7],
  ['KeyY', 8],  ['KeyH', 9],  ['KeyU', 10], ['KeyJ', 11],
  // Upper octave  (upper row + numbers)
  ['KeyK', 12], ['KeyO', 13], ['KeyL', 14], ['KeyP', 15],
  ['Semicolon', 16], ['Quote', 17],
]);

// Which keys show a hint on white keys (semitone → display char)
const KEY_HINTS = new Map([
  [0,'A'], [2,'S'], [4,'D'], [5,'F'], [7,'G'], [9,'H'], [11,'J'],
  [12,'K'], [14,'L'], [16,';'],
]);

let pianoStartNote = 48; // C3
// Polyphonic active notes: Map<note, 'mouse' | keyCode>
const activeNotes  = new Map();
let mouseHeldNote  = null;

function buildPiano() {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';

  const start = pianoStartNote;
  const end   = start + PIANO_OCTAVES * 12;

  // Build white key list for positioning
  const whiteNotes = [];
  for (let n = start; n < end; n++) {
    if (!BLACK_NOTES.has(n % 12)) whiteNotes.push(n);
  }

  // White keys
  for (const note of whiteNotes) {
    const key = document.createElement('div');
    key.className = 'key white';
    key.dataset.note = note;

    // C label at bottom
    if (note % 12 === 0) {
      const lbl = document.createElement('span');
      lbl.className = 'key-label';
      lbl.textContent = noteName(note);
      key.appendChild(lbl);
    }

    // Keyboard hint at top
    const offset = note - start;
    if (KEY_HINTS.has(offset)) {
      const hint = document.createElement('span');
      hint.className = 'key-kbd';
      hint.textContent = KEY_HINTS.get(offset);
      key.appendChild(hint);
    }

    addKeyListeners(key);
    piano.appendChild(key);
  }

  // Black keys
  for (let n = start; n < end; n++) {
    if (!BLACK_NOTES.has(n % 12)) continue;
    const leftWhiteIdx = whiteNotes.indexOf(n - 1);
    if (leftWhiteIdx === -1) continue;

    const key = document.createElement('div');
    key.className = 'key black';
    key.dataset.note = n;
    key.style.left = `${(leftWhiteIdx + 1) * WHITE_KEY_W - BLACK_KEY_W / 2}px`;
    addKeyListeners(key);
    piano.appendChild(key);
  }

  pianoRangeLbl.textContent = `${noteName(start)} – ${noteName(end - 1)}`;
  octDownBtn.disabled = start <= OCT_MIN;
  octUpBtn.disabled   = start >= OCT_MAX;
}

function addKeyListeners(key) {
  key.addEventListener('mousedown', e => {
    e.preventDefault();
    const note = parseInt(key.dataset.note);
    if (mouseHeldNote !== null && mouseHeldNote !== note) noteOff(mouseHeldNote, 'mouse');
    mouseHeldNote = note;
    noteOn(note, 'mouse');
  });
  key.addEventListener('touchstart', e => {
    e.preventDefault();
    noteOn(parseInt(key.dataset.note), 'touch');
  }, { passive: false });
  key.addEventListener('touchend', e => {
    e.preventDefault();
    noteOff(parseInt(key.dataset.note), 'touch');
  }, { passive: false });
  key.addEventListener('touchcancel', e => {
    e.preventDefault();
    noteOff(parseInt(key.dataset.note), 'touch');
  }, { passive: false });
}

document.addEventListener('mouseup', () => {
  if (mouseHeldNote !== null) {
    noteOff(mouseHeldNote, 'mouse');
    mouseHeldNote = null;
  }
});

// --- Keyboard playback ---
document.addEventListener('keydown', e => {
  if (e.repeat) return;
  // Block only when the user is actively typing in a number/text input
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  const offset = KEY_MAP.get(e.code);
  if (offset === undefined) return;
  e.preventDefault(); // stop browser shortcuts (S = page save, etc.)
  const note = pianoStartNote + offset;
  if (note < 0 || note > 127) return;
  noteOn(note, e.code);
});

document.addEventListener('keyup', e => {
  const offset = KEY_MAP.get(e.code);
  if (offset === undefined) return;
  e.preventDefault();
  noteOff(pianoStartNote + offset, e.code);
});

// --- Note on/off (polyphonic) ---
function noteOn(note, _source) {
  if (activeNotes.has(note)) return;
  activeNotes.set(note, _source);
  highlightKey(note, true);
  if (!selectedOutput) return;
  const ch = getChannel();
  selectedOutput.send([0x90 | ch, note, 100]);
  addLogEntry('Note On', 'noteon', `ch${ch + 1}  ${noteName(note)} (${note})  vel 100`);
}

function noteOff(note, _source) {
  if (!activeNotes.has(note)) return;
  activeNotes.delete(note);
  highlightKey(note, false);
  if (!selectedOutput) return;
  const ch = getChannel();
  selectedOutput.send([0x80 | ch, note, 0]);
  addLogEntry('Note Off', 'noteoff', `ch${ch + 1}  ${noteName(note)} (${note})  vel 0`);
}

function releaseAllNotes() {
  for (const note of [...activeNotes.keys()]) noteOff(note, activeNotes.get(note));
  mouseHeldNote = null;
}

function highlightKey(note, on) {
  const key = document.querySelector(`.key[data-note="${note}"]`);
  if (key) key.classList.toggle('active', on);
}

// Octave shift
octDownBtn.addEventListener('click', () => {
  releaseAllNotes();
  pianoStartNote = Math.max(OCT_MIN, pianoStartNote - 12);
  buildPiano();
});

octUpBtn.addEventListener('click', () => {
  releaseAllNotes();
  pianoStartNote = Math.min(OCT_MAX, pianoStartNote + 12);
  buildPiano();
});

// --- Program Change ---
const PROGRAM_NAMES = [
  'Virtual Analog VCF', // 0
  'Phase Distortion',   // 1
  '6-Op FM I',          // 2
  '6-Op FM II',         // 3
  '6-Op FM III',        // 4
  'Wave Terrain',       // 5
  'String Machine',     // 6
  'Chiptune',           // 7
  'Virtual Analog',     // 8
  'Waveshaping',        // 9
  'FM',                 // 10
  'Grain',              // 11
  'Additive',           // 12
  'Wavetable',          // 13
  'Chord',              // 14
  'Speech',             // 15
  'Swarm',              // 16
  'Noise',              // 17
  'Particle',           // 18
  'String',             // 19
  'Modal',              // 20
  'Bass Drum',          // 21
  'Snare Drum',         // 22
  'Hi-Hat',             // 23
];

let currentProgram = 0;

function updatePcLabel() {
  pcLabelEl.textContent = currentProgram + 1;
  pcNameEl.textContent  = PROGRAM_NAMES[currentProgram] ?? '';
}

function sendProgramChange(prog) {
  currentProgram = Math.max(0, Math.min(127, prog));
  updatePcLabel();
  if (!selectedOutput) return;
  const ch = getChannel();
  selectedOutput.send([0xc0 | ch, currentProgram]);
  addLogEntry('Prog Chg', 'pc', `ch${ch + 1}  prog ${currentProgram}`);
}

pcPrevBtn.addEventListener('click', () => sendProgramChange(currentProgram - 1));
pcNextBtn.addEventListener('click', () => sendProgramChange(currentProgram + 1));

// --- Event listeners ---
inSelect.addEventListener('change', () => {
  bindInput(inSelect.value ? midiAccess.inputs.get(inSelect.value) : null);
  inSelect.blur();
});

outSelect.addEventListener('change', () => {
  selectedOutput = outSelect.value ? midiAccess.outputs.get(outSelect.value) : null;
  updateButtons();
  outSelect.blur();
});

thruToggle.addEventListener('change', () => {
  midiThru = thruToggle.checked;
});

clearBtn.addEventListener('click', () => {
  logEl.innerHTML = '<p class="placeholder">Waiting for MIDI messages...</p>';
});

sendBtn.addEventListener('click', sendMessage);

[sendChannel, sendByte1, sendByte2].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
});

// --- Boot ---
buildPiano();
initMidi();
