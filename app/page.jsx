"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  INDIA_PLAYERS, NZ_PLAYERS, OVER_RANGES, POWERPLAY_RANGES,
  SIXES_RANGES, INDIVIDUAL_RANGES, WICKET_OVERS, POINTS,
  calculateScore, MAX_POSSIBLE,
} from "@/lib/constants";
import LiveScore from "@/components/LiveScore";

// ── TIMINGS ──
const TOSS_TIME = new Date("2026-03-08T18:30:00+05:30");

// ── COLORS ──
const C = {
  indBlue: "#0D47A1", indBlueLight: "#1565C0", indBluePale: "#E3F2FD", indBlueSoft: "#BBDEFB",
  indOrange: "#FF6F00", indOrangePale: "#FFF3E0",
  nzBlack: "#1a1a1a", nzPale: "#F5F5F5",
  white: "#FFFFFF", text: "#1a1a2e", textMuted: "#64748b", textDim: "#94a3b8",
  border: "#e2e8f0", borderLight: "#f1f5f9",
  green: "#16a34a", greenPale: "#dcfce7", purple: "#7c3aed", purplePale: "#ede9fe",
};

// ── CONFIDENCE ──
const MAX_BOOST_BUDGET = 5;

// ── POWER-UPS ──
const POWERUP_DEFS = [
  { id: "double_down", icon: "⚡", name: "Double Down", desc: "2× points on one category" },
  { id: "swap", icon: "🔄", name: "Mid-Match Swap", desc: "Change ONE pick after toss (before Ov 5)" },
  { id: "insurance", icon: "🛡️", name: "Insurance", desc: "Wrong winner? Get 25 pts back" },
];

// ── BADGES ──
const BADGE_DEFS = [
  { id: "oracle", icon: "🔮", name: "Oracle", desc: "5+ predictions right" },
  { id: "sharpshooter", icon: "🎯", name: "Sharpshooter", desc: "Winner + top scorer correct" },
  { id: "underdog", icon: "🐺", name: "Underdog King", desc: "Picked NZ & was right" },
  { id: "sixsense", icon: "6️⃣", name: "Six Sense", desc: "Nailed total sixes" },
  { id: "overmaster", icon: "📊", name: "Over Master", desc: "5+ overs correct" },
  { id: "allrounder", icon: "⭐", name: "All-Rounder", desc: "All categories correct" },
  { id: "highroller", icon: "🎰", name: "High Roller", desc: "3× on a correct pick" },
  { id: "sweeper", icon: "🧹", name: "Clean Sweep", desc: "300+ total points" },
];

// ── Boosted score calculator ──
function calcBoostedScore(p, r) {
  if (!r || !p) return 0;
  const boosts = p.over_predictions?._boosts || {};
  const powerups = p.over_predictions?._powerups || [];
  const ddField = p.over_predictions?._doubleDownField || "";
  let s = 0;
  let winnerCorrect = false;
  const fields = [
    ["match_winner", POINTS.matchWinner], ["top_scorer", POINTS.topScorer],
    ["player_of_match", POINTS.playerOfMatch], ["total_sixes", POINTS.totalSixes],
    ["first_wicket_over", POINTS.firstWicketOver], ["powerplay_score", POINTS.powerplayScore],
    ["highest_individual", POINTS.highestIndividual],
  ];
  for (const [f, pts] of fields) {
    if (r[f] && p[f] === r[f]) {
      let mult = boosts[f] || 1;
      if (powerups.includes("double_down") && ddField === f) mult *= 2;
      s += pts * mult;
      if (f === "match_winner") winnerCorrect = true;
    }
  }
  if (powerups.includes("insurance") && r.match_winner && !winnerCorrect) s += 25;
  const overResults = r.over_results || {};
  const overPreds = p.over_predictions || {};
  for (const ov of Object.keys(overResults)) {
    if (overPreds[ov] && overPreds[ov] === overResults[ov]) s += POINTS.overPrediction;
  }
  return s;
}

function getBadges(p, r) {
  if (!r || !p) return [];
  const boosts = p.over_predictions?._boosts || {};
  const st = { correct: 0, matchWinner: false, topScorer: false, totalSixes: false, pickedNZ: p.match_winner === "New Zealand", oversCorrect: 0, highRollerHit: false, totalScore: calcBoostedScore(p, r) };
  if (r.match_winner && p.match_winner === r.match_winner) { st.correct++; st.matchWinner = true; }
  if (r.top_scorer && p.top_scorer === r.top_scorer) { st.correct++; st.topScorer = true; }
  if (r.player_of_match && p.player_of_match === r.player_of_match) st.correct++;
  if (r.total_sixes && p.total_sixes === r.total_sixes) { st.correct++; st.totalSixes = true; }
  if (r.first_wicket_over && p.first_wicket_over === r.first_wicket_over) st.correct++;
  if (r.powerplay_score && p.powerplay_score === r.powerplay_score) st.correct++;
  if (r.highest_individual && p.highest_individual === r.highest_individual) st.correct++;
  const overResults = r.over_results || {};
  const overPreds = p.over_predictions || {};
  for (const ov of Object.keys(overResults)) { if (overPreds[ov] && overPreds[ov] === overResults[ov]) st.oversCorrect++; }
  const cf = ["match_winner", "top_scorer", "player_of_match", "total_sixes", "first_wicket_over", "powerplay_score", "highest_individual"];
  for (const f of cf) { if ((boosts[f] || 1) === 3 && r[f] && p[f] === r[f]) st.highRollerHit = true; }
  return BADGE_DEFS.filter(b => {
    if (b.id === "oracle") return st.correct >= 5;
    if (b.id === "sharpshooter") return st.matchWinner && st.topScorer;
    if (b.id === "underdog") return st.pickedNZ && st.matchWinner;
    if (b.id === "sixsense") return st.totalSixes;
    if (b.id === "overmaster") return st.oversCorrect >= 5;
    if (b.id === "allrounder") return st.correct >= 7;
    if (b.id === "highroller") return st.highRollerHit;
    if (b.id === "sweeper") return st.totalScore >= 300;
    return false;
  });
}

// ═══ UI COMPONENTS ═══
const Badge = ({ children, bg = C.indOrangePale, color = C.indOrange }) => (
  <span style={{ background: bg, color, padding: "3px 11px", borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", display: "inline-block" }}>{children}</span>
);

const Card = ({ children, team = "ind", accent = false, style = {} }) => (
  <div style={{ background: C.white, border: `1px solid ${C.border}`, borderLeft: accent ? (team === "nz" ? `4px solid ${C.nzBlack}` : `4px solid ${C.indBlue}`) : "none", borderRadius: 14, padding: 20, marginBottom: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", ...style }}>{children}</div>
);

const SectionTitle = ({ icon, title, pts, team = "ind" }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
    <span style={{ fontSize: 22 }}>{icon}</span>
    <h3 style={{ margin: 0, fontFamily: "'Teko',sans-serif", fontSize: 20, fontWeight: 700, color: team === "nz" ? C.nzBlack : C.indBlue, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</h3>
    <Badge bg={team === "nz" ? C.nzPale : C.indBluePale} color={team === "nz" ? C.nzBlack : C.indBlue}>{pts} pts</Badge>
  </div>
);

const SelectGrid = ({ options, value, onChange, cols = 3, team = "ind" }) => (
  <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>
    {options.map(o => (
      <button key={o} onClick={() => onChange(o)} style={{
        padding: "9px 6px", borderRadius: 10, fontSize: 12, fontWeight: value === o ? 700 : 500,
        border: value === o ? `2px solid ${team === "nz" ? C.nzBlack : C.indBlue}` : `1px solid ${C.border}`,
        background: value === o ? (team === "nz" ? C.nzPale : C.indBluePale) : C.white,
        color: value === o ? (team === "nz" ? C.nzBlack : C.indBlue) : C.textMuted,
        cursor: "pointer", transition: "all 0.15s", fontFamily: "'DM Sans',sans-serif",
      }}>{o}</button>
    ))}
  </div>
);

// ── COUNTDOWN ──
function Countdown() {
  const [tl, setTl] = useState("");
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const tick = () => {
      const d = TOSS_TIME - new Date();
      if (d <= 0) { setLocked(true); setTl("LOCKED"); return; }
      setTl(`${Math.floor(d / 3600000)}h ${Math.floor((d % 3600000) / 60000)}m ${Math.floor((d % 60000) / 1000)}s`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <div style={{ background: locked ? "#FEE2E2" : "linear-gradient(135deg,#E3F2FD,#FFF3E0)", border: locked ? "1px solid #FECACA" : `1px solid ${C.indBlueSoft}`, borderRadius: 14, padding: "14px 18px", marginBottom: 14, textAlign: "center" }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.textMuted, fontFamily: "'Teko',sans-serif", marginBottom: 3 }}>
        <span>🏏 TOSS: 6:30 PM</span><span>⏱️ MATCH: 7:00 PM IST</span>
      </div>
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 3, color: locked ? "#DC2626" : C.indBlue, marginBottom: 2 }}>
        {locked ? "🔒 PREDICTIONS LOCKED" : "⏰ PREDICTIONS LOCK AT TOSS"}
      </div>
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: locked ? 20 : 36, fontWeight: 700, color: locked ? "#DC2626" : C.text, letterSpacing: 2 }}>{tl}</div>
    </div>
  );
}

// ── BOOST PICKER ──
function BoostPicker({ field, boosts, onBoost, budgetUsed }) {
  const cur = boosts[field] || 1;
  const opts = [{ l: "1×", v: 1, c: C.textDim, bg: C.borderLight }, { l: "2×", v: 2, c: "#D97706", bg: "#FEF3C7" }, { l: "3×", v: 3, c: "#DC2626", bg: "#FEE2E2" }];
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: C.textMuted, fontWeight: 700, marginRight: 4, fontFamily: "'Teko',sans-serif", letterSpacing: 1 }}>CONFIDENCE:</span>
      {opts.map(o => {
        const wu = budgetUsed - (cur - 1) + (o.v - 1);
        const ok = wu <= MAX_BOOST_BUDGET;
        const a = cur === o.v;
        return (
          <button key={o.v} onClick={() => { if (ok || o.v <= cur) onBoost(field, o.v); }}
            style={{ padding: "4px 12px", borderRadius: 8, fontSize: 13, fontWeight: a ? 800 : 600, fontFamily: "'Teko',sans-serif",
              cursor: ok || o.v <= cur ? "pointer" : "not-allowed",
              border: a ? `2px solid ${o.c}` : `1px solid ${C.border}`, background: a ? o.bg : C.white,
              color: a ? o.c : ok ? C.textMuted : "#d1d5db", opacity: !ok && o.v > cur ? 0.35 : 1 }}>{o.l}</button>
        );
      })}
    </div>
  );
}

// ── BADGES ──
function BadgeDisplay({ badges }) {
  if (!badges.length) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, letterSpacing: 2, color: C.indOrange, fontWeight: 700, marginBottom: 8 }}>🏅 BADGES EARNED</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {badges.map(b => (
          <div key={b.id} style={{ background: C.indOrangePale, border: "1px solid #FED7AA", borderRadius: 12, padding: "8px 12px", textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: 20 }}>{b.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.indOrange, marginTop: 2 }}>{b.name}</div>
            <div style={{ fontSize: 8, color: C.textMuted, marginTop: 1 }}>{b.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── LIVE OVER-BY-OVER COMPONENT ──
function LiveOverByOver({ preds, setPreds, results, completedOvers, playerName }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const overPreds = preds.over_predictions || {};
  const overResults = results?.over_results || {};

  // Determine current over from completed data
  const maxCompleted = completedOvers.length > 0
    ? Math.max(...completedOvers.map(Number))
    : 0;

  async function saveOverPrediction(overNum, value) {
    const newOverPreds = { ...overPreds, [overNum]: value };
    const newPreds = { ...preds, over_predictions: { ...newOverPreds, _boosts: overPreds._boosts, _powerups: overPreds._powerups, _doubleDownField: overPreds._doubleDownField } };
    setPreds(newPreds);

    setSaving(true);
    const { error } = await supabase
      .from("predictions")
      .update({ over_predictions: newPreds.over_predictions })
      .eq("player_name", playerName);
    setSaving(false);

    if (!error) {
      setSaved(`Over ${overNum} saved!`);
      setTimeout(() => setSaved(""), 1500);
    }
  }

  const matchStarted = new Date() >= new Date("2026-03-08T19:00:00+05:30");
  const matchEnded = results?.match_winner;

  if (matchEnded) {
    // Show final over results
    const correctCount = Object.keys(overResults).filter(o => overPreds[o] && overPreds[o] === overResults[o]).length;
    return (
      <Card accent team="ind">
        <SectionTitle icon="📊" title="Over-by-Over Results" pts={POINTS.overPrediction} />
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10 }}>
          You got <strong style={{ color: C.green }}>{correctCount}</strong> out of {Object.keys(overResults).length} overs correct! (+{correctCount * POINTS.overPrediction} pts)
        </div>
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {Array.from({ length: 20 }, (_, i) => {
            const ov = String(i + 1);
            const predicted = overPreds[ov];
            const actual = overResults[ov];
            const correct = predicted && actual && predicted === actual;
            const wrong = predicted && actual && predicted !== actual;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, padding: "6px 8px", borderRadius: 8, background: correct ? C.greenPale : wrong ? "#FEE2E2" : C.borderLight }}>
                <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, fontWeight: 700, color: C.textMuted, minWidth: 44 }}>Ov {i + 1}</span>
                <span style={{ fontSize: 12, color: C.textMuted, minWidth: 50 }}>You: <strong style={{ color: predicted ? C.text : C.textDim }}>{predicted || "—"}</strong></span>
                <span style={{ fontSize: 12, color: C.textMuted, minWidth: 60 }}>Actual: <strong style={{ color: actual ? C.text : C.textDim }}>{actual || "—"}</strong></span>
                <span style={{ marginLeft: "auto", fontSize: 14 }}>{correct ? "✅" : wrong ? "❌" : "⏳"}</span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  }

  return (
    <Card accent team="ind">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionTitle icon="📊" title="Live Over-by-Over" pts={POINTS.overPrediction} />
        {saving && <span style={{ fontSize: 11, color: C.indOrange, fontWeight: 700 }}>Saving...</span>}
        {saved && <span style={{ fontSize: 11, color: C.green, fontWeight: 700 }}>{saved}</span>}
      </div>

      {!matchStarted ? (
        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
          <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600 }}>Over-by-over opens when the match starts at 7:00 PM!</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Predict each over LIVE — before it&apos;s bowled. {POINTS.overPrediction} pts each!</div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, padding: "6px 10px", background: C.indOrangePale, borderRadius: 8 }}>
            🔴 <strong style={{ color: C.indOrange }}>LIVE!</strong> Predict runs for each over before it&apos;s bowled. Completed overs lock automatically. {POINTS.overPrediction} pts each!
          </div>
          <div style={{ maxHeight: 400, overflowY: "auto", paddingRight: 4 }}>
            {Array.from({ length: 20 }, (_, i) => {
              const ov = String(i + 1);
              const isCompleted = completedOvers.includes(ov);
              const actual = overResults[ov];
              const predicted = overPreds[ov];
              const correct = isCompleted && predicted && predicted === actual;
              const wrong = isCompleted && predicted && predicted !== actual;
              const isNext = !isCompleted && (i === 0 || completedOvers.includes(String(i)));
              const isFuture = !isCompleted && !isNext;

              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 5,
                  padding: "6px 8px", borderRadius: 8,
                  background: correct ? C.greenPale : wrong ? "#FEE2E2" : isNext ? C.indOrangePale : "transparent",
                  border: isNext ? `2px solid ${C.indOrange}` : "none",
                }}>
                  <span style={{
                    fontFamily: "'Teko',sans-serif", fontSize: 13, fontWeight: 700, minWidth: 44,
                    color: isCompleted ? (correct ? C.green : "#DC2626") : isNext ? C.indOrange : C.textDim,
                  }}>
                    {isCompleted ? (correct ? "✅" : "❌") : isNext ? "🔴" : "⏳"} Ov {i + 1}
                  </span>

                  {isCompleted ? (
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: C.textMuted }}>
                      <span>You: <strong style={{ color: correct ? C.green : "#DC2626" }}>{predicted || "—"}</strong></span>
                      <span>Actual: <strong style={{ color: C.text }}>{actual}</strong></span>
                      <span style={{ fontWeight: 700, color: correct ? C.green : "#DC2626" }}>{correct ? `+${POINTS.overPrediction}` : "+0"}</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 2, flex: 1, opacity: isFuture ? 0.4 : 1 }}>
                      {OVER_RANGES.map(r => (
                        <button key={r}
                          onClick={() => { if (!isCompleted) saveOverPrediction(ov, r); }}
                          disabled={isCompleted}
                          style={{
                            flex: 1, padding: "4px 1px", borderRadius: 7, fontSize: 9.5,
                            fontWeight: predicted === r ? 800 : 500,
                            border: predicted === r ? `2px solid ${C.indBlue}` : `1px solid ${C.border}`,
                            background: predicted === r ? C.indBluePale : C.white,
                            color: predicted === r ? C.indBlue : C.textDim,
                            cursor: isCompleted ? "not-allowed" : "pointer", fontFamily: "inherit",
                          }}>{r}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// ═══ MAIN PAGE ═══
export default function PredictPage() {
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState("");
  const [results, setResults] = useState(null);
  const [preds, setPreds] = useState({
    match_winner: "", top_scorer: "", player_of_match: "", total_sixes: "",
    first_wicket_over: "", powerplay_score: "", highest_individual: "", over_predictions: {},
  });
  const [boosts, setBoosts] = useState({});
  const [powerups, setPowerups] = useState([]);
  const [ddField, setDdField] = useState("");

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const update = (k, v) => setPreds(p => ({ ...p, [k]: v }));
  const updateOv = (o, v) => setPreds(p => ({ ...p, over_predictions: { ...p.over_predictions, [o]: v } }));
  const updateBoost = (f, v) => setBoosts(b => ({ ...b, [f]: v }));
  const togglePowerup = (id) => setPowerups(p => p.includes(id) ? p.filter(x => x !== id) : p.length < 2 ? [...p, id] : p);
  const boostUsed = Object.values(boosts).reduce((s, v) => s + (v - 1), 0);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("predictor_name") : null;
    if (saved) { setName(saved); checkExisting(saved); }
    fetchResults();
  }, []);

  async function checkExisting(n) {
    const { data } = await supabase.from("predictions").select("*").eq("player_name", n).single();
    if (data) {
      setPreds(data); setJoined(true); setSubmitted(true);
      if (data.over_predictions?._boosts) setBoosts(data.over_predictions._boosts);
      if (data.over_predictions?._powerups) setPowerups(data.over_predictions._powerups);
      if (data.over_predictions?._doubleDownField) setDdField(data.over_predictions._doubleDownField);
    }
  }

  async function fetchResults() {
    const { data } = await supabase.from("match_results").select("*").eq("id", 1).single();
    if (data) setResults(data);
  }

  useEffect(() => {
    const ch = supabase.channel("res-upd").on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_results" }, (p) => setResults(p.new)).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function handleSubmit() {
    if (!name.trim()) { showToast("Enter your name!"); return; }
    if (!preds.match_winner) { showToast("Pick the match winner!"); return; }
    if (powerups.includes("double_down") && !ddField) { showToast("Pick a category for Double Down!"); return; }
    const overData = { ...preds.over_predictions, _boosts: boosts, _powerups: powerups, _doubleDownField: ddField };
    const row = {
      player_name: name.trim(), match_winner: preds.match_winner, top_scorer: preds.top_scorer,
      player_of_match: preds.player_of_match, total_sixes: preds.total_sixes,
      first_wicket_over: preds.first_wicket_over, powerplay_score: preds.powerplay_score,
      highest_individual: preds.highest_individual, over_predictions: overData,
      score: results ? calculateScore(preds, results) : 0,
    };
    const { error } = await supabase.from("predictions").upsert(row, { onConflict: "player_name" });
    if (error) { showToast("Error: " + error.message); return; }
    localStorage.setItem("predictor_name", name.trim());
    setSubmitted(true); setJoined(true); showToast("Predictions locked! 🔒🏏");
  }

  const Toast = () => toast ? <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: C.white, border: `2px solid ${C.indOrange}`, color: C.indOrange, padding: "12px 28px", borderRadius: 14, fontSize: 14, fontWeight: 700, boxShadow: "0 8px 30px rgba(0,0,0,0.1)" }}>{toast}</div> : null;

  // ═══ SUBMITTED ═══
  if (submitted) {
    const score = results ? calcBoostedScore(preds, results) : 0;
    const badges = results ? getBadges(preds, results) : [];
    const completedOvers = results?.over_results ? Object.keys(results.over_results) : [];
    return (
      <><Toast /><LiveScore /><Countdown />
        <Card accent team="ind" style={{ textAlign: "center", borderColor: C.green }}>
          <div style={{ fontSize: 48, marginBottom: 6 }}>✅</div>
          <h2 style={{ fontFamily: "'Teko',sans-serif", fontSize: 24, color: C.green, margin: "0 0 6px" }}>PREDICTIONS LOCKED!</h2>
          <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 10px" }}>Your picks are in, {name}. Check the leaderboard!</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center" }}>
            {preds.match_winner && <Badge bg={C.greenPale} color={C.green}>Winner: {preds.match_winner}{(boosts.match_winner || 1) > 1 ? ` (${boosts.match_winner}×)` : ""}</Badge>}
            {preds.top_scorer && <Badge bg={C.indBluePale} color={C.indBlue}>{preds.top_scorer}</Badge>}
            {powerups.length > 0 && <Badge bg={C.purplePale} color={C.purple}>{powerups.length} power-ups</Badge>}
          </div>
          {results && results.match_winner && (
            <div style={{ marginTop: 14, padding: 14, background: C.indBluePale, borderRadius: 14, border: `1px solid ${C.indBlueSoft}` }}>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, letterSpacing: 2, color: C.indBlue }}>YOUR SCORE</div>
              <div style={{ fontFamily: "'Teko',sans-serif", fontSize: 48, fontWeight: 700, color: C.indBlue, lineHeight: 1.1 }}>{score}</div>
            </div>
          )}
          <BadgeDisplay badges={badges} />
        </Card>

        {/* ── LIVE OVER-BY-OVER ── */}
        <LiveOverByOver
          preds={preds} setPreds={setPreds} results={results}
          completedOvers={completedOvers} playerName={name}
        />
      </>
    );
  }

  // ═══ JOIN SCREEN ═══
  if (!joined) {
    return (
      <><Toast /><LiveScore /><Countdown />
        {/* Join card */}
        <Card accent team="ind">
          <div style={{ textAlign: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🏏</div>
            <h2 style={{ fontFamily: "'Teko',sans-serif", fontSize: 28, margin: "0 0 4px", color: C.indBlue }}>JOIN THE PREDICTION GAME</h2>
            <p style={{ color: C.textMuted, fontSize: 12, margin: "0 0 16px" }}>Predict the match. Outscore your friends. Win bragging rights!</p>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your display name"
              style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: `2px solid ${C.indBlueSoft}`, background: C.indBluePale, color: C.text, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", textAlign: "center", fontWeight: 600 }} />
            <button onClick={() => { if (name.trim()) setJoined(true); else showToast("Enter a name!"); }}
              style={{ width: "100%", marginTop: 12, padding: "14px", borderRadius: 12, border: "none", fontFamily: "'Teko',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2, cursor: "pointer", background: `linear-gradient(135deg,${C.indBlue},${C.indBlueLight})`, color: "#fff", boxShadow: "0 4px 16px rgba(13,71,161,0.25)" }}>
              LET&apos;S GO 🚀
            </button>
          </div>
        </Card>

        {/* HOW TO PLAY */}
        <Card>
          <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 20, color: C.indBlue, margin: "0 0 14px" }}>📖 HOW TO PLAY</h3>
          {[
            { n: 1, bg: C.indBluePale, nc: C.indBlue, t: "🎯 Make Your Predictions", d: "Pick who wins, top scorer, player of the match, total sixes, and more. Each correct prediction earns you points!" },
            { n: 2, bg: C.indOrangePale, nc: C.indOrange, t: "🎰 Set Your Confidence", d: "For each pick, set 1× (normal), 2× (double), or 3× (triple) points. You have 5 boost tokens — higher bets = bigger rewards if you're right!" },
            { n: 3, bg: C.purplePale, nc: C.purple, t: "🔋 Choose Power-Ups (Pick 2)", d: "⚡ Double Down — 2× one category (stacks with confidence for up to 6×!). 🔄 Mid-Match Swap — change one pick after toss. 🛡️ Insurance — wrong winner? Get 25 pts back." },
            { n: 4, bg: C.greenPale, nc: C.green, t: "🏅 Earn Badges", d: "Badges are auto-awarded after the match: 🔮 Oracle, 🎯 Sharpshooter, 🎰 High Roller, 🐺 Underdog King, and more!" },
          ].map(s => (
            <div key={s.n} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 34, height: 34, borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Teko',sans-serif", fontSize: 17, fontWeight: 700, color: s.nc }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>{s.t}</div>
                <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </Card>

        {/* POINTS TABLE */}
        <Card>
          <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 18, color: C.indBlue, margin: "0 0 10px" }}>📊 POINTS TABLE</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px 16px" }}>
            {[["🏆 Match Winner", 50], ["🔥 Top Scorer", 40], ["⭐ Player of Match", 40], ["6️⃣ Total Sixes", 30], ["🎳 First Wicket Over", 30], ["⚡ Powerplay Score", 25], ["💯 Highest Individual", 25], ["📊 Each Over", 10]].map(([l, p]) => (
              <div key={l} style={{ display: "contents" }}>
                <div style={{ fontSize: 13, color: C.text, padding: "3px 0" }}>{l}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.indBlue, padding: "3px 0", textAlign: "right" }}>{p} pts</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, padding: "8px 12px", background: C.indOrangePale, borderRadius: 10, fontSize: 12, color: C.indOrange, fontWeight: 600, textAlign: "center" }}>
            💡 3× confidence + Double Down = up to <strong>6× the base points!</strong>
          </div>
        </Card>
      </>
    );
  }

  // ═══ PREDICTION FORM ═══
  return (
    <><Toast /><LiveScore /><Countdown />

      {/* Status bar */}
      <div style={{ marginBottom: 12, padding: "10px 14px", background: "linear-gradient(90deg,#E3F2FD,#FFF3E0)", borderRadius: 12, border: `1px solid ${C.indBlueSoft}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: C.indBlue, fontWeight: 700 }}>Playing as <strong style={{ color: C.text }}>{name}</strong></span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: C.textMuted }}>🎰 Confidence budget:</span>
          <div style={{ display: "flex", gap: 2 }}>{[...Array(MAX_BOOST_BUDGET)].map((_, i) => (<div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: i < boostUsed ? C.indOrange : C.border }} />))}</div>
          <span style={{ fontSize: 10, color: C.textMuted }}>{MAX_BOOST_BUDGET - boostUsed} left</span>
        </div>
      </div>

      {/* Power-ups */}
      <Card accent team="ind">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🔋</span>
          <h3 style={{ fontFamily: "'Teko',sans-serif", fontSize: 19, fontWeight: 700, color: C.purple, margin: 0 }}>POWER-UPS</h3>
          <Badge bg={C.purplePale} color={C.purple}>PICK 2</Badge>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {POWERUP_DEFS.map(pu => {
            const isA = powerups.includes(pu.id);
            const canA = powerups.length < 2 || isA;
            return (
              <div key={pu.id}>
                <button onClick={() => { if (canA) togglePowerup(pu.id); }} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, cursor: canA ? "pointer" : "not-allowed", textAlign: "left", border: isA ? `2px solid ${C.purple}` : `1px solid ${C.border}`, background: isA ? C.purplePale : C.white, opacity: canA ? 1 : 0.4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{pu.icon}</span>
                    <div><div style={{ fontSize: 13, fontWeight: 800, color: isA ? C.purple : C.text }}>{pu.name}</div><div style={{ fontSize: 11, color: C.textMuted }}>{pu.desc}</div></div>
                    {isA && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: C.purple, background: "rgba(124,58,237,0.1)", padding: "2px 10px", borderRadius: 10 }}>ACTIVE</span>}
                  </div>
                </button>
                {isA && pu.id === "double_down" && (
                  <div style={{ marginTop: 6, padding: "8px 12px", background: C.purplePale, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: C.purple, letterSpacing: 1, marginBottom: 6, fontFamily: "'Teko',sans-serif" }}>PICK CATEGORY TO DOUBLE:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {[["match_winner", "Winner"], ["top_scorer", "Top Scorer"], ["player_of_match", "PotM"], ["total_sixes", "Sixes"], ["first_wicket_over", "1st Wicket"]].map(([k, l]) => (
                        <button key={k} onClick={() => setDdField(k)} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: ddField === k ? 800 : 500, border: ddField === k ? `2px solid ${C.purple}` : `1px solid ${C.border}`, background: ddField === k ? C.white : "transparent", color: ddField === k ? C.purple : C.textMuted, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
                {isA && pu.id === "swap" && <div style={{ marginTop: 6, padding: "8px 12px", background: C.purplePale, borderRadius: 10, fontSize: 11, color: C.purple }}>🔄 After toss, come back to change ONE prediction before Over 5!</div>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick reminder */}
      <div style={{ marginBottom: 12, padding: "10px 14px", background: C.borderLight, borderRadius: 12, border: `1px solid ${C.border}`, fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
        <strong style={{ color: C.text }}>Quick reminder:</strong> Pick answers below. After each pick, set <strong style={{ color: "#D97706" }}>confidence (1×/2×/3×)</strong>. You have 5 boost tokens. Scroll down and hit <strong style={{ color: C.indBlue }}>Lock In</strong> when done!
      </div>

      {/* Match Winner */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => update("match_winner", "India")} style={{ flex: 1, padding: "22px 14px", borderRadius: 16, cursor: "pointer", border: preds.match_winner === "India" ? `3px solid ${C.indBlue}` : `2px solid ${C.border}`, background: preds.match_winner === "India" ? `linear-gradient(135deg,${C.indBlue},${C.indBlueLight})` : C.white, boxShadow: preds.match_winner === "India" ? "0 4px 20px rgba(13,71,161,0.2)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.2s" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 32 }}>🇮🇳</div><div style={{ fontFamily: "'Teko',sans-serif", fontSize: 24, fontWeight: 700, color: preds.match_winner === "India" ? "#fff" : C.indBlue }}>INDIA</div><Badge bg={preds.match_winner === "India" ? "rgba(255,255,255,0.2)" : C.indBluePale} color={preds.match_winner === "India" ? "#fff" : C.indBlue}>50 pts</Badge></div>
        </button>
        <button onClick={() => update("match_winner", "New Zealand")} style={{ flex: 1, padding: "22px 14px", borderRadius: 16, cursor: "pointer", border: preds.match_winner === "New Zealand" ? `3px solid ${C.nzBlack}` : `2px solid ${C.border}`, background: preds.match_winner === "New Zealand" ? `linear-gradient(135deg,${C.nzBlack},#333)` : C.white, boxShadow: preds.match_winner === "New Zealand" ? "0 4px 20px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.2s" }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 32 }}>🇳🇿</div><div style={{ fontFamily: "'Teko',sans-serif", fontSize: 24, fontWeight: 700, color: preds.match_winner === "New Zealand" ? "#fff" : C.nzBlack }}>NEW ZEALAND</div><Badge bg={preds.match_winner === "New Zealand" ? "rgba(255,255,255,0.2)" : C.nzPale} color={preds.match_winner === "New Zealand" ? "#fff" : C.nzBlack}>50 pts</Badge></div>
        </button>
      </div>
      {preds.match_winner && <div style={{ marginBottom: 12 }}><BoostPicker field="match_winner" boosts={boosts} onBoost={updateBoost} budgetUsed={boostUsed} /></div>}

      {/* Top Scorer */}
      <Card accent team="ind">
        <SectionTitle icon="🔥" title="Top Scorer" pts={POINTS.topScorer} />
        <div style={{ fontSize: 10, fontWeight: 800, color: C.indOrange, letterSpacing: 2, marginBottom: 5 }}>🇮🇳 INDIA</div>
        <SelectGrid options={INDIA_PLAYERS} value={preds.top_scorer} onChange={v => update("top_scorer", v)} cols={2} />
        <div style={{ fontSize: 10, fontWeight: 800, color: C.nzBlack, letterSpacing: 2, margin: "10px 0 5px" }}>🇳🇿 NEW ZEALAND</div>
        <SelectGrid options={NZ_PLAYERS} value={preds.top_scorer} onChange={v => update("top_scorer", v)} cols={2} team="nz" />
        {preds.top_scorer && <BoostPicker field="top_scorer" boosts={boosts} onBoost={updateBoost} budgetUsed={boostUsed} />}
      </Card>

      {/* Player of the Match */}
      <Card accent team="nz">
        <SectionTitle icon="⭐" title="Player of Match" pts={POINTS.playerOfMatch} team="nz" />
        <div style={{ fontSize: 10, fontWeight: 800, color: C.indOrange, letterSpacing: 2, marginBottom: 5 }}>🇮🇳 INDIA</div>
        <SelectGrid options={INDIA_PLAYERS} value={preds.player_of_match} onChange={v => update("player_of_match", v)} cols={2} />
        <div style={{ fontSize: 10, fontWeight: 800, color: C.nzBlack, letterSpacing: 2, margin: "10px 0 5px" }}>🇳🇿 NEW ZEALAND</div>
        <SelectGrid options={NZ_PLAYERS} value={preds.player_of_match} onChange={v => update("player_of_match", v)} cols={2} team="nz" />
        {preds.player_of_match && <BoostPicker field="player_of_match" boosts={boosts} onBoost={updateBoost} budgetUsed={boostUsed} />}
      </Card>

      {/* Props */}
      <Card accent team="ind"><SectionTitle icon="6️⃣" title="Total Sixes" pts={POINTS.totalSixes} />
        <SelectGrid options={SIXES_RANGES} value={preds.total_sixes} onChange={v => update("total_sixes", v)} cols={5} />
        {preds.total_sixes && <BoostPicker field="total_sixes" boosts={boosts} onBoost={updateBoost} budgetUsed={boostUsed} />}
      </Card>

      <Card accent team="nz"><SectionTitle icon="🎳" title="First Wicket Over" pts={POINTS.firstWicketOver} team="nz" />
        <SelectGrid options={WICKET_OVERS} value={preds.first_wicket_over} onChange={v => update("first_wicket_over", v)} cols={4} team="nz" />
        {preds.first_wicket_over && <BoostPicker field="first_wicket_over" boosts={boosts} onBoost={updateBoost} budgetUsed={boostUsed} />}
      </Card>

      <Card accent team="ind"><SectionTitle icon="⚡" title="Powerplay Score" pts={POINTS.powerplayScore} /><SelectGrid options={POWERPLAY_RANGES} value={preds.powerplay_score} onChange={v => update("powerplay_score", v)} cols={3} /></Card>
      <Card accent team="nz"><SectionTitle icon="💯" title="Highest Individual" pts={POINTS.highestIndividual} team="nz" /><SelectGrid options={INDIVIDUAL_RANGES} value={preds.highest_individual} onChange={v => update("highest_individual", v)} cols={3} team="nz" /></Card>

      {/* Over-by-Over */}
      <Card accent team="ind">
        <SectionTitle icon="📊" title="Over-by-Over (1st Inn)" pts={POINTS.overPrediction} />
        <div style={{ padding: "10px 14px", background: "linear-gradient(135deg,#E3F2FD,#FFF3E0)", borderRadius: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.indBlue, marginBottom: 2 }}>🔴 This section stays LIVE during the match!</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>You can predict now or come back during the match. Each over locks once it&apos;s bowled. {POINTS.overPrediction} pts per correct over!</div>
        </div>
        <p style={{ color: C.textMuted, fontSize: 10, margin: "0 0 8px" }}>Optional now — predict the rest live during the match!</p>
        <div style={{ maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ fontFamily: "'Teko',sans-serif", fontSize: 13, fontWeight: 700, color: i < 6 ? C.indOrange : C.textDim, minWidth: 44 }}>{i < 6 ? "⚡" : ""}Ov {i + 1}</span>
              <div style={{ display: "flex", gap: 2, flex: 1 }}>
                {OVER_RANGES.map(r => (
                  <button key={r} onClick={() => updateOv(String(i + 1), r)} style={{
                    flex: 1, padding: "4px 1px", borderRadius: 7, fontSize: 9.5,
                    fontWeight: preds.over_predictions?.[String(i + 1)] === r ? 800 : 500,
                    border: preds.over_predictions?.[String(i + 1)] === r ? `2px solid ${C.indBlue}` : `1px solid ${C.border}`,
                    background: preds.over_predictions?.[String(i + 1)] === r ? C.indBluePale : C.white,
                    color: preds.over_predictions?.[String(i + 1)] === r ? C.indBlue : C.textDim,
                    cursor: "pointer", fontFamily: "inherit",
                  }}>{r}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Submit */}
      <button onClick={handleSubmit} style={{ width: "100%", padding: "16px", borderRadius: 16, border: "none", fontFamily: "'Teko',sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 3, cursor: "pointer", background: `linear-gradient(135deg,${C.indBlue},${C.indBlueLight})`, color: "#fff", boxShadow: "0 6px 24px rgba(13,71,161,0.3)", marginBottom: 30 }}>
        🔒 LOCK IN PREDICTIONS
      </button>
    </>
  );
}
