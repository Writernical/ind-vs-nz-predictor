import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { calculateScore } from "@/lib/constants";

const API_KEY = process.env.CRICKETDATA_API_KEY || "";
const BASE_URL = "https://api.cricapi.com/v1";
const CRON_SECRET = process.env.CRON_SECRET || "";

// Known India players for team detection
const INDIA_NAMES = ["suryakumar","abhishek","tilak","sanju","samson","ishan","kishan","rinku","hardik","pandya","axar","patel","shivam","dube","washington","sundar","bumrah","jasprit","siraj","mohammed","arshdeep","varun","chakaravarthy","kuldeep","yadav"];
const NZ_NAMES = ["finn","allen","devon","conway","daryl","mitchell","glenn","phillips","seifert","tim","chapman","mark","santner","neesham","james","rachin","ravindra","mcconchie","cole","duffy","jacob","lockie","ferguson","matt","henry","kyle","jamieson","ish","sodhi"];

function isIndianPlayer(name) {
  const lower = (name || "").toLowerCase();
  return INDIA_NAMES.some(n => lower.includes(n));
}

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  
  // Allow auth via header OR query param (for browser testing)
  const authorized = (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) || 
                     (CRON_SECRET && secretParam === CRON_SECRET) ||
                     !CRON_SECRET;
  
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "CRICKETDATA_API_KEY not set" }, { status: 503 });
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

  // ── Step 1: Fetch current matches ──
  const matchesRes = await fetch(`${BASE_URL}/currentMatches?apikey=${API_KEY}&offset=0`);
  if (!matchesRes.ok) throw new Error(`API returned ${matchesRes.status}`);
  const matchesJson = await matchesRes.json();

  if (matchesJson.status !== "success" || !matchesJson.data) {
    return { synced: false, reason: "No match data from API" };
  }

  // ── Step 2: Find IND vs NZ ──
  const match = matchesJson.data.find((m) => {
    const name = (m.name || "").toLowerCase();
    const teams = (m.teams || []).map((t) => t.toLowerCase());
    return (
      (name.includes("india") && name.includes("new zealand")) ||
      (teams.some((t) => t.includes("india")) && teams.some((t) => t.includes("new zealand")))
    );
  });

  if (!match) {
    return { synced: false, reason: "IND vs NZ match not found in current matches" };
  }

  // ── Step 3: Cache live score for frontend ──
  const liveData = {
    matchId: match.id, title: match.name, status: match.status,
    scores: match.score || [], teams: match.teams || [],
    matchStarted: match.matchStarted, matchEnded: match.matchEnded,
  };

  await supabase.from("live_score").update({ data: liveData, fetched_at: new Date().toISOString() }).eq("id", 1);

  // ── Step 4: Fetch detailed scorecard ──
  let scorecard = null;
  if (match.matchStarted && match.id) {
    const scRes = await fetch(`${BASE_URL}/match_scorecard?apikey=${API_KEY}&id=${match.id}`);
    if (scRes.ok) {
      const scJson = await scRes.json();
      if (scJson.status === "success" && scJson.data) {
        scorecard = scJson.data.scorecard || null;
        liveData.scorecard = scorecard;
        await supabase.from("live_score").update({ data: liveData, fetched_at: new Date().toISOString() }).eq("id", 1);
      }
    }
  }

  // ── Step 5: Extract results ──
  const extracted = extractResults(match, scorecard);

  if (!extracted.hasAnyData) {
    return { synced: false, reason: "Match started but no extractable data yet", liveData };
  }

  // ── Step 6: Merge with current (preserve admin overrides) ──
  const { data: currentResults } = await supabase.from("match_results").select("*").eq("id", 1).single();
  const merged = mergeResults(currentResults, extracted);

  // ── Step 7: Save ──
  await supabase.from("match_results").update({ ...merged, updated_at: new Date().toISOString() }).eq("id", 1);

  // ── Debug: read back what's in the DB ──
  const { data: dbCheck } = await supabase.from("match_results").select("*").eq("id", 1).single();

  // ── Step 8: Recalculate scores ──
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
    synced: true, matchStatus: match.status, matchEnded: match.matchEnded,
    extracted, merged, dbCheck,
    scoresUpdated: updated, timestamp: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────
// RESULT EXTRACTION ENGINE
// ──────────────────────────────────────────────────────────

function extractResults(match, scorecard) {
  const result = {
    match_winner: null,
    top_scorer_india: null,
    top_scorer_nz: null,
    top_wicket_india: null,
    top_wicket_nz: null,
    most_catches: null,
    total_sixes: null,
    first_wicket_over: null,
    powerplay_score: null,
    highest_individual: null,
    over_results: {},
    hasAnyData: false,
  };

  const scores = match.score || [];
  const status = (match.status || "").toLowerCase();

  // ── Match Winner ──
  if (match.matchEnded) {
    if (status.includes("india") && status.includes("won")) {
      result.match_winner = "India";
    } else if ((status.includes("new zealand") || status.includes("nz")) && status.includes("won")) {
      result.match_winner = "New Zealand";
    }
  }

  if (!scorecard || scorecard.length === 0) {
    result.hasAnyData = !!result.match_winner;
    return result;
  }

  // ── Aggregate batting/bowling data across all innings ──
  const allBatting = [];
  const allBowling = [];
  const indiaBatting = [];
  const nzBatting = [];
  const indiaBowling = [];
  const nzBowling = [];

  for (const innings of scorecard) {
    const inningsName = (innings.inning || innings.team || "").toLowerCase();
    const isIndiaInnings = inningsName.includes("india");

    if (innings.batting) {
      allBatting.push(...innings.batting);
      for (const b of innings.batting) {
        // Batters in India's innings are Indian players
        if (isIndiaInnings) indiaBatting.push(b);
        else nzBatting.push(b);
      }
    }
    if (innings.bowling) {
      allBowling.push(...innings.bowling);
      for (const b of innings.bowling) {
        // Bowlers in India's innings are NZ bowlers (they bowl against India)
        if (isIndiaInnings) nzBowling.push(b);
        else indiaBowling.push(b);
      }
    }
  }

  if (allBatting.length > 0) {
    result.hasAnyData = true;

    // ── Top Scorer India ──
    if (indiaBatting.length > 0) {
      const topInd = indiaBatting.reduce((best, b) => ((b.r || 0) > (best.r || 0) ? b : best), indiaBatting[0]);
      if (topInd && (topInd.batsman?.name || topInd.batsman)) {
        result.top_scorer_india = topInd.batsman?.name || topInd.batsman;
      }
    }

    // ── Top Scorer NZ ──
    if (nzBatting.length > 0) {
      const topNz = nzBatting.reduce((best, b) => ((b.r || 0) > (best.r || 0) ? b : best), nzBatting[0]);
      if (topNz && (topNz.batsman?.name || topNz.batsman)) {
        result.top_scorer_nz = topNz.batsman?.name || topNz.batsman;
      }
    }

    // ── Top Wicket Taker India ──
    if (indiaBowling.length > 0) {
      const topIndBowl = indiaBowling.reduce((best, b) => ((b.w || 0) > (best.w || 0) ? b : best), indiaBowling[0]);
      if (topIndBowl && (topIndBowl.bowler?.name || topIndBowl.bowler) && (topIndBowl.w || 0) > 0) {
        result.top_wicket_india = topIndBowl.bowler?.name || topIndBowl.bowler;
      }
    }

    // ── Top Wicket Taker NZ ──
    if (nzBowling.length > 0) {
      const topNzBowl = nzBowling.reduce((best, b) => ((b.w || 0) > (best.w || 0) ? b : best), nzBowling[0]);
      if (topNzBowl && (topNzBowl.bowler?.name || topNzBowl.bowler) && (topNzBowl.w || 0) > 0) {
        result.top_wicket_nz = topNzBowl.bowler?.name || topNzBowl.bowler;
      }
    }

    // ── Most Catches ── (from fielding data if available, or dismissal text)
    const catchCount = {};
    for (const b of allBatting) {
      const dismissal = b.dismissal || b["dismissal-text"] || "";
      const catchMatch = dismissal.match(/c\s+(.+?)\s+b\s+/i) || dismissal.match(/caught\s+by\s+(.+)/i);
      if (catchMatch) {
        const fielder = catchMatch[1].trim();
        catchCount[fielder] = (catchCount[fielder] || 0) + 1;
      }
    }
    if (Object.keys(catchCount).length > 0) {
      const topFielder = Object.entries(catchCount).reduce((best, [name, count]) =>
        count > best[1] ? [name, count] : best, ["", 0]
      );
      if (topFielder[1] > 0) {
        result.most_catches = topFielder[0];
      }
    }

    // ── Highest Individual Score (range) ──
    const topBatAll = allBatting.reduce((best, b) => ((b.r || 0) > (best.r || 0) ? b : best), allBatting[0]);
    const highestRuns = topBatAll?.r || 0;
    result.highest_individual = mapToRange(highestRuns, [
      [0, 29, "Below 30"], [30, 49, "30-49"], [50, 74, "50-74"], [75, 99, "75-99"], [100, Infinity, "100+"],
    ]);

    // ── Total Sixes ──
    let totalSixes = 0;
    for (const b of allBatting) { totalSixes += b["6s"] || b.sixes || 0; }
    result.total_sixes = mapToRange(totalSixes, [
      [0, 5, "0-5"], [6, 10, "6-10"], [11, 15, "11-15"], [16, 20, "16-20"], [21, Infinity, "21+"],
    ]);

    // ── First Wicket Over ──
    const fow = scorecard[0]?.["fall_of_wickets"] || scorecard[0]?.fallOfWickets || [];
    if (fow.length > 0) {
      const firstFow = fow[0];
      const overNum = firstFow.overs || firstFow.o;
      if (overNum) {
        const ewOver = Math.ceil(parseFloat(overNum));
        result.first_wicket_over = mapToRange(ewOver, [
          [1, 1, "1"], [2, 2, "2"], [3, 3, "3"], [4, 4, "4"], [5, 5, "5"],
          [6, 10, "6-10"], [11, 15, "11-15"], [16, 20, "16-20"],
        ]);
      }
    }

    // ── Powerplay Score ──
    if (scorecard[0]?.powerplay) {
      const ppRuns = scorecard[0].powerplay.runs || scorecard[0].powerplay.r;
      if (ppRuns !== undefined) {
        result.powerplay_score = mapToRange(ppRuns, [
          [0, 29, "Below 30"], [30, 45, "30-45"], [46, 55, "46-55"], [56, 70, "56-70"], [71, Infinity, "Above 70"],
        ]);
      }
    }

    // ── Over-by-Over Results ──
    // 1st innings = overs 1-20, 2nd innings = overs 21-40
    for (let innIdx = 0; innIdx < scorecard.length; innIdx++) {
      const inn = scorecard[innIdx];
      const overData = inn?.overSummary || [];
      const offset = innIdx === 0 ? 0 : 20; // 2nd innings overs stored as 21-40
      for (const ov of overData) {
        const overNum = ov.over || ov.o;
        const runs = ov.runs || ov.r || 0;
        if (overNum) {
          const key = String(parseInt(overNum) + offset);
          result.over_results[key] = mapToRange(runs, [
            [0, 4, "0-4"], [5, 8, "5-8"], [9, 12, "9-12"], [13, 16, "13-16"], [17, Infinity, "17+"],
          ]);
        }
      }
    }
  }

  return result;
}

function mapToRange(value, ranges) {
  for (const [min, max, label] of ranges) {
    if (value >= min && value <= max) return label;
  }
  return null;
}

function mergeResults(current, extracted) {
  const fields = [
    "match_winner", "top_scorer_india", "top_scorer_nz",
    "top_wicket_india", "top_wicket_nz", "most_catches",
    "total_sixes", "first_wicket_over", "powerplay_score", "highest_individual",
  ];

  const merged = { ...(current || {}) };

  for (const field of fields) {
    if (!merged[field] && extracted[field]) {
      merged[field] = extracted[field];
    }
    if (extracted.match_winner && extracted[field]) {
      merged[field] = extracted[field];
    }
  }

  // Merge over results — fills missing, doesn't overwrite
  const currentOvers = merged.over_results || {};
  const extractedOvers = extracted.over_results || {};
  merged.over_results = { ...currentOvers };
  for (const [ov, val] of Object.entries(extractedOvers)) {
    if (!merged.over_results[ov]) {
      merged.over_results[ov] = val;
    }
  }

  return merged;
}
