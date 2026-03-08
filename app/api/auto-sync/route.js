import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { calculateScore } from "@/lib/constants";

const CRON_SECRET = process.env.CRON_SECRET || "";

// ESPN Cricket API - FREE, no API key needed
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/cricket";
// CricketData.org as fallback
const CRIC_API_KEY = process.env.CRICKETDATA_API_KEY || "";
const CRIC_BASE = "https://api.cricapi.com/v1";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  const authorized = (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) ||
                     (CRON_SECRET && secretParam === CRON_SECRET) ||
                     !CRON_SECRET;
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncMatchData();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Auto-sync error:", err);
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}

async function syncMatchData() {
  const supabase = getServerSupabase();

  // ── Try ESPN first (free, no key) ──
  let matchData = null;
  let source = "none";
  let debugInfo = {};

  try {
    matchData = await fetchFromESPN(debugInfo);
    if (matchData) source = "espn";
  } catch (e) {
    debugInfo.espnError = e.message;
  }

  // ── Fallback to CricketData.org ──
  if (!matchData && CRIC_API_KEY) {
    try {
      matchData = await fetchFromCricApi();
      if (matchData) source = "cricapi";
    } catch (e) {
      debugInfo.cricApiError = e.message;
    }
  }

  if (!matchData) {
    return { synced: false, reason: "No match data from any source", debugInfo };
  }

  // ── Cache live score ──
  await supabase.from("live_score")
    .update({ data: matchData.liveData, fetched_at: new Date().toISOString() })
    .eq("id", 1);

  const extracted = matchData.extracted;
  if (!extracted.hasAnyData) {
    return { synced: false, reason: "Match found but no extractable data yet", source, debugInfo, liveData: matchData.liveData };
  }

  // ── Merge with current (preserve admin overrides) ──
  const { data: currentResults } = await supabase.from("match_results").select("*").eq("id", 1).single();
  const merged = mergeResults(currentResults, extracted);

  // ── Save ──
  await supabase.from("match_results")
    .update({ ...merged, updated_at: new Date().toISOString() })
    .eq("id", 1);

  const { data: dbCheck } = await supabase.from("match_results").select("*").eq("id", 1).single();

  // ── Recalculate scores ──
  const { data: allPreds } = await supabase.from("predictions").select("*");
  let updated = 0;
  if (allPreds) {
    for (const pred of allPreds) {
      const newScore = calculateScore(pred, merged);
      if (newScore !== pred.score) {
        await supabase.from("predictions").update({ score: newScore }).eq("player_name", pred.player_name);
        updated++;
      }
    }
  }

  return {
    synced: true, source, matchStatus: matchData.liveData?.status,
    extracted, merged, dbCheck, scoresUpdated: updated,
    debugInfo, timestamp: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════
// ESPN FREE API (no key needed)
// ══════════════════════════════════════════════

async function fetchFromESPN(debugInfo) {
  const endpoints = [
    `${ESPN_BASE}/scoreboard`,
    `${ESPN_BASE}/8676/scoreboard`,
    `${ESPN_BASE}/icc-mens-t20-world-cup-2026/scoreboard`,
    `https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=cricket&lang=en`,
  ];

  debugInfo.espnAttempts = [];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      });
      const statusCode = res.status;
      debugInfo.espnAttempts.push({ url, status: statusCode });

      if (!res.ok) continue;
      const json = await res.json();

      // Different response formats
      let events = json.events || [];
      if (!events.length && json.sports) {
        for (const sport of json.sports) {
          for (const league of (sport.leagues || [])) {
            events.push(...(league.events || []));
          }
        }
      }

      debugInfo.espnAttempts[debugInfo.espnAttempts.length - 1].eventCount = events.length;
      debugInfo.espnAttempts[debugInfo.espnAttempts.length - 1].eventNames = events.map(e => e.name || e.shortName || "unnamed").slice(0, 5);

      for (const event of events) {
        const name = (event.name || event.shortName || "").toLowerCase();
        const isINDvsNZ = (name.includes("india") && name.includes("new zealand")) ||
                          (name.includes("ind") && name.includes("nz"));
        if (!isINDvsNZ) continue;

        debugInfo.espnMatchFound = name;
        return parseESPNEvent(event, debugInfo);
      }
    } catch (e) {
      debugInfo.espnAttempts.push({ url, error: e.message });
      continue;
    }
  }

  return null;
}

function parseESPNEvent(event, debugInfo) {
  const competitions = event.competitions || [event];
  const comp = competitions[0] || {};
  const competitors = comp.competitors || [];
  const status = event.status?.type?.description || event.status?.type?.detail || comp.status?.type?.detail || "";
  const isComplete = event.status?.type?.completed || false;

  debugInfo.espnParsed = {
    status, isComplete, competitorCount: competitors.length,
    competitors: competitors.map(c => ({
      team: c.team?.displayName || c.team?.abbreviation,
      score: c.score, winner: c.winner,
    })),
  };

  const liveData = {
    title: event.name || event.shortName || "IND vs NZ",
    status: status,
    matchStarted: true,
    matchEnded: isComplete,
    scores: competitors.map(c => ({
      team: c.team?.displayName || c.team?.abbreviation || "",
      score: c.score || "",
    })),
  };

  const extracted = {
    match_winner: null, top_scorer_india: null, top_scorer_nz: null,
    top_wicket_india: null, top_wicket_nz: null, most_catches: null,
    total_sixes: null, first_wicket_over: null, powerplay_score: null,
    highest_individual: null, over_results: {}, hasAnyData: false,
  };

  // Match winner
  if (isComplete) {
    for (const c of competitors) {
      if (c.winner) {
        const teamName = (c.team?.displayName || "").toLowerCase();
        if (teamName.includes("india")) extracted.match_winner = "India";
        else if (teamName.includes("new zealand")) extracted.match_winner = "New Zealand";
      }
    }
  }

  // Parse leaders (top performers per team)
  for (const c of competitors) {
    const teamName = (c.team?.displayName || c.team?.abbreviation || "").toLowerCase();
    const isIndia = teamName.includes("india") || teamName === "ind";

    const leaders = c.leaders || [];
    for (const leader of leaders) {
      const cat = (leader.name || leader.displayName || "").toLowerCase();
      const topPlayer = leader.leaders?.[0] || {};
      const playerName = topPlayer.athlete?.displayName || topPlayer.athlete?.shortName || "";

      if (playerName && (cat.includes("run") || cat.includes("bat"))) {
        if (isIndia) extracted.top_scorer_india = playerName;
        else extracted.top_scorer_nz = playerName;
        extracted.hasAnyData = true;
      }
      if (playerName && (cat.includes("wicket") || cat.includes("bowl"))) {
        if (isIndia) extracted.top_wicket_india = playerName;
        else extracted.top_wicket_nz = playerName;
        extracted.hasAnyData = true;
      }
    }
  }

  // Also check event-level leaders
  const eventLeaders = event.leaders || comp.leaders || [];
  for (const leader of eventLeaders) {
    const cat = (leader.name || leader.displayName || "").toLowerCase();
    const topPlayer = leader.leaders?.[0] || {};
    const playerName = topPlayer.athlete?.displayName || topPlayer.athlete?.shortName || "";
    const teamId = topPlayer.team?.id || "";

    if (playerName) extracted.hasAnyData = true;
  }

  // If we have scores, try to parse them for basic info
  if (competitors.length > 0) {
    extracted.hasAnyData = true;
  }

  return { liveData, extracted };
}

// ══════════════════════════════════════════════
// CRICKETDATA.ORG FALLBACK
// ══════════════════════════════════════════════

async function fetchFromCricApi() {
  const matchesRes = await fetch(`${CRIC_BASE}/currentMatches?apikey=${CRIC_API_KEY}&offset=0`);
  if (!matchesRes.ok) return null;
  const matchesJson = await matchesRes.json();
  if (matchesJson.status !== "success" || !matchesJson.data) return null;

  const match = matchesJson.data.find((m) => {
    const name = (m.name || "").toLowerCase();
    const teams = (m.teams || []).map((t) => t.toLowerCase());
    return (name.includes("india") && name.includes("new zealand")) ||
      (teams.some((t) => t.includes("india")) && teams.some((t) => t.includes("new zealand")));
  });
  if (!match) return null;

  const liveData = {
    matchId: match.id, title: match.name, status: match.status,
    scores: match.score || [], teams: match.teams || [],
    matchStarted: match.matchStarted, matchEnded: match.matchEnded,
  };

  let scorecard = null;
  if (match.matchStarted && match.id) {
    try {
      const scRes = await fetch(`${CRIC_BASE}/match_scorecard?apikey=${CRIC_API_KEY}&id=${match.id}`);
      if (scRes.ok) {
        const scJson = await scRes.json();
        if (scJson.status === "success" && scJson.data) scorecard = scJson.data.scorecard || null;
      }
    } catch (e) {}
  }

  const extracted = extractFromCricApi(match, scorecard);
  return { liveData, extracted };
}

function extractFromCricApi(match, scorecard) {
  const result = {
    match_winner: null, top_scorer_india: null, top_scorer_nz: null,
    top_wicket_india: null, top_wicket_nz: null, most_catches: null,
    total_sixes: null, first_wicket_over: null, powerplay_score: null,
    highest_individual: null, over_results: {}, hasAnyData: false,
  };

  const status = (match.status || "").toLowerCase();
  if (match.matchEnded) {
    if (status.includes("india") && status.includes("won")) result.match_winner = "India";
    else if ((status.includes("new zealand") || status.includes("nz")) && status.includes("won")) result.match_winner = "New Zealand";
  }

  if (!scorecard || scorecard.length === 0) {
    result.hasAnyData = !!result.match_winner;
    return result;
  }

  const indiaBat = [], nzBat = [], indiaBowl = [], nzBowl = [], allBat = [];
  for (const inn of scorecard) {
    const name = (inn.inning || inn.team || "").toLowerCase();
    const isInd = name.includes("india");
    if (inn.batting) {
      allBat.push(...inn.batting);
      if (isInd) indiaBat.push(...inn.batting); else nzBat.push(...inn.batting);
    }
    if (inn.bowling) {
      if (isInd) nzBowl.push(...inn.bowling); else indiaBowl.push(...inn.bowling);
    }
  }

  if (allBat.length > 0) {
    result.hasAnyData = true;
    const getTop = (a) => a.length ? a.reduce((b, x) => (x.r||0) > (b.r||0) ? x : b, a[0]) : null;
    const getTopW = (a) => a.length ? a.reduce((b, x) => (x.w||0) > (b.w||0) ? x : b, a[0]) : null;

    const ti = getTop(indiaBat); if (ti) result.top_scorer_india = ti.batsman?.name || ti.batsman;
    const tn = getTop(nzBat); if (tn) result.top_scorer_nz = tn.batsman?.name || tn.batsman;
    const bi = getTopW(indiaBowl); if (bi && (bi.w||0)>0) result.top_wicket_india = bi.bowler?.name || bi.bowler;
    const bn = getTopW(nzBowl); if (bn && (bn.w||0)>0) result.top_wicket_nz = bn.bowler?.name || bn.bowler;

    const catchCount = {};
    for (const b of allBat) {
      const d = b.dismissal || b["dismissal-text"] || "";
      const m = d.match(/c\s+(.+?)\s+b\s+/i);
      if (m) { const f = m[1].trim(); catchCount[f] = (catchCount[f]||0) + 1; }
    }
    const topC = Object.entries(catchCount).reduce((b,[n,c]) => c>b[1]?[n,c]:b, ["",0]);
    if (topC[1] > 0) result.most_catches = topC[0];

    const topAll = getTop(allBat);
    result.highest_individual = mapRange(topAll?.r||0, [[0,29,"Below 30"],[30,49,"30-49"],[50,74,"50-74"],[75,99,"75-99"],[100,Infinity,"100+"]]);

    let ts = 0; for (const b of allBat) ts += b["6s"]||b.sixes||0;
    result.total_sixes = mapRange(ts, [[0,5,"0-5"],[6,10,"6-10"],[11,15,"11-15"],[16,20,"16-20"],[21,Infinity,"21+"]]);

    const fow = scorecard[0]?.["fall_of_wickets"] || scorecard[0]?.fallOfWickets || [];
    if (fow.length > 0) {
      const o = fow[0].overs || fow[0].o;
      if (o) result.first_wicket_over = mapRange(Math.ceil(parseFloat(o)), [[1,1,"1"],[2,2,"2"],[3,3,"3"],[4,4,"4"],[5,5,"5"],[6,10,"6-10"],[11,15,"11-15"],[16,20,"16-20"]]);
    }

    if (scorecard[0]?.powerplay) {
      const pp = scorecard[0].powerplay.runs || scorecard[0].powerplay.r;
      if (pp !== undefined) result.powerplay_score = mapRange(pp, [[0,29,"Below 30"],[30,45,"30-45"],[46,55,"46-55"],[56,70,"56-70"],[71,Infinity,"Above 70"]]);
    }

    for (let idx = 0; idx < scorecard.length; idx++) {
      const od = scorecard[idx]?.overSummary || [];
      const off = idx === 0 ? 0 : 20;
      for (const ov of od) {
        const n = ov.over||ov.o; const r = ov.runs||ov.r||0;
        if (n) result.over_results[String(parseInt(n)+off)] = mapRange(r, [[0,4,"0-4"],[5,8,"5-8"],[9,12,"9-12"],[13,16,"13-16"],[17,Infinity,"17+"]]);
      }
    }
  }
  return result;
}

function mapRange(v, ranges) {
  for (const [min, max, label] of ranges) if (v >= min && v <= max) return label;
  return null;
}

function mergeResults(current, extracted) {
  const fields = ["match_winner","top_scorer_india","top_scorer_nz","top_wicket_india","top_wicket_nz","most_catches","total_sixes","first_wicket_over","powerplay_score","highest_individual"];
  const merged = { ...(current || {}) };
  for (const f of fields) {
    if (!merged[f] && extracted[f]) merged[f] = extracted[f];
    if (extracted.match_winner && extracted[f]) merged[f] = extracted[f];
  }
  merged.over_results = { ...(merged.over_results||{}), };
  for (const [ov, val] of Object.entries(extracted.over_results || {})) {
    if (!merged.over_results[ov]) merged.over_results[ov] = val;
  }
  return merged;
}
