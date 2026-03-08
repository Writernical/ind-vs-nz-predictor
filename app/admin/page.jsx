"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_PLAYERS, INDIA_SCORING, NZ_SCORING, INDIA_BOWLING, NZ_BOWLING, SIXES_RANGES, WICKET_OVERS, POWERPLAY_RANGES, INDIVIDUAL_RANGES, OVER_RANGES, POINTS, calculateScore } from "@/lib/constants";
const PIN = process.env.NEXT_PUBLIC_ADMIN_PIN || "2026";
const C = { indBlue: "#0D47A1", indOrange: "#FF6F00", nzBlack: "#1a1a1a", border: "#e2e8f0", nzPale: "#F5F5F5", text: "#1a1a2e", textMuted: "#64748b", indBluePale: "#E3F2FD" };
const Sel = ({ opts, val, onChange, cols = 3 }) => (<div style={{ display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 6 }}>{opts.map(o => (<button key={o} onClick={() => onChange(o)} style={{ padding: "9px 6px", borderRadius: 10, fontSize: 12, fontWeight: val === o ? 700 : 500, border: val === o ? `2px solid ${C.nzBlack}` : `1px solid ${C.border}`, background: val === o ? C.nzPale : "#fff", color: val === o ? C.nzBlack : C.textMuted, cursor: "pointer", fontFamily: "DM Sans,sans-serif" }}>{o}</button>))}</div>);

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [res, setRes] = useState({
    match_winner: "", top_scorer_india: "", top_scorer_nz: "",
    top_wicket_india: "", top_wicket_nz: "",
    most_catches: "", total_sixes: "", first_wicket_over: "",
    powerplay_score: "", highest_individual: "", over_results: {},
  });

  const show = m => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const upd = (k, v) => setRes(r => ({ ...r, [k]: v }));
  const updOver = (ov, v) => setRes(r => ({ ...r, over_results: { ...r.over_results, [ov]: v } }));

  useEffect(() => { (async () => {
    const { data } = await supabase.from("match_results").select("*").eq("id", 1).single();
    if (data) setRes({
      match_winner: data.match_winner || "", top_scorer_india: data.top_scorer_india || "",
      top_scorer_nz: data.top_scorer_nz || "", top_wicket_india: data.top_wicket_india || "",
      top_wicket_nz: data.top_wicket_nz || "", most_catches: data.most_catches || "",
      total_sixes: data.total_sixes || "", first_wicket_over: data.first_wicket_over || "",
      powerplay_score: data.powerplay_score || "", highest_individual: data.highest_individual || "",
      over_results: data.over_results || {},
    });
  })(); }, []);

  async function save() {
    setSaving(true);
    await supabase.from("match_results").update({ ...res, updated_at: new Date().toISOString() }).eq("id", 1);
    const { data } = await supabase.from("predictions").select("*");
    if (data) for (const p of data) await supabase.from("predictions").update({ score: calculateScore(p, res) }).eq("player_name", p.player_name);
    setSaving(false); show("Saved! ✅ Scores recalculated!");
  }

  if (!unlocked) return (<div style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.nzBlack}`, borderRadius: 14, padding: 20 }}>
    {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#fff", border: "2px solid #FF6F00", color: "#FF6F00", padding: "12px 28px", borderRadius: 14, fontSize: 14, fontWeight: 700 }}>{toast}</div>}
    <h2 style={{ fontFamily: "Teko,sans-serif", fontSize: 22, color: C.nzBlack, margin: "0 0 10px" }}>⚙️ ADMIN</h2>
    <div style={{ display: "flex", gap: 8 }}><input value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN" type="password" style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", outline: "none" }} />
    <button onClick={() => { if (pin === PIN) setUnlocked(true); else show("Wrong PIN!"); }} style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: C.nzBlack, color: "#fff", fontWeight: 800, cursor: "pointer" }}>Unlock</button></div></div>);

  const filledOvers1 = Object.keys(res.over_results).filter(k => parseInt(k) <= 20 && res.over_results[k]).length;
  const filledOvers2 = Object.keys(res.over_results).filter(k => parseInt(k) > 20 && res.over_results[k]).length;

  return (<div>
    {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 999, background: "#fff", border: "2px solid green", color: "green", padding: "12px 28px", borderRadius: 14, fontSize: 14, fontWeight: 700, zIndex: 999 }}>{toast}</div>}

    {/* Main categories */}
    {[
      ["🏆", "Match Winner", { o: ["India", "New Zealand"], k: "match_winner", c: 2 }],
      ["🔥", "India Top Scorer", { o: [...INDIA_SCORING], k: "top_scorer_india", c: 2 }],
      ["🔥", "NZ Top Scorer", { o: [...NZ_SCORING], k: "top_scorer_nz", c: 2 }],
      ["🎳", "India Top Wicket Taker", { o: [...INDIA_BOWLING], k: "top_wicket_india", c: 2 }],
      ["🎳", "NZ Top Wicket Taker", { o: [...NZ_BOWLING], k: "top_wicket_nz", c: 2 }],
      ["🧤", "Most Catches", { o: ALL_PLAYERS, k: "most_catches", c: 2 }],
      ["6️⃣", "Total Sixes", { o: SIXES_RANGES, k: "total_sixes", c: 5 }],
      ["🏹", "1st Wicket Over", { o: WICKET_OVERS, k: "first_wicket_over", c: 4 }],
      ["⚡", "Powerplay Score", { o: POWERPLAY_RANGES, k: "powerplay_score", c: 3 }],
      ["💯", "Highest Individual", { o: INDIVIDUAL_RANGES, k: "highest_individual", c: 3 }],
    ].map(([icon, title, { o, k, c }]) => (
      <div key={k} style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.nzBlack}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
          <h3 style={{ fontFamily: "Teko,sans-serif", fontSize: 19, fontWeight: 700, color: C.nzBlack, margin: 0, textTransform: "uppercase" }}>{title}</h3>
          {res[k] && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, color: "green", background: "#dcfce7", padding: "2px 8px", borderRadius: 8 }}>✓ {res[k]}</span>}
        </div>
        <Sel opts={o} val={res[k]} onChange={v => upd(k, v)} cols={c} />
      </div>
    ))}

    {/* ── OVER-BY-OVER RESULTS ── */}
    <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.indBlue}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 22 }}>📊</span>
        <h3 style={{ fontFamily: "Teko,sans-serif", fontSize: 19, fontWeight: 700, color: C.indBlue, margin: 0 }}>OVER-BY-OVER RESULTS</h3>
      </div>
      <p style={{ fontSize: 11, color: C.textMuted, margin: "0 0 12px" }}>Enter the run range for each completed over. {filledOvers1}/20 1st inn, {filledOvers2}/20 2nd inn filled.</p>

      {/* 1st Innings */}
      <div style={{ padding: "4px 8px", background: C.indBluePale, borderRadius: 6, marginBottom: 6, textAlign: "center", fontFamily: "Teko,sans-serif", fontSize: 13, fontWeight: 700, color: C.indBlue, letterSpacing: 1 }}>🏏 1ST INNINGS — OVERS 1-20</div>
      <div style={{ maxHeight: 400, overflowY: "auto", marginBottom: 12 }}>
        {Array.from({ length: 20 }, (_, i) => {
          const ov = String(i + 1);
          return (
            <div key={ov} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "Teko,sans-serif", fontSize: 13, fontWeight: 700, color: res.over_results[ov] ? "green" : C.textMuted, minWidth: 40 }}>
                {res.over_results[ov] ? "✅" : "⬜"} Ov {i + 1}
              </span>
              <div style={{ display: "flex", gap: 3, flex: 1 }}>
                {OVER_RANGES.map(r => (
                  <button key={r} onClick={() => updOver(ov, r)} style={{
                    flex: 1, padding: "5px 2px", borderRadius: 7, fontSize: 10,
                    fontWeight: res.over_results[ov] === r ? 800 : 500,
                    border: res.over_results[ov] === r ? "2px solid #0D47A1" : `1px solid ${C.border}`,
                    background: res.over_results[ov] === r ? C.indBluePale : "#fff",
                    color: res.over_results[ov] === r ? C.indBlue : C.textMuted,
                    cursor: "pointer",
                  }}>{r}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2nd Innings */}
      <div style={{ padding: "4px 8px", background: C.nzPale, borderRadius: 6, marginBottom: 6, textAlign: "center", fontFamily: "Teko,sans-serif", fontSize: 13, fontWeight: 700, color: C.nzBlack, letterSpacing: 1 }}>🏏 2ND INNINGS — OVERS 1-20</div>
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {Array.from({ length: 20 }, (_, i) => {
          const ov = String(i + 21);
          return (
            <div key={ov} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontFamily: "Teko,sans-serif", fontSize: 13, fontWeight: 700, color: res.over_results[ov] ? "green" : C.textMuted, minWidth: 40 }}>
                {res.over_results[ov] ? "✅" : "⬜"} Ov {i + 1}
              </span>
              <div style={{ display: "flex", gap: 3, flex: 1 }}>
                {OVER_RANGES.map(r => (
                  <button key={r} onClick={() => updOver(ov, r)} style={{
                    flex: 1, padding: "5px 2px", borderRadius: 7, fontSize: 10,
                    fontWeight: res.over_results[ov] === r ? 800 : 500,
                    border: res.over_results[ov] === r ? `2px solid ${C.nzBlack}` : `1px solid ${C.border}`,
                    background: res.over_results[ov] === r ? C.nzPale : "#fff",
                    color: res.over_results[ov] === r ? C.nzBlack : C.textMuted,
                    cursor: "pointer",
                  }}>{r}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>

    {/* Save button */}
    <button onClick={save} disabled={saving} style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", fontFamily: "Teko,sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 2, cursor: "pointer", background: saving ? "#94a3b8" : C.nzBlack, color: "#fff", marginBottom: 30, position: "sticky", bottom: 10, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
      {saving ? "⏳ SAVING & RECALCULATING..." : "💾 SAVE RESULTS & UPDATE SCORES"}
    </button>
  </div>);
}
