/** One actual Japan-time snapshot drives both the clock and the garden's civil
 * day/night cycle. Lighting previews never replace the actual clock time.
 * This is a presentation cycle, not an astronomical sunrise calculation. */
export const WORLD_TIME_ZONE = 'Asia/Tokyo';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: WORLD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (start, end, value) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const channels = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
function mixColor(a, b, t) {
  const first = channels(a), second = channels(b);
  return '#' + first.map((value, index) => Math.round(mix(value, second[index], t)).toString(16).padStart(2, '0')).join('');
}
const SKY = [
  { offset: 0, night: '#111e32', day: '#91adb5', dawn: '#526985', dusk: '#485873' },
  { offset: .43, night: '#293d54', day: '#cfdbd7', dawn: '#d3a090', dusk: '#c48b82' },
  { offset: .51, night: '#526271', day: '#eee9da', dawn: '#f4c397', dusk: '#e6ae80' },
  { offset: .65, night: '#303e3e', day: '#8f9b7c', dawn: '#9a9478', dusk: '#827866' },
  { offset: 1, night: '#202b30', day: '#596449', dawn: '#535c49', dusk: '#4d5146' },
];

export function getWorldTime(date = new Date(), mode = 'auto') {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('A valid Date is required for Japan time.');
  if (!['auto', 'day', 'night'].includes(mode)) throw new RangeError('Lighting mode must be auto, day or night.');
  const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const hour = Number(parts.hour), minute = Number(parts.minute), second = Number(parts.second), millisecond = date.getUTCMilliseconds();
  const dateISO = `${parts.year}-${parts.month}-${parts.day}`, label = `${parts.hour}:${parts.minute}`;
  const minuteKey = `${dateISO}T${label}+09:00`, secondKey = `${dateISO}T${label}:${parts.second}+09:00`;
  const secondsSinceMidnight = hour * 3600 + minute * 60 + second + millisecond / 1000;
  const actualHour = secondsSinceMidnight / 3600, lightHour = mode === 'day' ? 12 : mode === 'night' ? 23 : actualHour;
  const daylight = smooth(5.5, 7.5, lightHour) * (1 - smooth(16.5, 19, lightHour));
  const nightMix = 1 - daylight;
  const dawn = smooth(5, 6, lightHour) * (1 - smooth(7, 8.5, lightHour));
  const dusk = smooth(15.5, 17.25, lightHour) * (1 - smooth(18.25, 19.5, lightHour));
  const phase = daylight < .02 && dawn < .05 && dusk < .05 ? 'night' : dawn > .05 ? 'dawn' : dusk > .05 ? 'dusk' : 'day';
  const clockAngles = {
    hour: -Math.PI * 2 * ((hour % 12) + minute / 60 + (second + millisecond / 1000) / 3600) / 12,
    minute: -Math.PI * 2 * (minute + (second + millisecond / 1000) / 60) / 60,
    second: -Math.PI * 2 * (second + millisecond / 1000) / 60,
  };
  const skyStops = SKY.map(({ offset, night, day, dawn: dawnColor, dusk: duskColor }) => ({
    offset, color: mixColor(mixColor(mixColor(night, day, daylight), dawnColor, dawn * .78), duskColor, dusk * .82),
  }));
  let sunColor = mixColor('#b8cee8', '#ffe4bd', daylight);
  sunColor = mixColor(sunColor, '#ffc18c', dawn * .5);
  sunColor = mixColor(sunColor, '#ffb47c', dusk * .55);
  return {
    timeZone: WORLD_TIME_ZONE, timeZoneLabel: '日本時間', mode, dateISO, label,
    dateTime: date.toISOString(), zonedDateTime: secondKey, unixMs: date.getTime(),
    hour, minute, second, millisecond, secondsSinceMidnight, actualHour,
    minuteKey, secondKey, clockKey: secondKey,
    // The host can update the clock each second and refresh the environment at
    // minute boundaries, including immediately after a hidden tab resumes.
    lightingKey: mode === 'auto' ? `auto:${Math.floor(date.getTime() / 60000)}` : mode,
    clockAngles, hourAngle: clockAngles.hour, minuteAngle: clockAngles.minute, secondAngle: clockAngles.second,
    phase, daylight, nightMix, dawn, dusk,
    // Keep the proven full-garden shadow frustum fixed while the light changes.
    sun: { intensity: mix(.55, 2.6, daylight), color: sunColor, position: [-38, 55, -12], target: [0, 0, 35] },
    hemisphere: { intensity: mix(.72, 1.15, daylight), skyColor: mixColor('#a0b8d5', '#e1eee9', daylight), groundColor: mixColor('#625d51', '#7a6b50', daylight) },
    ambientIntensity: mix(.32, .30, daylight), ambientColor: mixColor('#c5d0df', '#eee2ca', daylight),
    environmentIntensity: mix(.30, .45, daylight), backgroundIntensity: 1,
    exposure: mix(1.16, 1.12, daylight), roomFillIntensity: mix(3.3, 2.3, daylight),
    windowLightIntensity: mix(.24, .65, daylight), deskLampIntensity: mix(.70, .4536, daylight),
    skyStops, fogColor: mixColor(mixColor('#3c4d61', '#dce0d1', daylight), '#b89c86', dusk * .35),
  };
}
