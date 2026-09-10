(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RosterParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY_RE = '(Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .replace(/[\u00A0\t]+/g, ' ')
      .replace(/ +\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  function parsePeriod(text) {
    const m = text.match(/Period:\s*(\d{2})([A-Z][a-z]{2})(\d{2})\s*-\s*(\d{2})([A-Z][a-z]{2})(\d{2})/i);
    if (!m) return null;
    const sm = MONTHS[m[2][0].toUpperCase()+m[2].slice(1,3).toLowerCase()];
    const em = MONTHS[m[5][0].toUpperCase()+m[5].slice(1,3).toLowerCase()];
    if (sm == null || em == null) return null;
    return {
      start: new Date(Date.UTC(2000 + Number(m[3]), sm, Number(m[1]))),
      end: new Date(Date.UTC(2000 + Number(m[6]), em, Number(m[4])))
    };
  }

  function parseCrewName(text) {
    const m = text.match(/Individual duty plan\s+for\s+([A-Z0-9]{2,5})\s+(.+?)\s+NetLine\/Crew/i);
    if (!m) return null;
    return { crewCode: m[1].trim(), name: m[2].replace(/\s{2,}/g, ' ').trim() };
  }

  function dateFromDay(period, day, monthHint) {
    const base = period ? period.start : new Date();
    let y = base.getUTCFullYear();
    let m = monthHint == null ? base.getUTCMonth() : monthHint;
    // If period crosses a month and the day number wrapped, infer the end month.
    if (period && period.end.getUTCMonth() !== period.start.getUTCMonth()) {
      if (day < period.start.getUTCDate()) m = period.end.getUTCMonth();
    }
    return new Date(Date.UTC(y, m, day));
  }

  function setTime(date, hhmm) {
    const s = String(hhmm).padStart(4, '0');
    const d = new Date(date);
    d.setUTCHours(Number(s.slice(0,2)), Number(s.slice(2,4)), 0, 0);
    return d;
  }

  function plusDay(d, n=1) { const x = new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
  function durationHours(a,b) { return (b-a)/3600000; }

  function parseDuration(s) {
    const m = String(s||'').match(/(\d{1,3}):(\d{2})/);
    if (!m) return null;
    return Number(m[1]) + Number(m[2])/60;
  }

  function routeFromFlights(flights) {
    if (!flights.length) return '';
    const pts = [flights[0].dep];
    flights.forEach(f => pts.push(f.arr));
    return pts.join('–');
  }

  function parseFlights(block) {
    // Generic CrewLink flight row: carrier number DEP HHMM HHMM ARR aircraft
    const re = /\b([A-Z0-9]{2,3})\s+(\d{1,4}[A-Z]?)\s+([A-Z]{3})\s+(\d{4})\s+(\d{4})\s+([A-Z]{3})\s+([A-Z0-9]{3,5})\b/g;
    const out = [];
    let m;
    while ((m = re.exec(block))) {
      const f = { carrier:m[1], number:m[2], dep:m[3], depTime:m[4], arrTime:m[5], arr:m[6], aircraft:m[7] };
      const key = [f.carrier,f.number,f.dep,f.depTime,f.arrTime,f.arr].join('|');
      if (!out.some(x => x._key === key)) out.push({...f,_key:key});
    }
    return out.map(({_key,...x}) => x);
  }

  function lastRegexMatch(text, re) {
    let m, last = null;
    while ((m = re.exec(text))) last = m;
    return last;
  }

  function findDateTokenBefore(text, pos, period) {
    // Keep the generic fallback intentionally local. CrewLink repeats a full month
    // header on every page, so a long look-behind can accidentally pick a date from
    // that header instead of the duty immediately preceding an undated C/I row.
    const prefix = text.slice(Math.max(0,pos-700), pos);
    const re = new RegExp(DAY_RE+'(\\d{2})', 'g');
    const last = lastRegexMatch(prefix, re);
    if (!last) return null;
    return dateFromDay(period, Number(last[2]));
  }

  function inferLooseCheckInDate(text, pos, period) {
    // CrewLink often omits the date before a second C/I on the same operational day.
    // The previous duty metadata normally contains [RT DD/HHMM], which is a much
    // stronger anchor than the repeated calendar header. Prefer it first.
    const prefix = text.slice(Math.max(0,pos-1100), pos);
    const rt = lastRegexMatch(prefix, /\[RT\s+(\d{1,2})\/\d{4}\]/gi);
    if (rt) return dateFromDay(period, Number(rt[1]));

    // Next best anchor: an explicitly dated C/O line immediately before this C/I.
    const co = lastRegexMatch(prefix, new RegExp(DAY_RE+'(\\d{2})[^\n]{0,100}?\\bC\\/O\\b', 'gi'));
    if (co) return dateFromDay(period, Number(co[2]));

    return findDateTokenBefore(text, pos, period);
  }

  function parseCrewLinkText(input) {
    const text = cleanText(input);
    const period = parsePeriod(text);
    const crew = parseCrewName(text);
    const duties = [];
    const seen = new Set();

    // Locate check-ins. The date normally sits on the same line; fallback looks immediately before it.
    const ciRe = new RegExp('(?:^|\\n)\\s*'+DAY_RE+'(\\d{2})[^\\n]{0,90}?\\bC\\/I\\b\\s+([A-Z]{3})\\s+(\\d{4})', 'gmi');
    const starts = [];
    let m;
    while ((m = ciRe.exec(text))) {
      starts.push({ index:m.index, day:Number(m[2]), base:m[3], time:m[4], matchEnd:ciRe.lastIndex });
    }

    // Supplement strict matches with C/I rows whose date was printed earlier in the same CrewLink column
    // (common on an overnight sequence after a C/O line).
    const loose = /\bC\/I\b\s+([A-Z]{3})\s+(\d{4})/g;
    while ((m = loose.exec(text))) {
      if (starts.some(s => Math.abs(s.index - m.index) < 120)) continue;
      const d = inferLooseCheckInDate(text, m.index, period);
      if (d) starts.push({ index:m.index, day:d.getUTCDate(), base:m[1], time:m[2], matchEnd:loose.lastIndex });
    }
    starts.sort((a,b)=>a.index-b.index);

    for (let i=0;i<starts.length;i++) {
      const s = starts[i];
      const end = i+1 < starts.length ? starts[i+1].index : Math.min(text.length, s.index + 2200);
      const block = text.slice(s.index, end);
      const baseDate = dateFromDay(period, s.day);
      const checkIn = setTime(baseDate, s.time);

      const co = block.match(/(?:\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(\d{2})\b[^\n]{0,70})?\bC\/O\b\s+(\d{4})\s+([A-Z]{3})/i)
              || block.match(/\bC\/O\b[^\n]{0,60}?(\d{4})\s+([A-Z]{3})/i);
      let checkout = null, checkoutBase = s.base;
      if (co) {
        let dayOverride = null, hhmm, b;
        if (co.length >= 4 && co[3]) { dayOverride = co[1] ? Number(co[1]) : null; hhmm = co[2]; b = co[3]; }
        else { hhmm = co[1]; b = co[2]; }
        checkoutBase = b || s.base;
        const outDate = dayOverride ? dateFromDay(period, dayOverride) : baseDate;
        checkout = setTime(outDate, hhmm);
        if (checkout <= checkIn) checkout = plusDay(checkout, 1);
      }

      const type = (block.match(/\[TYPE\s+([^\]]+)\]/i)||[])[1]?.trim() || 'N/A';
      const dt = (block.match(/\[DT\s+(\d{1,3}:\d{2})\]/i)||[])[1] || null;
      const fdp = (block.match(/\[FDP\s+(\d{1,3}:\d{2})\]/i)||[])[1] || null;
      const ft = (block.match(/\[FT\s+(\d{1,3}:\d{2})\]/i)||[])[1] || null;
      // Only flight rows before the first C/O belong to this duty. Anything after C/O can be
      // metadata or the crew-information section, which repeats flights and would contaminate routes.
      const flightBlock = co && Number.isInteger(co.index) ? block.slice(0, co.index) : block;
      const flights = parseFlights(flightBlock);
      const route = routeFromFlights(flights);
      const key = [baseDate.toISOString().slice(0,10),s.time,checkout?.toISOString()||'',route].join('|');
      if (seen.has(key)) continue;
      seen.add(key);

      duties.push({
        kind:'duty', date:baseDate.toISOString().slice(0,10), base:s.base, checkIn:checkIn.toISOString(),
        checkout:checkout?.toISOString() || null, checkoutBase, type, dt, fdp, ft, flights, route,
        dutyHours: dt ? parseDuration(dt) : (checkout ? durationHours(checkIn,checkout) : null)
      });
    }

    // Parse simple non-flying day entries (OFF/ROFF/RES/etc.). These are useful when PDFs have no C/I duties.
    const dayLineRe = new RegExp('(?:^|\\n)\\s*'+DAY_RE+'(\\d{2})\\s+(ROFF|OFF|RES|SBY|STBY|VAC|ABS|SIM|TRG)\\b(?:\\s+([A-Z]{3}))?', 'gmi');
    while ((m = dayLineRe.exec(text))) {
      const date = dateFromDay(period, Number(m[2])).toISOString().slice(0,10);
      const code = m[3].toUpperCase();
      const key = date+'|'+code;
      if (seen.has(key)) continue;
      seen.add(key);
      duties.push({kind:'status', date, status:code, base:m[4]||null});
    }

    duties.sort((a,b)=> (a.checkIn||a.date).localeCompare(b.checkIn||b.date));
    return { period, crew, duties, rawLength:text.length };
  }

  return { parseCrewLinkText, parsePeriod, parseCrewName, parseDuration };
});
