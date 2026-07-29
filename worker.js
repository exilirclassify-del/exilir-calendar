// ═══════════════════════════════════════════════════════
// EXILIR CALENDAR WORKER — serves the site + ICS feed
// Only edit needed: paste your Firebase apiKey below.
// ═══════════════════════════════════════════════════════

const FIREBASE_PROJECT = "exilir-calendar";
const FIREBASE_API_KEY = "AIzaSyBARB8WptHw_LOcMppNEaStFuxFXr1eyIY"; // same "apiKey" value as in your index.html firebaseConfig

async function handleFeed(url) {
  // URL shape: /feed/<40-hex-char-token>.ics
  const m = url.pathname.match(/^\/feed\/([a-f0-9]{40})(?:\.ics)?$/);
  if (!m) return new Response("Not found", { status: 404 });
  const token = m[1];

  const fsUrl =
    "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT +
    "/databases/(default)/documents/feeds/" + token +
    "?key=" + FIREBASE_API_KEY;

  const r = await fetch(fsUrl, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) return new Response("Calendar not found", { status: 404 });

  let appts = [];
  try {
    const doc = await r.json();
    appts = JSON.parse(doc.fields.appointments.stringValue);
  } catch (e) {
    return new Response("Calendar unavailable", { status: 500 });
  }

  return new Response(buildICS(appts), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="exilir-calendar.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}

function icsEscape(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function buildICS(ap) {
  const p = (n) => String(n).padStart(2, "0");
  const fmt = (x) =>
    x.getFullYear() + "" + p(x.getMonth() + 1) + p(x.getDate()) +
    "T" + p(x.getHours()) + p(x.getMinutes()) + "00";
  const l = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ExilirCalendar//EN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Exilir Calendar",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const a of ap || []) {
    if (!a.dateObj) continue;
    const d = new Date(a.dateObj);
    if (isNaN(d)) continue;
    l.push("BEGIN:VEVENT");
    if (a.timeHour != null) {
      const h = Math.floor(a.timeHour);
      const min = Math.round((a.timeHour - h) * 60);
      const st = new Date(d); st.setHours(h, min, 0, 0);
      const en = new Date(st.getTime() + 3600000); // 1-hour default
      l.push("DTSTART:" + fmt(st), "DTEND:" + fmt(en));
    } else {
      const nx = new Date(d.getTime() + 86400000);
      const ds = (x) => x.getFullYear() + "" + p(x.getMonth() + 1) + p(x.getDate());
      l.push("DTSTART;VALUE=DATE:" + ds(d), "DTEND;VALUE=DATE:" + ds(nx));
    }
    l.push("SUMMARY:" + icsEscape(a.title || "Appointment"));
    if (a.notes) l.push("DESCRIPTION:" + icsEscape(a.notes));
    if (a.category) l.push("CATEGORIES:" + icsEscape(a.category));
    l.push("UID:" + (a.id || crypto.randomUUID()) + "@exilircalendar");
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return l.join("\r\n");
}


// ─── Router: /feed/* → ICS feed; everything else → static site (index.html) ───
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/feed/")) return handleFeed(url);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Assets binding missing — check wrangler.json", { status: 500 });
  },
};
