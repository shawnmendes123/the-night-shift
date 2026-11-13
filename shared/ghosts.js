// The five things that still work nights here. One is drawn at random each shift and nobody is told which.
// Players work it out from how she hunts, what she says and what the staff left behind.
// Numbers multiply the difficulty settings in config.js; everything else is story.

export const KINDS = ['mother', 'blind', 'matron', 'surgeon', 'mimic'];

export const GHOSTS = {
  // The original: hunts by sight and sound, stalks, cuts the power now and then.
  mother: {
    title: 'The Mother', sight: 1, hear: 1, walk: 1, chase: 1, notice: 1, stalk: 1, trips: 0,
    first: ['Ilse', 'Edda', 'Nora', 'Ruth', 'Agnes', 'Mabel'], prefix: '',
    item: { name: 'Old doll', mesh: 'doll', at: [13.3, 7.2, 0.5] },
  },
  // Bandaged after surgery that went wrong. Cannot see you at all. Hears twice as far and rushes every sound.
  blind: {
    title: 'The Blind Patient', sight: 0, touch: 1.3, hear: 1.9, walk: 0.95, chase: 0.95, notice: 0.6, stalk: 0, trips: 0, rush: true, listen: 1.35,
    first: ['Lottie', 'Vera', 'Iris', 'Hettie', 'Clara'], prefix: '',
    item: { name: 'Glass eye', mesh: 'eye', at: [26, 5, 0.95] },
  },
  // The head nurse who ordered Room 3 ignored. Hunts torchlight, keeps the lights off, speaks over the intercom.
  matron: {
    title: 'The Matron', sight: 1, torch: 1.6, dark: 0.45, hear: 0.85, walk: 1.05, chase: 1, notice: 0.9, stalk: 0.6, trips: 2, tripBias: 3, pa: [38, 70],
    first: ['Agatha', 'Muriel', 'Winifred', 'Dorothy', 'Edith'], prefix: 'Matron',
    item: { name: "Matron's fob watch", mesh: 'watch', at: [38.5, 8.9, 0.84] },
  },
  // Never runs and never loses you. You cannot outrun him, only break his line of sight and hide. He checks every spot in the room.
  surgeon: {
    title: 'The Surgeon', sight: 0.95, hear: 1, walk: 0.85, chaseAbs: 3.3, notice: 1.5, stalk: 0, trips: 0, relentless: true, searchAll: true,
    first: ['Arthur', 'Edmund', 'Victor', 'Lionel', 'Harold'], prefix: 'Mr', male: true,
    item: { name: 'Wedding ring', mesh: 'ring', at: [21.5, 29.3, 0.84] },
  },
  // Wears whoever it took last. Copies your teammates' voices from rooms they are not in, and stands in the dark looking like one of you.
  mimic: {
    title: 'The Mimic', sight: 0.85, hear: 1.1, walk: 1, chase: 1.02, notice: 1, stalk: 0.4, trips: 0, lure: [26, 46],
    first: ['Jean', 'Maud', 'Sybil', 'Peggy', 'Ada'], prefix: 'Nurse',
    item: { name: 'Staff name badge', mesh: 'badge', at: [14.55, 7, 0.84] },
  },
};

export const fullName = (g) => `${g.prefix ? g.prefix + ' ' : ''}${g.first} ${g.last}`;

// Paperwork around the hospital. `all` is true in the All of them mode, where every one is here at once.
export function clueText(id, g, all, everyone) {
  const N = g.last.toUpperCase();
  if (all && id === 'clue_file') {
    return {
      title: 'Night register, records office',
      body: '14 NOV - UNRESOLVED\n' + everyone.map((e) => `${e.last.toUpperCase()} - ${{ mother: 'Rm 3, maternity. Died 03:12.', blind: 'Ward A, post-op, both eyes.', matron: 'Matron. Last seen at the breaker.', surgeon: 'Consultant surgeon. Theatre, 03:12.', mimic: 'Staff nurse. Missing. Badge found.' }[e.kind]}`).join('\n') + '\nAll held in the morgue. Belongings withheld.',
      short: 'Five names in the night register. All five are in the morgue, and all five want something back.',
    };
  }
  if (all && (id === 'clue_log' || id === 'clue_orders')) {
    return id === 'clue_log'
      ? { title: "Night log, nurses' station", body: '14 Nov - 02:40\nRoom 3 ringing again. Ward A asking us to walk quieter.\nMatron doing her rounds. Theatre light on. Nobody in theatre.\nSomeone keeps calling my name from the stairs.', short: 'The whole hospital was restless that night.' }
      : { title: 'Standing orders, treatment room', body: 'ALL STAFF\nBelongings of the deceased stay locked away.\nDo not answer anyone you cannot see.\nLights out after midnight.', short: 'Their belongings were locked away. Do not answer anyone you cannot see.' };
  }
  const T = {
    mother: {
      clue_log: ['14 Nov - 02:40\nRoom 3 has rung all night again. Matron says leave it.\nShe never asks for anything but the doll.', 'The patient in Room 3 kept calling for a doll.'],
      clue_orders: ['ROOM 3 - sedate when she asks for the child.\nDo NOT answer the call light after midnight.\nBelongings to stay locked away.', 'Staff were ordered to ignore Room 3 and keep her belongings locked away.'],
      clue_file: [`${N}, ${g.first} - Room 3\nInfant: stillborn. Patient not to be informed.\nDeceased 14 Nov, 03:12. Body unclaimed - held in morgue.`, `Room 3 was ${g.first} ${g.last}. She died at 03:12; her body is still in the morgue.`],
      tag: ['"for my girl"\nProperty of patient, Rm 3 - WITHHELD', 'The doll in the ward cot belonged to the patient in Room 3.'],
      item: 'Wrist tag tied to the doll',
    },
    blind: {
      clue_log: ['14 Nov - 02:40\nWard A again: "please stop walking so loud".\nShe hears us from the corridor. She hears the lift.\nBandages still on. Do NOT run past her bed.', 'Someone on Ward A could hear every footstep from the corridor.'],
      clue_orders: ['WARD A, POST-OP\nNo lights needed. Speak softly. Do not run.\nPatient\'s glass eye to be kept in theatre until review.', 'A Ward A patient lost her sight. Her glass eye was kept in the Treatment Room.'],
      clue_file: [`${N}, ${g.first} - Ward A\nSurgery: both eyes. Complications.\nDeceased 14 Nov, 03:12. Body unclaimed - held in morgue.`, `The patient was ${g.first} ${g.last}. Blinded in surgery, died at 03:12; her body is in the morgue.`],
      tag: [`Specimen jar, theatre\nPROSTHESIS - ${N}\n"she keeps asking where it went"`, 'The glass eye in the Treatment Room belonged to the blind patient.'],
      item: 'Label on the specimen jar',
    },
    matron: {
      clue_log: ['14 Nov - 02:40\nMatron turned the ward lights off again. "Lights out after midnight."\nShe can see a torch from the far end of the corridor.\nKeep your torch DOWN.', 'Matron hated lights after midnight and could spot a torch from anywhere.'],
      clue_orders: [`BY ORDER OF MATRON ${N}\nLights out after midnight. No exceptions.\nThe breaker is mine. Room 3 is not to be answered.`, 'Matron ran the night shift, ordered the lights out and Room 3 ignored.'],
      clue_file: [`${N}, ${g.first} - Matron, nights\nCollapsed at the Storage breaker, 03:12.\nBody unclaimed - held in morgue. Personal effects in Storage.`, `The matron was ${g.first} ${g.last}. She died at the breaker at 03:12; her body is in the morgue.`],
      tag: [`Engraved on the back:\n"${g.first.toUpperCase()} - 30 YEARS OF NIGHTS"`, "The fob watch in Storage belonged to the matron."],
      item: 'Engraving on the fob watch',
    },
    surgeon: {
      clue_log: ['14 Nov - 02:40\nTheatre light on again. Nobody booked.\nHe doesn\'t hurry. He never has to.\nIf he sees you, HIDE. Do not try to run.', 'Something walks the halls slowly and never stops following.'],
      clue_orders: [`THEATRE - MR ${N}\nAll instruments counted in and counted out.\nHe checks every bed. Every cupboard. Every time.`, 'The surgeon counted everything and checked every hiding place.'],
      clue_file: [`${N}, ${g.first} - Consultant surgeon\nOperated through the power cut, 03:12. Patient lost.\nFound in the boiler room. Body unclaimed - held in morgue.`, `The surgeon was ${g.first} ${g.last}. He died after the 03:12 operation; his body is in the morgue.`],
      tag: [`Inside the band:\n"${g.first.toUpperCase()} - ALWAYS"`, 'The wedding ring in the boiler room belonged to the surgeon.'],
      item: 'Inscription inside the ring',
    },
    mimic: {
      clue_log: ["14 Nov - 02:40\nHeard Jean call me from the stairs. Jean was at the desk with me.\nIf you hear one of us somewhere we shouldn't be - don't go.\nThere was a nurse standing in Ward A. We were all here.", 'Staff kept hearing each other call from rooms they were not in.'],
      clue_orders: ['ALL STAFF\nDo not answer anyone you cannot see.\nCount heads at the desk. If there is one too many, leave.\nCheck the floor plan before you go to anyone.', 'Something here copies staff voices. Check where your team really is.'],
      clue_file: [`${N}, ${g.first} - Staff nurse, nights\nReported missing 14 Nov. Badge found in Room 3.\nBody recovered 03:12 - held in morgue. Still signing in.`, `A nurse, ${g.first} ${g.last}, went missing. Her body is in the morgue, but something still wears her.`],
      tag: [`STAFF NURSE\n${g.first.toUpperCase()} ${N}\nNIGHTS`, 'The name badge in Room 3 belonged to the missing nurse.'],
      item: 'The name badge',
    },
  }[g.kind];
  if (id === 'call') return { title: 'Call panel, Room 3', body: 'BED 3 - CALL ACTIVE\nFirst raised 03:12 - 14 NOV\nNever answered.', short: 'The Room 3 call light has been ringing, unanswered, since 03:12.' };
  if (id === 'clue_log') return { title: "Night log, nurses' station", body: T.clue_log[0], short: T.clue_log[1] };
  if (id === 'clue_orders') return { title: 'Standing orders, treatment room', body: T.clue_orders[0], short: T.clue_orders[1] };
  if (id === 'clue_file') return { title: 'Admission file, records office', body: T.clue_file[0], short: T.clue_file[1] };
  // a belonging's tag; in All of them it names its owner outright
  return { title: T.item, body: all ? T.tag[0] + `\nBELONGS TO: ${N}` : T.tag[0], short: T.tag[1] };
}

// The objective lines on the clipboard, built from what has been found.
export function hints(g, has, all, rested) {
  if (all) {
    const L = [['Five of them are working tonight. Find what each one lost and lay it in their drawer.', 0]];
    if (has('clue_file')) L.push(['The night register names all five. Their bodies are in the morgue.', 0]);
    L.push([`Laid to rest: ${rested} of 5.`, rested > 0 ? 1 : 0]);
    return L;
  }
  const L = [['Find out who is still here tonight - and what they want back.', 0]];
  const want = { mother: 'She keeps asking for a doll.', blind: 'She lost her eyes in surgery. She hears everything.', matron: 'Matron wants the lights out. Keep your torch down.', surgeon: 'He never stops following. Hide; do not run.', mimic: 'Something here copies voices. Check the floor plan before you go to anyone.' }[g.kind];
  if (has('clue_log') || has('clue_orders')) L.push([want, 0]);
  if (has('clue_file')) L.push(['The name is in the admission file. The body is in the morgue.', 0]);
  if (has('relic')) L.push([`Bring the ${GHOSTS[g.kind].item.name.toLowerCase()} to the morgue.`, 1]);
  return L;
}

export function epitaph(g, win, solved) {
  const n = fullName(g);
  if (win && solved) return {
    mother: `In the morgue, ${n} lies with the doll that was kept from her.`,
    blind: `${n} has her eye back. The ward is quiet enough to hear it.`,
    matron: `${n}'s watch has stopped at 03:12. The lights are staying on.`,
    surgeon: `${n} has his ring. The theatre light is finally off.`,
    mimic: `${n}'s badge is back where it belongs. The voice on the stairs has stopped.`,
  }[g.kind];
  if (solved) return `${n} had what was taken, but the ward kept the staff.`;
  return `Nobody found out who was working the night shift. It was ${n}.`;
}
