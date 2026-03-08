"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { POINTS, calculateScore } from "@/lib/constants";
import LiveScore from "@/components/LiveScore";

const C = {
  indBlue: "#0D47A1", indBlueLight: "#1565C0", indBluePale: "#E3F2FD", indBlueSoft: "#BBDEFB",
  indOrange: "#FF6F00", indOrangePale: "#FFF3E0",
  nzBlack: "#1a1a1a", nzPale: "#F5F5F5",
  white: "#FFFFFF", text: "#1a1a2e", textMuted: "#64748b", textDim: "#94a3b8",
  border: "#e2e8f0", borderLight: "#f1f5f9",
  green: "#16a34a", greenPale: "#dcfce7", purple: "#7c3aed", purplePale: "#ede9fe",
  gold: "#D97706", goldPale: "#FEF3C7", goldBright: "#F59E0B",
};

const BADGE_DEFS = [
  { id: "oracle", icon: "🔮", name: "Oracle", desc: "5+ right", check: s => s.correct >= 5 },
  { id: "sharpshooter", icon: "🎯", name: "Sharpshooter", desc: "Winner + top scorer", check: s => s.matchWinner && s.topScorer },
  { id: "underdog", icon: "🐺", name: "Underdog King", desc: "Picked NZ & correct", check: s => s.pickedNZ && s.matchWinner },
  { id: "sixsense", icon: "6️⃣", name: "Six Sense", desc: "Nailed sixes", check: s => s.totalSixes },
  { id: "overmaster", icon: "📊", name: "Over Master", desc: "5+ overs right", check: s => s.oversCorrect >= 5 },
  { id: "allrounder", icon: "⭐", name: "All-Rounder", desc: "All right", check: s => s.correct >= 7 },
  { id: "highroller", icon: "🎰", name: "High Roller", desc: "3× correct", check: s => s.highRollerHit },
  { id: "sweeper", icon: "🧹", name: "Clean Sweep", desc: "300+ pts", check: s => s.totalScore >= 300 },
];

function getBadges(p, r) {
  if (!r || !p) return [];
  const boosts = p.over_predictions?._boosts || {};
  const st = { correct: 0, matchWinner: false, topScorer: false, totalSixes: false, pickedNZ: p.match_winner === "New Zealand", oversCorrect: 0, highRollerHit: false, totalScore: p.score || 0 };
  if (r.match_winner && p.match_winner === r.match_winner) { st.correct++; st.matchWinner = true; }
  if (r.top_scorer_india && p.top_scorer_india === r.top_scorer_india) { st.correct++; st.topScorer = true; }
  if (r.top_scorer_nz && p.top_scorer_nz === r.top_scorer_nz) { st.correct++; st.topScorer = true; }
  if (r.top_wicket_india && p.top_wicket_india === r.top_wicket_india) st.correct++;
  if (r.top_wicket_nz && p.top_wicket_nz === r.top_wicket_nz) st.correct++;
  if (r.most_catches && p.most_catches === r.most_catches) st.correct++;
  if (r.total_sixes && p.total_sixes === r.total_sixes) { st.correct++; st.totalSixes = true; }
  if (r.total_sixes && p.total_sixes === r.total_sixes) { st.correct++; st.totalSixes = true; }
  if (r.first_wicket_over && p.first_wicket_over === r.first_wicket_over) st.correct++;
  if (r.powerplay_score && p.powerplay_score === r.powerplay_score) st.correct++;
  if (r.highest_individual && p.highest_individual === r.highest_individual) st.correct++;
  const overResults = r.over_results || {};
  const overPreds = p.over_predictions || {};
  for (const ov of Object.keys(overResults)) { if (overPreds[ov] && overPreds[ov] === overResults[ov]) st.oversCorrect++; }
  const cf = ["match_winner", "top_scorer_india", "top_scorer_nz", "top_wicket_india", "top_wicket_nz", "most_catches", "total_sixes", "first_wicket_over", "powerplay_score", "highest_individual"];
  for (const f of cf) { if ((boosts[f] || 1) === 3 && r[f] && p[f] === r[f]) st.highRollerHit = true; }
  return BADGE_DEFS.filter(b => b.check(st));
}

// ── CONFETTI ──
function Confetti() {
  const colors = ["#FF6F00", "#0D47A1", "#FFD700", "#E3F2FD", "#16a34a", "#7c3aed", "#ef4444", "#1a1a1a"];
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
    type: Math.random() > 0.5 ? "circle" : "rect",
  }));
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 100, overflow: "hidden" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", left: `${p.left}%`, top: -20,
          width: p.type === "circle" ? p.size : p.size * 0.6,
          height: p.size,
          background: p.color,
          borderRadius: p.type === "circle" ? "50%" : "2px",
          transform: `rotate(${p.rotation}deg)`,
          animation: `confettiFall ${p.duration}s ${p.delay}s ease-in infinite`,
          opacity: 0.9,
        }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── SHAREABLE WINNER CARD ──
function WinnerCard({ winner, rank, results, badges }) {
  const cardRef = useRef(null);
  const isInd = winner.match_winner === "India";

  return (
    <div style={{ marginBottom: 16 }}>
      <div ref={cardRef} style={{
        background: `linear-gradient(135deg, ${isInd ? "#0D47A1" : "#1a1a1a"} 0%, ${isInd ? "#1565C0" : "#333"} 50%, ${isInd ? "#0a3d8f" : "#1a1a1a"} 100%)`,
        borderRadius: 20, padding: 28, position: "relative", overflow: "hidden",
        border: `3px solid ${isInd ? "#FF6F00" : "#c0c0c0"}`,
        boxShadow: `0 8px 40px ${isInd ? "rgba(13,71,161,0.3)" : "rgba(0,0,0,0.3)"}`,
      }}>
        {/* Jersey stripe pattern */}
        <div style={{ position: "absolute", inset: 0, background: isInd ? "repeating-linear-gradient(90deg,rgba(255,255,255,0.04) 0px,rgba(255,255,255,0.04) 3px,transparent 3px,transparent 14px)" : "repeating-linear-gradient(-45deg,rgba(255,255,255,0.03) 0px,rgba(255,255,255,0.03) 1px,transparent 1px,transparent 20px)" }} />

        {/* Top label */}
        <div style={{ position: "relative", textAlign: "center" }}>
          <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginBottom: 4 }}>
            T20 WORLD CUP 2026 • FINAL
          </div>
          <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 16, letterSpacing: 3, color: isInd ? "#FF8F00" : "#c0c0c0", fontWeight: 700, marginBottom: 12 }}>
            🏏 PREDICTION CHAMPION 🏆
          </div>

          {/* Trophy */}
          <div style={{ fontSize: 64, marginBottom: 8, filter: "drop-shadow(0 4px 12px rgba(255,215,0,0.4))" }}>
            {rank === 0 ? "🥇" : rank === 1 ? "🥈" : "🥉"}
          </div>

          {/* Winner Name */}
          <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 42, fontWeight: 700, color: "#fff", lineHeight: 1, marginBottom: 4, textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}>
            {winner.player_name}
          </div>

          {/* Score */}
          <div style={{ display: "inline-block", background: "rgba(255,255,255,0.15)", borderRadius: 16, padding: "8px 24px", marginBottom: 12, backdropFilter: "blur(8px)" }}>
            <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 36, fontWeight: 700, color: "#FFD700", letterSpacing: 2 }}>{winner.score}</span>
            <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 16, color: "rgba(255,255,255,0.7)", marginLeft: 6 }}>POINTS</span>
          </div>

          {/* Picks */}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {winner.match_winner && (
              <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "4px 12px", fontSize: 11, color: "#fff", fontWeight: 700 }}>
                {winner.match_winner === "India" ? "🇮🇳" : "🇳🇿"} {winner.match_winner}
              </div>
            )}
            {winner.top_scorer_india && (
              <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "4px 12px", fontSize: 11, color: "#fff", fontWeight: 700 }}>
                🇮🇳 🔥 {winner.top_scorer_india}
              </div>
            )}
            {winner.top_scorer_nz && (
              <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: 10, padding: "4px 12px", fontSize: 11, color: "#fff", fontWeight: 700 }}>
                🇳🇿 🔥 {winner.top_scorer_nz}
              </div>
            )}
          </div>

          {/* Badges */}
          {badges.length > 0 && (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
              {badges.map(b => (
                <div key={b.id} style={{ background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 10, padding: "6px 10px", textAlign: "center" }}>
                  <span style={{ fontSize: 18 }}>{b.icon}</span>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#FFD700", marginTop: 1 }}>{b.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* Footer */}
          <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.35)", marginTop: 8 }}>
            IND 🇮🇳 VS 🇳🇿 NZ • 8 MARCH 2026
          </div>
        </div>
      </div>

      {/* Screenshot hint */}
      <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: C.textMuted }}>
        📸 Screenshot this card and share on Instagram/WhatsApp!
      </div>
    </div>
  );
}

// ── CELEBRATION HEADER ──
function CelebrationBanner({ winner, matchWinner }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #FEF3C7, #FFF7ED, #FEF3C7)",
      border: "2px solid #F59E0B",
      borderRadius: 16, padding: "20px 24px", marginBottom: 16, textAlign: "center",
      boxShadow: "0 4px 20px rgba(245,158,11,0.15)",
    }}>
      <div style={{ fontSize: 48, marginBottom: 4 }}>🎉🏆🎉</div>
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 14, letterSpacing: 3, color: C.gold, fontWeight: 700, marginBottom: 4 }}>
        MATCH OVER • {matchWinner?.toUpperCase()} WINS!
      </div>
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 32, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
        🏆 {winner.player_name} is the Prediction Champion!
      </div>
      <div style={{ fontSize: 13, color: C.textMuted, marginTop: 6 }}>
        Scored <strong style={{ color: C.gold, fontSize: 18 }}>{winner.score}</strong> points
      </div>
    </div>
  );
}

// ── PODIUM ──
function Podium({ entries }) {
  if (entries.length < 2) return null;
  const top3 = entries.slice(0, Math.min(3, entries.length));
  const medals = ["🥇", "🥈", "🥉"];
  const heights = [140, 110, 90];
  const order = entries.length >= 3 ? [1, 0, 2] : [1, 0]; // 2nd, 1st, 3rd

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 8, marginBottom: 20, padding: "0 20px" }}>
      {order.map((idx) => {
        const e = top3[idx];
        if (!e) return null;
        const isFirst = idx === 0;
        const isInd = e.match_winner === "India";
        return (
          <div key={e.player_name} style={{ flex: 1, maxWidth: 140, textAlign: "center" }}>
            <div style={{ fontSize: isFirst ? 40 : 28, marginBottom: 6 }}>{medals[idx]}</div>
            <div style={{
              background: isFirst
                ? `linear-gradient(180deg, ${C.goldPale}, #FFF7ED)`
                : idx === 1 ? C.indBluePale : C.nzPale,
              border: isFirst ? "2px solid #F59E0B" : `1px solid ${C.border}`,
              borderRadius: "14px 14px 0 0",
              height: heights[idx],
              display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
              padding: "12px 8px",
              boxShadow: isFirst ? "0 4px 16px rgba(245,158,11,0.2)" : "none",
            }}>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: isFirst ? 20 : 16, fontWeight: 700, color: C.text, lineHeight: 1.1 }}>
                {e.player_name}
              </div>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: isFirst ? 32 : 24, fontWeight: 700, color: isFirst ? C.gold : C.indBlue, lineHeight: 1 }}>
                {e.score}
              </div>
              <div style={{ fontSize: 9, color: C.textMuted }}>
                {isInd ? "🇮🇳" : "🇳🇿"} {e.match_winner || ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══ MAIN LEADERBOARD PAGE ═══
export default function LeaderboardPage() {
  const [entries, setEntries] = useState([]);
  const [results, setResults] = useState(null);
  const [myName, setMyName] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setMyName(typeof window !== "undefined" ? localStorage.getItem("predictor_name") || "" : "");
    fetchAll();
  }, []);

  async function fetchAll() {
    const [{ data: preds }, { data: res }] = await Promise.all([
      supabase.from("predictions").select("*"),
      supabase.from("match_results").select("*").eq("id", 1).single(),
    ]);
    if (res) setResults(res);
    if (preds) {
      const scored = preds.map(p => ({ ...p, score: res ? calculateScore(p, res) : p.score }));
      scored.sort((a, b) => b.score - a.score);
      setEntries(scored);
      // Show confetti if match ended and we have a winner
      if (res && res.match_winner && scored.length > 0) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 10000); // Stop after 10s
      }
    }
  }

  useEffect(() => {
    const ch = supabase.channel("lb-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "predictions" }, () => fetchAll())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_results" }, () => fetchAll())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const matchEnded = results && results.match_winner;
  const winner = entries.length > 0 ? entries[0] : null;
  const winnerBadges = winner && results ? getBadges(winner, results) : [];

  return (
    <div>
      {showConfetti && <Confetti />}
      <LiveScore />

      {/* ── WINNER CELEBRATION (only after match ends) ── */}
      {matchEnded && winner && (
        <>
          <CelebrationBanner winner={winner} matchWinner={results.match_winner} />
          <WinnerCard winner={winner} rank={0} results={results} badges={winnerBadges} />
          <Podium entries={entries} />
        </>
      )}

      {/* ── FULL LEADERBOARD ── */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.indBlue}`, borderRadius: 14, padding: 20, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontFamily: "'Teko',sans-serif", fontSize: 26, margin: "0 0 4px", color: C.indBlue }}>
          {matchEnded ? "📊 FINAL STANDINGS" : "🏆 LIVE LEADERBOARD"}
        </h2>
        <p style={{ color: C.textMuted, fontSize: 11, margin: "0 0 12px" }}>
          {matchEnded ? `${results.match_winner} won the match!` : entries.length > 0 ? "Scores update in real-time" : "Waiting for predictions..."}
        </p>

        {entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: C.textDim }}>
            <div style={{ fontSize: 44, marginBottom: 6 }}>👻</div>
            <div>No predictions yet. Be the first!</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {entries.map((entry, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
              const isMe = entry.player_name === myName;
              const isInd = entry.match_winner === "India";
              const badges = matchEnded ? getBadges(entry, results) : [];
              const pups = entry.over_predictions?._powerups || [];

              return (
                <div key={entry.player_name} style={{
                  padding: "12px 14px", borderRadius: 12,
                  background: isMe ? (i === 0 && matchEnded ? C.goldPale : C.indBluePale) : isInd ? "#F0F7FF" : C.nzPale,
                  border: isMe ? `2px solid ${i === 0 && matchEnded ? C.goldBright : C.indBlue}` : `1px solid ${C.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: i < 3 ? 24 : 13, fontWeight: 700, color: C.textMuted, minWidth: 30, textAlign: "center" }}>{medal}</span>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14, color: isMe ? C.indBlue : C.text }}>
                          {entry.player_name}
                          {isMe && <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 3 }}>(you)</span>}
                          {i === 0 && matchEnded && <span style={{ marginLeft: 4 }}>👑</span>}
                        </div>
                        <div style={{ fontSize: 9, color: C.textMuted, display: "flex", gap: 4, marginTop: 1, alignItems: "center", flexWrap: "wrap" }}>
                          {entry.match_winner && <span>{isInd ? "🇮🇳" : "🇳🇿"}</span>}
                          {pups.length > 0 && <span>🔋×{pups.length}</span>}
                          {badges.map(b => <span key={b.id} title={b.desc} style={{ cursor: "help" }}>{b.icon}</span>)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 28, fontWeight: 700, color: entry.score > 0 ? C.green : C.textDim, lineHeight: 1 }}>{entry.score || 0}</div>
                      <div style={{ fontSize: 8, color: C.textMuted, fontWeight: 700, letterSpacing: 1 }}>PTS</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── RESULTS PANEL ── */}
      {matchEnded && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.nzBlack}`, borderRadius: 14, padding: 20, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 20, color: C.nzBlack, margin: "0 0 10px" }}>📋 MATCH RESULTS</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {results.match_winner && <span style={{ background: C.greenPale, color: C.green, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🏆 {results.match_winner}</span>}
            {results.top_scorer_india && <span style={{ background: C.indBluePale, color: C.indBlue, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🇮🇳 🔥 {results.top_scorer_india}</span>}
            {results.top_scorer_nz && <span style={{ background: C.nzPale, color: C.nzBlack, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🇳🇿 🔥 {results.top_scorer_nz}</span>}
            {results.top_wicket_india && <span style={{ background: C.indOrangePale, color: C.indOrange, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🇮🇳 🎳 {results.top_wicket_india}</span>}
            {results.top_wicket_nz && <span style={{ background: C.nzPale, color: C.nzBlack, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🇳🇿 🎳 {results.top_wicket_nz}</span>}
            {results.most_catches && <span style={{ background: C.purplePale, color: C.purple, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🧤 {results.most_catches}</span>}
            {results.total_sixes && <span style={{ background: "#FCE7F3", color: "#DB2777", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>6️⃣ {results.total_sixes} sixes</span>}
            {results.first_wicket_over && <span style={{ background: C.indOrangePale, color: C.indOrange, padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800 }}>🎳 Over {results.first_wicket_over}</span>}
          </div>
        </div>
      )}

      {/* ── POINTS BREAKDOWN ── */}
      <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
        <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 18, color: C.indBlue, margin: "0 0 10px" }}>📊 POINTS BREAKDOWN</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
          {Object.entries(POINTS).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <div style={{ fontSize: 12, color: C.textMuted, padding: "3px 0" }}>{k.replace(/([A-Z])/g, " $1").trim()}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.indBlue, padding: "3px 0", textAlign: "right" }}>{v} pts</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRIZES ── */}
      {matchEnded && entries.length >= 2 && (
        <div style={{ background: C.goldPale, border: "2px solid #F59E0B", borderRadius: 14, padding: 20, marginTop: 12 }}>
          <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 20, color: C.gold, margin: "0 0 12px", textAlign: "center" }}>🎁 PRIZES</h3>
          
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, background: C.white, borderRadius: 12, padding: "12px 16px", border: "1px solid #FDE68A" }}>
            <span style={{ fontSize: 32 }}>🥇</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{entries[0].player_name}</div>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>Gets treated to dinner by last place! 🍽️</div>
            </div>
          </div>

          {entries.length >= 2 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, background: C.white, borderRadius: 12, padding: "12px 16px", border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 32 }}>🥈</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{entries[1].player_name}</div>
                <div style={{ fontSize: 12, color: C.indBlue, fontWeight: 700 }}>Honorary &quot;Cricket Expert&quot; title! 🏅</div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#FEE2E2", borderRadius: 12, padding: "12px 16px", border: "1px solid #FECACA" }}>
            <span style={{ fontSize: 32 }}>😬</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#DC2626" }}>{entries[entries.length - 1].player_name}</div>
              <div style={{ fontSize: 12, color: "#991B1B", fontWeight: 700 }}>You&apos;re buying dinner for {entries[0].player_name}! 🍕</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
