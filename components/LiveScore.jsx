"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card } from "./ui";

// LiveScore reads from Supabase's `live_score` table.
// The auto-sync cron job writes fresh data there every 3 minutes.
// This component also subscribes to real-time updates.
// Result: ZERO external API calls from the browser.

export default function LiveScore() {
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScore();

    // Subscribe to real-time updates
    const channel = supabase
      .channel("live-score-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "live_score" },
        (payload) => {
          if (payload.new?.data) {
            setScore(payload.new.data);
          }
        }
      )
      .subscribe();

    // Also poll every 60s as a fallback
    const interval = setInterval(fetchScore, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  async function fetchScore() {
    const { data } = await supabase
      .from("live_score")
      .select("data, fetched_at")
      .eq("id", 1)
      .single();

    if (data?.data && data.data.matchId) {
      setScore(data.data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <Card className="text-center">
        <div className="text-slate-500 text-sm">📡 Connecting to live scores...</div>
      </Card>
    );
  }

  if (!score || !score.matchStarted) {
    return (
      <Card className="border-slate-700 text-center">
        <div className="text-slate-500 text-sm">📡 Waiting for the match to start...</div>
        <div className="text-xs text-slate-600 mt-1">
          Live scores auto-update every 3 minutes once the match begins.
        </div>
      </Card>
    );
  }

  // Build display strings from the scores array
  const innings = (score.scores || []).map(
    (s) => `${shortenInning(s.inning)}: ${s.r || 0}/${s.w || 0} (${s.o || 0} ov)`
  );

  const lastInning = (score.scores || []).slice(-1)[0];
  const crr = lastInning && lastInning.o > 0
    ? (lastInning.r / lastInning.o).toFixed(2)
    : null;

  // Extract batter/bowler info from scorecard if available
  const sc = score.scorecard || [];
  const lastSc = sc.length > 0 ? sc[sc.length - 1] : null;
  const activeBatters = lastSc?.batting
    ?.filter((b) => !b.dismissal || b.dismissal === "not out" || b.dismissal === "batting")
    .slice(-2) || [];
  const recentBowlers = (lastSc?.bowling || []).slice(-2);

  return (
    <Card className="border-amber-500/20 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <span className="text-xs font-bold tracking-widest text-red-400 uppercase">LIVE</span>
        </div>
        <span className="text-xs text-slate-500">{score.status}</span>
      </div>

      {/* Title */}
      <div className="text-lg font-extrabold text-amber-400 mb-2">
        {score.title || "India vs New Zealand"}
      </div>

      {/* Scores */}
      <div className="space-y-1 mb-3">
        {innings.map((inn, i) => (
          <div key={i} className="text-xl font-black text-white">{inn}</div>
        ))}
      </div>

      {crr && <div className="text-xs text-slate-400 mb-4">Run Rate: {crr}</div>}

      {/* Batters */}
      {activeBatters.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          {activeBatters.map((b, i) => (
            <div key={i} className="bg-white/5 rounded-lg p-3">
              <div className="text-sm font-bold text-slate-200 truncate">
                {b.batsman?.name || b.batsman || "—"}
              </div>
              <div className="text-amber-400 font-bold">
                {b.r || 0}
                <span className="text-xs text-slate-500 ml-1">({b.b || 0})</span>
              </div>
              <div className="text-[10px] text-slate-500">
                {b["4s"] || 0} fours • {b["6s"] || 0} sixes
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bowlers */}
      {recentBowlers.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {recentBowlers.map((b, i) => (
            <div key={i} className="bg-white/5 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">Bowling</div>
              <div className="text-sm font-bold text-slate-200 truncate">
                {b.bowler?.name || b.bowler || "—"}
              </div>
              <div className="text-xs text-slate-400">
                {b.r || 0}/{b.w || 0} ({b.o || 0} ov) • Econ {b.o > 0 ? (b.r / b.o).toFixed(1) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Match ended banner */}
      {score.matchEnded && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
          <div className="text-green-400 font-bold text-sm">{score.status}</div>
        </div>
      )}
    </Card>
  );
}

function shortenInning(inning) {
  if (!inning) return "";
  return inning
    .replace("Inning 1", "1st Inn")
    .replace("Inning 2", "2nd Inn");
}
