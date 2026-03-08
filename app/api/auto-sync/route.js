import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase-server";
import { calculateScore } from "@/lib/constants";

// ──────────────────────────────────────────────────────────
// AUTO-SYNC: Cron job that runs every 3 minutes during match
//
// 1. Fetches scorecard from CricketData.org
// 2. Extracts: winner, top scorer, sixes, wickets, etc.
// 3. Maps raw values → prediction range categories
// 4. Updates match_results in Supabase
// 5. Recalculates all player scores
// 6. Caches live score in Supabase for the frontend
//
// Vercel Cron calls this automatically (see vercel.json)
// ──────────────────────────────────────────────────────────

const API_KEY = process.env.CRICKETDATA_API_KEY || "";
const BASE_URL = "https://api.cricapi.com/v1";
const CRON_SECRET = process.env.CRON_SECRET || "";

export async function GET(request) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function syncMatchData() {
  const supabase = getServerSupabase();

  // ── Step 1: Fetch current matches ──
  const matchesRes = await fetch(
    `${BASE_URL}/currentMatches?apikey=${API_KEY}&offset=0`
  );
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
      (teams.some((t) => t.includes("india")) &&
        teams.some((t) => t.includes("new zealand")))
    );
  });

  if (!match) {
    return { synced: false, reason: "IND vs NZ match not found in current matches" };
  }

  // ── Step 3: Cache live score for frontend ──
  const liveData = {
    matchId: match.id,
    title: match.name,
    status: match.status,
    scores: match.score || [],
    teams: match.teams || [],
    matchStarted: match.matchStarted,
    matchEnded: match.matchEnded,
  };

  await supabase
    .from("live_score")
    .update({ data: liveData, fetched_at: new Date().toISOString() })
    .eq("id", 1);

  // ── Step 4: Fetch detailed scorecard (costs 1 API call) ──
  let scorecard = null;
  if (match.matchStarted && match.id) {
    const scRes = await fetch(
      `${BASE_URL}/match_scorecard?apikey=${API_KEY}&id=${match.id}`
    );
    if (scRes.ok) {
      const scJson = await scRes.json();
      if (scJson.status === "success" && scJson.data) {
        scorecard = scJson.data.scorecard || null;

        // Add detailed scorecard to live cache
        liveData.scorecard = scorecard;
        await supabase
          .from("live_score")
          .update({ data: liveData, fetched_at: new Date().toISOString() })
          .eq("id", 1);
      }
    }
  }

  // ── Step 5: Extract results from match + scorecard ──
  const extracted = extractResults(match, scorecard);

  if (!extracted.hasAnyData) {
    return { synced: false, reason: "Match started but no extractable data yet", liveData };
  }

  // ── Step 6: Load current results (preserve admin overrides) ──
  const { data: currentResults } = await supabase
    .from("match_results")
    .select("*")
    .eq("id", 1)
    .single();

  // Merge: auto-extracted fills in blanks, but never overwrites admin manual entries
  const merged = mergeResults(currentResults, extracted);

  // ── Step 7: Save merged results ──
  await supabase
    .from("match_results")
    .update({ ...merged, updated_at: new Date().toISOString() })
    .eq("id", 1);

  // ── Step 8: Recalculate all player scores ──
  const { data: allPreds } = await supabase.from("predictions").select("*");
  let updated = 0;

  if (allPreds) {
    for (const pred of allPreds) {
      const newScore = calculateScore(pred, merged);
      if (newScore !== pred.score) {
        await supabase
          .from("predictions")
          .update({ score: newScore })
          .eq("player_name", pred.player_name);
        updated++;
      }
    }
  }

  return {
    synced: true,
    matchStatus: match.status,
    matchEnded: match.matchEnded,
    extracted,
    scoresUpdated: updated,
    timestamp: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────
// RESULT EXTRACTION ENGINE
// ──────────────────────────────────────────────────────────

function extractResults(match, scorecard) {
  const result = {
    match_winner: null,
    top_scorer: null,
    player_of_match: null,
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
    } else if (
      (status.includes("new zealand") || status.includes("nz")) &&
      status.includes("won")
    ) {
      result.match_winner = "New Zealand";
    }
  }

  // ── Player of the Match ──
  // CricketData sometimes includes this in match info
  if (match.matchWinner) {
    // Some API responses have this field
  }
  if (match.playerOfTheMatch) {
    result.player_of_match = match.playerOfTheMatch;
  }

  if (!scorecard || scorecard.length === 0) {
    result.hasAnyData = !!result.match_winner;
    return result;
  }

  // ── Aggregate batting data across all innings ──
  const allBatting = [];
  const allBowling = [];

  for (const innings of scorecard) {
    if (innings.batting) allBatting.push(...innings.batting);
    if (innings.bowling) allBowling.push(...innings.bowling);
  }

  if (allBatting.length > 0) {
    result.hasAnyData = true;

    // ── Top Scorer ──
    const topBat = allBatting.reduce(
      (best, b) => ((b.r || 0) > (best.r || 0) ? b : best),
      allBatting[0]
    );
    if (topBat && topBat.batsman) {
      result.top_scorer = topBat.batsman.name || topBat.batsman;
    }

    // ── Highest Individual Score (range) ──
    const highestRuns = topBat?.r || 0;
    result.highest_individual = mapToRange(highestRuns, [
      [0, 29, "Below 30"],
      [30, 49, "30-49"],
      [50, 74, "50-74"],
      [75, 99, "75-99"],
      [100, Infinity, "100+"],
    ]);

    // ── Total Sixes ──
    let totalSixes = 0;
    for (const b of allBatting) {
      totalSixes += b["6s"] || b.sixes || 0;
    }
    result.total_sixes = mapToRange(totalSixes, [
      [0, 5, "0-5"],
      [6, 10, "6-10"],
      [11, 15, "11-15"],
      [16, 20, "16-20"],
      [21, Infinity, "21+"],
    ]);

    // ── First Wicket Over ──
    // Look at first innings dismissals to find the earliest wicket
    const firstInningsBatting = scorecard[0]?.batting || [];
    let earliestWicketOver = Infinity;

    for (const b of firstInningsBatting) {
      const dismissal = b.dismissal || b["dismissal-text"] || "";
      if (dismissal && dismissal !== "not out" && dismissal !== "batting") {
        // Try to find the over from fall of wickets or batting order
        // The balls faced can help estimate the over
        // But more reliably, check fall of wickets if available
      }
    }

    // Check fall of wickets data if available
    const fow = scorecard[0]?.["fall_of_wickets"] || scorecard[0]?.fallOfWickets || [];
    if (fow.length > 0) {
      const firstFow = fow[0];
      const overNum = firstFow.overs || firstFow.o;
      if (overNum) {
        earliestWicketOver = Math.ceil(parseFloat(overNum));
      }
    }

    if (earliestWicketOver < Infinity) {
      result.first_wicket_over = mapToRange(earliestWicketOver, [
        [1, 1, "1"],
        [2, 2, "2"],
        [3, 3, "3"],
        [4, 4, "4"],
        [5, 5, "5"],
        [6, 10, "6-10"],
        [11, 15, "11-15"],
        [16, 20, "16-20"],
      ]);
    }

    // ── Powerplay Score (first innings, first 6 overs) ──
    // If the first innings score at 6 overs is available from score array
    const firstInningsScore = scores.find((s) =>
      (s.inning || "").toLowerCase().includes("inning 1")
    );
    // We can estimate powerplay from bowling figures for overs 1-6
    // But precise powerplay needs ball-by-ball data
    // Best effort: check if the innings has a powerplay field
    if (scorecard[0]?.powerplay) {
      const ppRuns = scorecard[0].powerplay.runs || scorecard[0].powerplay.r;
      if (ppRuns !== undefined) {
        result.powerplay_score = mapToRange(ppRuns, [
          [0, 29, "Below 30"],
          [30, 45, "30-45"],
          [46, 55, "46-55"],
          [56, 70, "56-70"],
          [71, Infinity, "Above 70"],
        ]);
      }
    }

    // ── Over-by-Over Results (from ball-by-ball if available) ──
    // CricketData free tier may not include ball-by-ball
    // If available, calculate runs per over
    if (scorecard[0]?.overSummary || match.bbb) {
      const overData = scorecard[0]?.overSummary || [];
      for (const ov of overData) {
        const overNum = ov.over || ov.o;
        const runs = ov.runs || ov.r || 0;
        if (overNum) {
          result.over_results[String(overNum)] = mapToRange(runs, [
            [0, 4, "0-4"],
            [5, 8, "5-8"],
            [9, 12, "9-12"],
            [13, 16, "13-16"],
            [17, Infinity, "17+"],
          ]);
        }
      }
    }
  }

  return result;
}

// ── Map a number to a range label ──
function mapToRange(value, ranges) {
  for (const [min, max, label] of ranges) {
    if (value >= min && value <= max) return label;
  }
  return null;
}

// ── Merge: auto-fill blanks, preserve manual admin overrides ──
function mergeResults(current, extracted) {
  const fields = [
    "match_winner",
    "top_scorer",
    "player_of_match",
    "total_sixes",
    "first_wicket_over",
    "powerplay_score",
    "highest_individual",
  ];

  const merged = { ...(current || {}) };

  for (const field of fields) {
    // Auto-fill only if current is empty and we have extracted data
    if (!merged[field] && extracted[field]) {
      merged[field] = extracted[field];
    }
    // If match ended, always update with latest data (final results)
    if (extracted.match_winner && extracted[field]) {
      merged[field] = extracted[field];
    }
  }

  // Merge over results — auto fills missing overs, doesn't overwrite existing
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
