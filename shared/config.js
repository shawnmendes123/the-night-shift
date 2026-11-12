// Difficulty tuning. The ghost's rules are identical on every difficulty; only these numbers change.
export const DIFF = {
  easy:    { label: 'Easy',    quota: 3, time: 26 * 60, grace: 75, walk: 1.5, chase: 3.9,  sight: 12, hear: 0.8,  searchSpots: 1, listen: 2.8, rescue: 6,   breath: 9,   jammed: 0,    stalk: 0.7,  special: [38, 65], lose: 3.5, notice: 1.4,  trips: 1 },
  medium:  { label: 'Medium',  quota: 4, time: 23 * 60, grace: 55, walk: 1.7, chase: 4.2,  sight: 14, hear: 1.0,  searchSpots: 2, listen: 2.4, rescue: 4.5, breath: 7.5, jammed: 0.15, stalk: 0.5,  special: [28, 50], lose: 4.5, notice: 1.1,  trips: 1 },
  hard:    { label: 'Hard',    quota: 5, time: 20 * 60, grace: 40, walk: 1.9, chase: 4.5,  sight: 15, hear: 1.15, searchSpots: 3, listen: 2.0, rescue: 3,   breath: 6,   jammed: 0.3,  stalk: 0.35, special: [20, 38], lose: 5.5, notice: 0.9,  trips: 2 },
  extreme: { label: 'Extreme', quota: 6, time: 18 * 60, grace: 25, walk: 2.1, chase: 4.75, sight: 16, hear: 1.3,  searchSpots: 4, listen: 1.7, rescue: 2,   breath: 5,   jammed: 0.4,  stalk: 0.2,  special: [14, 28], lose: 7,   notice: 0.75, trips: 3 },
};
export const SPEED = { crouch: 1.4, walk: 2.7, run: 5.2 };
export const STAMINA = { max: 6, regen: 0.6 };
// How far each kind of noise carries (metres, before walls and difficulty).
export const LOUD = { run: 11, walk: 4, door: 5, drop: 6, bottleDrop: 8, shatter: 18, work: 9, breaker: 20, gasp: 9, call: 10, hide: 3, wrong: 60, pickup: 2 };
export const MAX_PLAYERS = 5;
export const REACH = 2.1;
