"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  INDIA_PLAYERS, NZ_PLAYERS, OVER_RANGES, POWERPLAY_RANGES,
  SIXES_RANGES, INDIVIDUAL_RANGES, WICKET_OVERS, POINTS,
  calculateScore, MAX_POSSIBLE,
} from "@/lib/constants";
import { Card, Badge, SectionTitle, SelectGrid, Toast } from "@/components/ui";
import LiveScore from "@/components/LiveScore";

export default function PredictPage() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState("");
  const [results, setResults] = useState(null);
  const [preds, setPreds] = useState({
    match_winner: "", top_scorer: "", player_of_match: "",
    total_sixes: "", first_wicket_over: "", powerplay_score: "",
    highest_individual: "", over_predictions: {},
  });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };
  const update = (key, val) => setPreds((p) => ({ ...p, [key]: val }));
  const updateOver = (ov, val) => setPreds((p) => ({ ...p, over_predictions: { ...p.over_predictions, [ov]: val } }));

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("predictor_name") : null;
    if (saved) { setName(saved); checkExisting(saved); }
    fetchResults();
  }, []);

  async function checkExisting(playerName) {
    const { data } = await supabase.from("predictions").select("*").eq("player_name", playerName).single();
    if (data) { setPreds(data); setJoined(true); setSubmitted(true); }
  }

  async function fetchResults() {
    const { data } = await supabase.from("match_results").select("*").eq("id", 1).single();
    if (data) setResults(data);
  }

  useEffect(() => {
    const channel = supabase.channel("results-updates")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_results" }, (payload) => setResults(payload.new))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  async function handleSubmit() {
    if (!name.trim()) { showToast("Enter your name!"); return; }
    if (!preds.match_winner) { showToast("Pick the match winner!"); return; }
    const row = {
      player_name: name.trim(), match_winner: preds.match_winner, top_scorer: preds.top_scorer,
      player_of_match: preds.player_of_match, total_sixes: preds.total_sixes,
      first_wicket_over: preds.first_wicket_over, powerplay_score: preds.powerplay_score,
      highest_individual: preds.highest_individual, over_predictions: preds.over_predictions,
      score: results ? calculateScore(preds, results) : 0,
    };
    const { error } = await supabase.from("predictions").upsert(row, { onConflict: "player_name" });
    if (error) { showToast("Error: " + error.message); return; }
    localStorage.setItem("predictor_name", name.trim());
    setSubmitted(true); setJoined(true); showToast("Predictions locked! 🏏");
  }

  // ─── SUBMITTED ───
  if (submitted) {
    return (
      <>
        <Toast message={toast} />
        <LiveScore />
        <Card team="ind" glow style={{ borderColor: "rgba(34,197,94,0.3)", textAlign: "center" }}>
          <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
          <h2 className="heading-teko" style={{ fontSize: 28, color: "#22c55e", margin: "0 0 8px" }}>PREDICTIONS LOCKED!</h2>
          <p style={{ color: "#7a8599", fontSize: 13, margin: "0 0 14px" }}>Your picks are in, {name}. Check the leaderboard!</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
            {preds.match_winner && <Badge color="#4ade80" bg="rgba(34,197,94,0.12)">Winner: {preds.match_winner}</Badge>}
            {preds.top_scorer && <Badge color="#60a5fa" bg="rgba(59,130,246,0.12)">Top: {preds.top_scorer}</Badge>}
            {preds.total_sixes && <Badge color="#c084fc" bg="rgba(168,85,247,0.12)">Sixes: {preds.total_sixes}</Badge>}
          </div>
          {results && results.match_winner && (
            <div style={{ marginTop: 20, padding: 16, background: "linear-gradient(135deg,rgba(255,107,0,0.08),rgba(255,107,0,0.02))", borderRadius: 14, border: "1px solid rgba(255,107,0,0.15)" }}>
              <div className="heading-teko" style={{ fontSize: 14, letterSpacing: 2, color: "#ff8a3d" }}>YOUR SCORE</div>
              <div className="heading-teko" style={{ fontSize: 52, color: "#FF6F00", lineHeight: 1.1 }}>{calculateScore(preds, results)}</div>
              <div style={{ fontSize: 11, color: "#4a5568" }}>out of {MAX_POSSIBLE}</div>
            </div>
          )}
        </Card>
      </>
    );
  }

  // ─── JOIN ───
  if (!joined) {
    return (
      <>
        <Toast message={toast} />
        <LiveScore />
        <Card team="ind" glow>
          <div style={{ textAlign: "center", padding: "12px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🏏</div>
            <h2 className="heading-teko" style={{ fontSize: 30, margin: "0 0 6px", background: "linear-gradient(90deg,#FF6F00,#fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              JOIN THE PREDICTION GAME
            </h2>
            <p style={{ color: "#7a8599", fontSize: 13, margin: "0 0 20px" }}>Pick your predictions. Compete on the live leaderboard!</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your display name"
              style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: "2px solid rgba(255,107,0,0.2)", background: "rgba(13,71,161,0.15)", color: "#fff", fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", textAlign: "center", fontWeight: 600 }} />
            <button onClick={() => { if (name.trim()) setJoined(true); else showToast("Enter a name!"); }}
              className="heading-teko" style={{ width: "100%", marginTop: 14, padding: "14px", borderRadius: 12, border: "none", fontSize: 22, letterSpacing: 2, cursor: "pointer", background: "linear-gradient(135deg,#FF6F00,#FF8F00)", color: "#fff", boxShadow: "0 4px 20px rgba(255,111,0,0.3)" }}>
              LET&apos;S GO 🚀
            </button>
          </div>
        </Card>
      </>
    );
  }

  // ─── PREDICTION FORM ───
  return (
    <>
      <Toast message={toast} />
      <LiveScore />

      <div style={{ marginBottom: 14, padding: "10px 16px", background: "linear-gradient(90deg,rgba(13,71,161,0.2),rgba(20,20,20,0.3))", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid rgba(255,107,0,0.1)" }}>
        <span style={{ fontSize: 13, color: "#ff8a3d", fontWeight: 700 }}>Playing as <span style={{ color: "#fff" }}>{name}</span></span>
        <Badge>Max {MAX_POSSIBLE} pts</Badge>
      </div>

      {/* Match Winner — Split Card */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={() => update("match_winner", "India")} style={{
          flex: 1, padding: "24px 16px", borderRadius: 16, cursor: "pointer", position: "relative", overflow: "hidden",
          border: preds.match_winner === "India" ? "2px solid #FF6F00" : "1px solid rgba(13,71,161,0.3)",
          background: preds.match_winner === "India" ? "linear-gradient(135deg,#0D47A1,#1565C0)" : "linear-gradient(135deg,rgba(13,71,161,0.15),rgba(13,71,161,0.05))",
          boxShadow: preds.match_winner === "India" ? "0 0 30px rgba(255,111,0,0.2)" : "none", transition: "all 0.2s",
        }}>
          <div className="stripe-ind" style={{ position: "absolute", inset: 0 }} />
          <div style={{ position: "relative", textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🇮🇳</div>
            <div className="heading-teko" style={{ fontSize: 26, color: "#fff" }}>INDIA</div>
            <Badge>50 pts</Badge>
          </div>
        </button>
        <button onClick={() => update("match_winner", "New Zealand")} style={{
          flex: 1, padding: "24px 16px", borderRadius: 16, cursor: "pointer", position: "relative", overflow: "hidden",
          border: preds.match_winner === "New Zealand" ? "2px solid #c0c0c0" : "1px solid rgba(192,192,192,0.15)",
          background: preds.match_winner === "New Zealand" ? "linear-gradient(135deg,#1a1a1a,#2a2a2a)" : "linear-gradient(135deg,rgba(30,30,30,0.6),rgba(20,20,20,0.3))",
          boxShadow: preds.match_winner === "New Zealand" ? "0 0 30px rgba(192,192,192,0.1)" : "none", transition: "all 0.2s",
        }}>
          <div style={{ position: "relative", textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🇳🇿</div>
            <div className="heading-teko" style={{ fontSize: 26, color: "#e0e0e0" }}>NEW ZEALAND</div>
            <Badge color="#c0c0c0" bg="rgba(192,192,192,0.15)">50 pts</Badge>
          </div>
        </button>
      </div>

      {/* Top Scorer */}
      <Card team="ind">
        <SectionTitle icon="🔥" title="Top Scorer" points={POINTS.topScorer} />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#FF6F00", letterSpacing: 2, marginBottom: 6 }}>🇮🇳 INDIA</div>
        <SelectGrid options={INDIA_PLAYERS} value={preds.top_scorer} onChange={(v) => update("top_scorer", v)} columns={2} />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#c0c0c0", letterSpacing: 2, margin: "12px 0 6px" }}>🇳🇿 NEW ZEALAND</div>
        <SelectGrid options={NZ_PLAYERS} value={preds.top_scorer} onChange={(v) => update("top_scorer", v)} columns={2} team="nz" />
      </Card>

      {/* Player of the Match */}
      <Card team="nz">
        <SectionTitle icon="⭐" title="Player of the Match" points={POINTS.playerOfMatch} team="nz" />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#FF6F00", letterSpacing: 2, marginBottom: 6 }}>🇮🇳 INDIA</div>
        <SelectGrid options={INDIA_PLAYERS} value={preds.player_of_match} onChange={(v) => update("player_of_match", v)} columns={2} />
        <div style={{ fontSize: 11, fontWeight: 800, color: "#c0c0c0", letterSpacing: 2, margin: "12px 0 6px" }}>🇳🇿 NEW ZEALAND</div>
        <SelectGrid options={NZ_PLAYERS} value={preds.player_of_match} onChange={(v) => update("player_of_match", v)} columns={2} team="nz" />
      </Card>

      {/* Fun Props */}
      <Card team="ind"><SectionTitle icon="6️⃣" title="Total Sixes" points={POINTS.totalSixes} />
        <SelectGrid options={SIXES_RANGES} value={preds.total_sixes} onChange={(v) => update("total_sixes", v)} columns={5} /></Card>

      <Card team="nz"><SectionTitle icon="🎳" title="First Wicket Over" points={POINTS.firstWicketOver} team="nz" />
        <SelectGrid options={WICKET_OVERS} value={preds.first_wicket_over} onChange={(v) => update("first_wicket_over", v)} columns={4} team="nz" /></Card>

      <Card team="ind"><SectionTitle icon="⚡" title="Powerplay Score (1st Inn)" points={POINTS.powerplayScore} />
        <SelectGrid options={POWERPLAY_RANGES} value={preds.powerplay_score} onChange={(v) => update("powerplay_score", v)} columns={3} /></Card>

      <Card team="nz"><SectionTitle icon="💯" title="Highest Individual Score" points={POINTS.highestIndividual} team="nz" />
        <SelectGrid options={INDIVIDUAL_RANGES} value={preds.highest_individual} onChange={(v) => update("highest_individual", v)} columns={3} team="nz" /></Card>

      {/* Over-by-Over */}
      <Card team="ind">
        <SectionTitle icon="📊" title="Over-by-Over (1st Inn)" points={POINTS.overPrediction} />
        <p style={{ color: "#5a6577", fontSize: 11, margin: "0 0 10px" }}>{POINTS.overPrediction} pts per correct over!</p>
        <div style={{ maxHeight: 380, overflowY: "auto", paddingRight: 6 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span className="heading-teko" style={{ fontSize: 15, color: i < 6 ? "#FF6F00" : "#7a8599", minWidth: 52 }}>
                {i < 6 ? "⚡" : ""} Ov {i + 1}
              </span>
              <div style={{ display: "flex", gap: 3, flex: 1 }}>
                {OVER_RANGES.map((r) => (
                  <button key={r} onClick={() => updateOver(String(i + 1), r)}
                    className={`select-btn ${preds.over_predictions?.[String(i + 1)] === r ? "active-ind" : ""}`}
                    style={{ flex: 1, padding: "5px 2px", fontSize: 10 }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Submit */}
      <button onClick={handleSubmit} className="heading-teko" style={{
        width: "100%", padding: "18px", borderRadius: 16, border: "none",
        fontSize: 24, letterSpacing: 3, cursor: "pointer",
        background: "linear-gradient(135deg,#FF6F00,#FF8F00,#FF6F00)", color: "#fff",
        boxShadow: "0 6px 30px rgba(255,111,0,0.35)", marginBottom: 30,
      }}>
        🔒 LOCK IN PREDICTIONS
      </button>
    </>
  );
}
