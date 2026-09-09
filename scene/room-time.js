/* A civil-time lighting cycle, not a geolocated sunrise or weather simulation.
 * All clocks and light share one visitor-local Date snapshot. */
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function getRoomTime(date = new Date(), mode = 'auto') {
  if (!Number.isFinite(date.getTime())) throw new TypeError('A valid local Date is required');
  const hour = date.getHours(), minute = date.getMinutes();
  const localHour = hour + minute / 60;
  const lightHour = mode === 'day' ? 12 : mode === 'night' ? 23 : localHour;
  const daylight = smooth(6, 8, lightHour) * (1 - smooth(17, 20, lightHour));
  const midday = Math.max(0, Math.sin(Math.PI * clamp((lightHour - 6) / 14)));
  const warmth = daylight * (1 - midday);
  const phase = daylight < .02 ? 'night' : lightHour < 10 ? 'morning' : lightHour < 17 ? 'day' : 'evening';
  // Return the sun smoothly overnight, including across local midnight.
  const progress = lightHour >= 6 && lightHour <= 20 ? (lightHour - 6) / 14
    : 1 - smooth(0, 10, lightHour > 20 ? lightHour - 20 : lightHour + 4);
  return {
    mode, phase, daylight, warmth,
    minuteKey: [date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, date.getTimezoneOffset()].join(':'),
    label: String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0'),
    dateTime: date.toISOString(),
    hourAngle: -Math.PI * 2 * ((hour % 12) + minute / 60) / 12,
    minuteAngle: -Math.PI * 2 * minute / 60,
    sunIntensity: mix(.035, 3.15, daylight),
    hemisphereIntensity: mix(.43, 1.50, daylight),
    ambientIntensity: mix(.23, .66, daylight),
    fillIntensity: mix(.30, .88, daylight),
    lampIntensity: mix(21, 3, daylight),
    exposure: mix(.98, 1.08, daylight),
    // Every direction still enters through the same rear window opening.
    sunPosition: [-4.55 - (1.6 + 2.2 * progress) * 2.8, 4.03 + (.8 + 2.4 * midday) * 2.8, -1.3 - 5 * 2.8],
    sunTarget: [-4.55 + 1.6 + 2.2 * progress, 4.03 - (.8 + 2.4 * midday), 3.7],
    windowGlow: mix(.025, .38, daylight),
    softwareGain: mix(.59, 1.08, daylight),
    softwareTint: [1, mix(.88, .98, daylight), mix(.77, .95, daylight)],
  };
}

export function updateRoomClock(clock, time) {
  clock.hour.rotation.z = time.hourAngle;
  clock.minute.rotation.z = time.minuteAngle;
  clock.group.userData.localTime = time.label;
}
