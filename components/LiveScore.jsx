"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

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
    const interval = setInterval(fetchScore, 30000);
    return () => { supabase.removeChannel(channel); clearInterval(interval); };
  }, []);

  async function fetchScore() {
    try {
      const { data } = await supabase.from("live_score").select("data, fetched_at").eq("id", 1).single();
      if (data?.data && Object.keys(data.data).length > 1) {
        setScore(data.data);
      }
    } catch (e) {}
    setLoading(false);
  }

  if (loading) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 12, textAlign: "center" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>📡 Connecting to live scores...</div>
      </div>
    );
  }

  if (!score) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 12, textAlign: "center" }}>
        <div style={{ color: "#64748b", fontSize: 13 }}>📡 Waiting for the match to start...</div>
      </div>
    );
  }

  // ── Parse scores from ANY format ──
  const scoreLines = [];
  const scores = score.scores || [];
  const defaultTeams = ["🇮🇳 INDIA", "🇳🇿 NZ"];

  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];

    // Get team name - try multiple fields
    let team = s.team || s.inning || "";
    const teamLower = team.toLowerCase();

    let teamLabel;
    if (teamLower.includes("india") || teamLower === "ind") teamLabel = "🇮🇳 INDIA";
    else if (teamLower.includes("new zealand") || teamLower.includes("nz")) teamLabel = "🇳🇿 NZ";
    else teamLabel = defaultTeams[i] || `Team ${i + 1}`; // Fallback: assign based on position

    // Get score display
    let display = "";
    if (typeof s.score === "string" && s.score.length > 0) {
      display = s.score; // ESPN: "136/1 (10.5/20 ov)"
    } else if (s.r !== undefined) {
      display = `${s.r || 0}/${s.w || 0} (${s.o || 0} ov)`; // CricketData
    }

    // Only show if there's an actual score to display
    if (display) {
      const isIndia = teamLabel.includes("INDIA");
      scoreLines.push({ team: teamLabel, display, isIndia });
    }
  }

  // Calculate run rate from last valid score
  let crr = null;
  for (const s of [...scores].reverse()) {
    if (s.o && s.r) {
      crr = (s.r / s.o).toFixed(2);
      break;
    }
    if (typeof s.score === "string" && s.score.length > 0) {
      const m = s.score.match(/(\d+)\/\d+\s*\((\d+\.?\d*)/);
      if (m) { crr = (parseInt(m[1]) / parseFloat(m[2])).toFixed(2); break; }
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
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4444", display: "inline-block", animation: "livePulse 1.5s infinite" }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: "#FCA5A5", fontFamily: "'Teko',sans-serif" }}>LIVE</span>
        </div>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", maxWidth: 200, textAlign: "right" }}>{score.status || ""}</span>
      </div>

      {/* Title */}
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 16, fontWeight: 700, color: "#FF8F00", marginBottom: 10 }}>
        {score.title || "India vs New Zealand"}
      </div>

      {/* Scores */}
      {scoreLines.length > 0 ? (
        scoreLines.map((s, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 6,
            padding: "8px 12px", borderRadius: 10,
            background: s.isIndia ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", minWidth: 70, fontFamily: "'Teko',sans-serif", letterSpacing: 1 }}>{s.team}</span>
            <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{s.display}</span>
          </div>
        ))
      ) : (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, textAlign: "center", padding: 8 }}>
          Match in progress...
        </div>
      )}

      {crr && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Run Rate: {crr}</div>}

      {/* Match ended */}
      {score.matchEnded && (
        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(22,163,106,0.15)", border: "1px solid rgba(22,163,106,0.3)", borderRadius: 10, textAlign: "center" }}>
          <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 13 }}>{score.status}</div>
        </div>
      )}

      <style>{`@keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
