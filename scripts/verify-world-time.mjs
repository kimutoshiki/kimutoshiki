import assert from 'node:assert/strict';
import { getWorldTime, WORLD_TIME_ZONE } from '../scene/world-time.js';
import { updateRoomClock } from '../scene/room-time.js';

const near = (a,b,tolerance=1e-10) => assert.ok(Math.abs(a-b)<=tolerance, `${a} differs from ${b}`);
const at = (hour,minute=0,second=0,millisecond=0) => new Date(Date.UTC(2026,10,6,hour-9,minute,second,millisecond));
const circularDifference = (a,b) => Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));
const rgb = color => [1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255);
assert.equal(WORLD_TIME_ZONE,'Asia/Tokyo');
for(const [utc,label,dateISO] of [
  ['2026-11-05T15:00:00Z','00:00','2026-11-06'],
  ['2026-11-05T21:00:00Z','06:00','2026-11-06'],
  ['2026-11-06T03:00:00Z','12:00','2026-11-06'],
  ['2026-11-06T09:00:00Z','18:00','2026-11-06'],
  ['2026-11-06T14:00:00Z','23:00','2026-11-06'],
  ['2026-12-31T15:00:00Z','00:00','2027-01-01'],
  ['2028-02-28T15:00:00Z','00:00','2028-02-29'],
]) {
  const time=getWorldTime(new Date(utc));
  assert.equal(time.label,label);assert.equal(time.dateISO,dateISO);
  assert.equal(time.dateTime,new Date(utc).toISOString());assert.equal(time.timeZone,'Asia/Tokyo');
  assert.equal(time.zonedDateTime,`${dateISO}T${label}:00+09:00`);
  assert.equal(new Date(time.zonedDateTime).getTime(),new Date(utc).getTime());
  assert.equal(time.mode,'auto','Actual Japan time controls lighting by default');
}
const previousTZ=process.env.TZ;
try {
  const instant=new Date('2026-11-01T05:30:00Z'), reference=getWorldTime(instant);
  for(const hostZone of ['UTC','Asia/Tokyo','America/New_York','Pacific/Honolulu','Europe/London']) {
    process.env.TZ=hostZone;
    assert.deepEqual(getWorldTime(instant),reference,'Japan clock and sky never depend on host or visitor time zone: '+hostZone);
  }
  // New York repeats 01:30 as DST ends; Tokyo progresses normally by one hour.
  process.env.TZ='America/New_York';
  const before=getWorldTime(new Date('2026-11-01T05:30:00Z')), after=getWorldTime(new Date('2026-11-01T06:30:00Z'));
  assert.equal(before.label,'14:30');assert.equal(after.label,'15:30');assert.notEqual(before.minuteKey,after.minuteKey);
} finally { if(previousTZ===undefined)delete process.env.TZ;else process.env.TZ=previousTZ; }

near(getWorldTime(at(3)).clockAngles.hour,-Math.PI/2);
near(getWorldTime(at(6,30)).clockAngles.hour,-13*Math.PI/12);
near(getWorldTime(at(6,30)).clockAngles.minute,-Math.PI);
const precise=getWorldTime(at(13,15,30,500));
near(precise.clockAngles.hour,-2*Math.PI*(3600+15*60+30.5)/43200);
near(precise.clockAngles.minute,-2*Math.PI*(15*60+30.5)/3600);
near(precise.clockAngles.second,-2*Math.PI*30.5/60);
const hourZeroDirection={x:Math.sin(-getWorldTime(at(3)).hourAngle),y:Math.cos(getWorldTime(at(3)).hourAngle)};
near(hourZeroDirection.x,1);near(hourZeroDirection.y,0); // Authored hands begin pointing up (+Y); 03:00 points right.
const clock={hour:{rotation:{z:0}},minute:{rotation:{z:0}},group:{userData:{}}};
updateRoomClock(clock,precise);near(clock.hour.rotation.z,precise.clockAngles.hour);near(clock.minute.rotation.z,precise.clockAngles.minute);assert.equal(clock.group.userData.localTime,'13:15');
for(const mode of ['auto','day','night']) {
  const actual=getWorldTime(at(22,37,42),mode);
  assert.equal(actual.label,'22:37');near(actual.hourAngle,-2*Math.PI*(10+37/60+42/3600)/12);
  near(actual.minuteAngle,-2*Math.PI*(37+42/60)/60);assert.equal(actual.secondKey,'2026-11-06T22:37:42+09:00');
}
const night=getWorldTime(at(0)), dawn=getWorldTime(at(6)), noon=getWorldTime(at(12)), dusk=getWorldTime(at(18));
assert.equal(night.phase,'night');assert.equal(dawn.phase,'dawn');assert.equal(noon.phase,'day');assert.equal(dusk.phase,'dusk');
assert.equal(night.nightMix,1);assert.equal(noon.nightMix,0);
assert.ok(dawn.daylight>0&&dawn.daylight<1&&dusk.daylight>0&&dusk.daylight<1);
assert.ok(rgb(night.skyStops[0].color)[2]>rgb(night.skyStops[0].color)[0]*2,'Night sky is visibly blue rather than daytime cyan');
assert.ok(rgb(dusk.skyStops[2].color)[0]>rgb(dusk.skyStops[2].color)[2]*1.3,'Evening horizon carries warm light');
assert.notDeepEqual(night.skyStops,noon.skyStops,'Time changes the actual sky gradient, not only the exposure');
assert.ok(noon.sun.intensity>night.sun.intensity*4,'Daytime directional illumination is distinct from night');
for(const mode of ['day','night'])for(const hour of [0,6,12,18,23]) {
  const actual=getWorldTime(at(hour,37),mode), reference=getWorldTime(at(mode==='day'?12:23),mode);
  for(const key of ['skyStops','sun','hemisphere','ambientIntensity','ambientColor','environmentIntensity','backgroundIntensity','exposure','roomFillIntensity','windowLightIntensity','deskLampIntensity','daylight','nightMix','dawn','dusk','phase','fogColor']) {
    assert.deepEqual(actual[key],reference[key],'Manual '+mode+' preview has a consistent lighting preset: '+key);
  }
  assert.equal(actual.label,String(hour).padStart(2,'0')+':37','Preview preserves actual Japan clock');
}

const scalarKeys=['daylight','nightMix','dawn','dusk','ambientIntensity','environmentIntensity','backgroundIntensity','exposure','roomFillIntensity','windowLightIntensity','deskLampIntensity'];
const day=Array.from({length:1441},(_,minute)=>getWorldTime(at(0,minute)));
let maximumDaylightChange=0,maximumSkyChannelChange=0;
for(let minute=0;minute<1440;minute++) {
  const current=day[minute],next=day[minute+1];
  for(const key of scalarKeys)assert.ok(Number.isFinite(current[key]),'Finite lighting parameter: '+key);
  for(const key of ['daylight','nightMix','dawn','dusk'])assert.ok(current[key]>=0&&current[key]<=1,'Bounded phase mix: '+key);
  near(current.daylight+current.nightMix,1);
  assert.ok(current.sun.intensity>=.55&&current.hemisphere.intensity>=.72&&current.ambientIntensity>=.30&&current.environmentIntensity>=.30&&current.exposure>=1.12,
    'Night retains deliberate illumination for readable paths, people and architecture');
  assert.deepEqual(current.sun.position,[-38,55,-12],'Time changes retain the proven garden shadow volume');
  assert.deepEqual(current.sun.target,[0,0,35]);
  const change=Math.abs(next.daylight-current.daylight);maximumDaylightChange=Math.max(maximumDaylightChange,change);assert.ok(change<.013,'Day/night lighting has no one-minute jump');
  for(const key of scalarKeys)assert.ok(Math.abs(next[key]-current[key])<.04,'Continuous scalar lighting across dawn, dusk and midnight: '+key);
  for(let stop=0;stop<current.skyStops.length;stop++) {
    assert.equal(current.skyStops[stop].offset,next.skyStops[stop].offset);
    assert.match(current.skyStops[stop].color,/^#[0-9a-f]{6}$/);
    const a=rgb(current.skyStops[stop].color),b=rgb(next.skyStops[stop].color);
    for(let axis=0;axis<3;axis++) {const delta=Math.abs(a[axis]-b[axis]);maximumSkyChannelChange=Math.max(maximumSkyChannelChange,delta);assert.ok(delta<.02,'Sky color changes continuously across the complete day');}
  }
}
const beforeMidnight=getWorldTime(at(23,59,59,999)),afterMidnight=getWorldTime(at(24));
assert.equal(beforeMidnight.label,'23:59');assert.equal(afterMidnight.label,'00:00');assert.notEqual(beforeMidnight.minuteKey,afterMidnight.minuteKey);
for(const key of scalarKeys)near(beforeMidnight[key],afterMidnight[key]);
assert.deepEqual(beforeMidnight.skyStops,afterMidnight.skyStops);assert.deepEqual(beforeMidnight.sun,afterMidnight.sun);
assert.ok(circularDifference(beforeMidnight.hourAngle,afterMidnight.hourAngle)<1e-6);
assert.ok(circularDifference(beforeMidnight.minuteAngle,afterMidnight.minuteAngle)<1e-5);
assert.equal(getWorldTime(at(7,0,1)).minuteKey,getWorldTime(at(7,0,2)).minuteKey);
assert.notEqual(getWorldTime(at(7,0,1)).secondKey,getWorldTime(at(7,0,2)).secondKey);
assert.equal(getWorldTime(at(7,0,1)).lightingKey,getWorldTime(at(7,0,59)).lightingKey);
assert.notEqual(getWorldTime(at(7,0,59)).lightingKey,getWorldTime(at(7,1)).lightingKey);
assert.equal(getWorldTime(at(7),'night').lightingKey,getWorldTime(at(23),'night').lightingKey);
assert.throws(()=>getWorldTime(new Date('invalid')),TypeError);
assert.throws(()=>getWorldTime(null),TypeError);
assert.throws(()=>getWorldTime('2026-11-06T00:00:00Z'),TypeError);
assert.throws(()=>getWorldTime(at(0),'invalid'),RangeError);
console.log(JSON.stringify({result:'PASS',timeZone:WORLD_TIME_ZONE,checks:[
  'UTC instants map to explicit Japan dates/times through midnight, year change and leap day, independent of host timezone or DST',
  'Clock hand angles include seconds and retain actual Japan time during manual lighting previews',
  'All 1440 minutes have continuous sky and readable night illumination, with exact lighting continuity at midnight',
  'Clock and lighting change keys support separate second/minute refreshes and a fresh wall-clock snapshot after tab resume',
  'Invalid dates and lighting modes are rejected',
],maximumDaylightChange,maximumSkyChannelChange},null,2));
