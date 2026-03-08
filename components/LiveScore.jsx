"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const C = {
  indBlue: "#0D47A1", indBluePale: "#E3F2FD", indBlueSoft: "#BBDEFB",
  indOrange: "#FF6F00", indOrangePale: "#FFF3E0",
  nzBlack: "#1a1a1a", nzPale: "#F5F5F5",
  white: "#FFFFFF", text: "#1a1a2e", textMuted: "#64748b", textDim: "#94a3b8",
  border: "#e2e8f0", green: "#16a34a", greenPale: "#dcfce7",
};

export default function LiveScore() {
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScore();
    const channel = supabase
      .channel("live-score-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "live_score" },
        (payload) => { if (payload.new?.data) setScore(payload.new.data); }
      ).subscribe();
    const interval = setInterval(fetchScore, 30000); // Poll every 30s
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  async function fetchScore() {
    const { data } = await supabase.from("live_score").select("data, fetched_at").eq("id", 1).single();
    if (data?.data && (data.data.matchStarted || data.data.title || data.data.matchId)) {
      setScore(data.data);
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12, textAlign: "center" }}>
        <div style={{ color: C.textMuted, fontSize: 13 }}>📡 Connecting to live scores...</div>
      </div>
    );
  }

  if (!score || (!score.matchStarted && !score.title)) {
    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12, textAlign: "center" }}>
        <div style={{ color: C.textMuted, fontSize: 13 }}>📡 Waiting for the match to start...</div>
        <div style={{ color: C.textDim, fontSize: 11, marginTop: 4 }}>Live scores auto-update every 2 minutes.</div>
      </div>
    );
  }

  // ── Parse scores from different API formats ──
  const scoreLines = [];
  const scores = score.scores || [];

  for (const s of scores) {
    if (s.team && s.score) {
      // ESPN format: { team: "India", score: "92/0 (5.5/20 ov)" }
      const teamShort = s.team.toLowerCase().includes("india") ? "🇮🇳 IND" :
                        s.team.toLowerCase().includes("new zealand") ? "🇳🇿 NZ" : s.team;
      scoreLines.push({ team: teamShort, display: s.score });
    } else if (s.inning) {
      // CricketData format: { inning: "India Inning 1", r: 92, w: 0, o: 5.5 }
      const teamShort = (s.inning || "").toLowerCase().includes("india") ? "🇮🇳 IND" : "🇳🇿 NZ";
      scoreLines.push({ team: teamShort, display: `${s.r || 0}/${s.w || 0} (${s.o || 0} ov)` });
    }
  }

  // Calculate run rate from the last score
  let crr = null;
  const lastScore = scores[scores.length - 1];
  if (lastScore) {
    if (lastScore.o && lastScore.r) {
      crr = (lastScore.r / lastScore.o).toFixed(2);
    } else if (lastScore.score) {
      // Try parsing "92/0 (5.5/20 ov)"
      const m = (lastScore.score || "").match(/(\d+)\/\d+\s*\((\d+\.?\d*)\/\d+/);
      if (m) crr = (parseInt(m[1]) / parseFloat(m[2])).toFixed(2);
    }
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, #0D47A1, #1565C0)",
      border: "2px solid #FF6F00",
      borderRadius: 14, padding: "16px 20px", marginBottom: 12,
      boxShadow: "0 4px 20px rgba(13,71,161,0.2)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", animation: "pulse 1.5s infinite", display: "inline-block" }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "#FCA5A5", textTransform: "uppercase", fontFamily: "'Teko',sans-serif" }}>LIVE</span>
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{score.status || ""}</span>
      </div>

      {/* Title */}
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 16, fontWeight: 700, color: "#FF8F00", marginBottom: 8 }}>
        {score.title || "India vs New Zealand"}
      </div>

      {/* Scores */}
      {scoreLines.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.7)", minWidth: 55 }}>{s.team}</span>
          <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 28, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{s.display}</span>
        </div>
      ))}

      {crr && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Run Rate: {crr}</div>}

      {/* Match ended */}
      {score.matchEnded && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(22,163,106,0.15)", border: "1px solid rgba(22,163,106,0.3)", borderRadius: 10, textAlign: "center" }}>
          <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 13 }}>{score.status}</div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
