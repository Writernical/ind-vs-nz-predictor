import { NextResponse } from "next/server";

// ──────────────────────────────────────────────────────────
// CricketData.org (formerly CricAPI) — Free Hosted API
// Base: https://api.cricapi.com/v1/
//
// Free tier: 100 API calls/day (no credit card needed)
// Sign up at: https://cricketdata.org/signup.aspx
// ──────────────────────────────────────────────────────────

const API_KEY = process.env.CRICKETDATA_API_KEY || "";
const BASE_URL = "https://api.cricapi.com/v1";

// ── Endpoint: GET /api/cricket-score ──
// Returns live score for the IND vs NZ final.
// Query params:
//   ?matchId=xxx  → fetch specific match scorecard
//   (no params)   → auto-find IND vs NZ from current matches

export async function GET(request) {
  if (!API_KEY) {
    return NextResponse.json(
      {
        error: "Cricket API not configured",
        setup: "Sign up free at https://cricketdata.org/signup.aspx, then set CRICKETDATA_API_KEY in your Vercel env vars.",
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const matchId = searchParams.get("matchId");

  try {
    // If a specific match ID is provided, fetch its scorecard
    if (matchId) {
      return await fetchMatchScorecard(matchId);
    }

    // Otherwise, find IND vs NZ from current live matches
    return await fetchCurrentMatch();
  } catch (err) {
    console.error("CricketData API error:", err.message);
    return NextResponse.json(
      { error: "Failed to fetch live score", detail: err.message },
      { status: 502 }
    );
  }
}

// ── Fetch all current matches and find IND vs NZ ──
async function fetchCurrentMatch() {
  const res = await fetch(
    `${BASE_URL}/currentMatches?apikey=${API_KEY}&offset=0`,
    { next: { revalidate: 30 } } // cache 30 seconds
  );

  if (!res.ok) throw new Error(`API returned ${res.status}`);
  const json = await res.json();

  if (json.status !== "success" || !json.data) {
    return NextResponse.json({ error: "No data from API", raw: json }, { status: 502 });
  }

  // Find the IND vs NZ match
  const match = json.data.find((m) => {
    const name = (m.name || "").toLowerCase();
    const teams = (m.teams || []).map((t) => t.toLowerCase());
    const isINDvsNZ =
      (name.includes("india") && name.includes("new zealand")) ||
      (teams.some((t) => t.includes("india")) && teams.some((t) => t.includes("new zealand")));
    return isINDvsNZ;
  });

  if (!match) {
    // Return all current matches so the frontend can display them
    const matchList = json.data.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      matchType: m.matchType,
    }));
    return NextResponse.json({
      error: "IND vs NZ match not found in current matches",
      hint: "The match may not have started yet, or try passing ?matchId=<id>",
      currentMatches: matchList,
    });
  }

  // Normalize the response for our frontend
  return NextResponse.json(normalizeMatch(match));
}

// ── Fetch scorecard for a specific match ──
async function fetchMatchScorecard(matchId) {
  const res = await fetch(
    `${BASE_URL}/match_scorecard?apikey=${API_KEY}&id=${matchId}`,
    { next: { revalidate: 30 } }
  );

  if (!res.ok) throw new Error(`Scorecard API returned ${res.status}`);
  const json = await res.json();

  if (json.status !== "success" || !json.data) {
    return NextResponse.json({ error: "No scorecard data", raw: json }, { status: 502 });
  }

  return NextResponse.json({
    ...normalizeMatch(json.data),
    scorecard: json.data.scorecard || [],
  });
}

// ── Normalize CricketData response into our frontend's expected shape ──
function normalizeMatch(match) {
  const scores = match.score || [];

  // Build inning strings: "India Inning 1: 185/4 (18.2)"
  const innings = scores.map(
    (s) => `${s.inning}: ${s.r || 0}/${s.w || 0} (${s.o || 0})`
  );

  // Try to extract current batting/bowling from scorecard
  let batterone = "", batsmanonerun = "", batsmanoneball = "";
  let battertwo = "", batsmantworun = "", batsmantwoball = "";
  let bowlerone = "", bowleronerun = "", bowleronewickers = "", bowleroneover = "";
  let bowlertwo = "", bowlertworun = "", bowlertwowickers = "", bowlertwoover = "";

  if (match.scorecard && match.scorecard.length > 0) {
    const lastInning = match.scorecard[match.scorecard.length - 1];
    const batting = lastInning?.batting || [];
    const bowling = lastInning?.bowling || [];

    const activeBats = batting.filter(
      (b) => !b.dismissal || b.dismissal === "not out"
    ).slice(-2);

    if (activeBats[0]) {
      batterone = activeBats[0].batsman?.name || "";
      batsmanonerun = String(activeBats[0].r || 0);
      batsmanoneball = `(${activeBats[0].b || 0})`;
    }
    if (activeBats[1]) {
      battertwo = activeBats[1].batsman?.name || "";
      batsmantworun = String(activeBats[1].r || 0);
      batsmantwoball = `(${activeBats[1].b || 0})`;
    }

    if (bowling.length >= 1) {
      const b = bowling[bowling.length - 1];
      bowlerone = b.bowler?.name || "";
      bowleronerun = String(b.r || 0);
      bowleronewickers = String(b.w || 0);
      bowleroneover = String(b.o || 0);
    }
    if (bowling.length >= 2) {
      const b = bowling[bowling.length - 2];
      bowlertwo = b.bowler?.name || "";
      bowlertworun = String(b.r || 0);
      bowlertwowickers = String(b.w || 0);
      bowlertwoover = String(b.o || 0);
    }
  }

  return {
    matchId: match.id,
    title: match.name || "India vs New Zealand",
    status: match.status || "",
    matchType: match.matchType || "t20",
    venue: match.venue || "",
    teams: match.teams || [],
    update: match.status || "",
    livescore: innings.join("  •  ") || "Match not started",
    runrate: scores.length > 0
      ? `CRR: ${calculateRunRate(scores[scores.length - 1])}`
      : "",
    innings: scores,
    batterone, batsmanonerun, batsmanoneball,
    battertwo, batsmantworun, batsmantwoball,
    bowlerone, bowleronerun, bowleronewickers, bowleroneover,
    bowlertwo, bowlertworun, bowlertwowickers, bowlertwoover,
    matchStarted: match.matchStarted || false,
    matchEnded: match.matchEnded || false,
  };
}

function calculateRunRate(inning) {
  if (!inning || !inning.o || inning.o === 0) return "0.00";
  return (inning.r / inning.o).toFixed(2);
}
