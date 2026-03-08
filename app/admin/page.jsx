"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ALL_PLAYERS, SIXES_RANGES, WICKET_OVERS, POWERPLAY_RANGES, INDIVIDUAL_RANGES, POINTS, calculateScore } from "@/lib/constants";
const PIN=process.env.NEXT_PUBLIC_ADMIN_PIN||"2026";
const C={indBlue:"#0D47A1",nzBlack:"#1a1a1a",border:"#e2e8f0",nzPale:"#F5F5F5",text:"#1a1a2e",textMuted:"#64748b"};
const Sel=({opts,val,onChange,cols=3})=>(<div style={{display:"grid",gridTemplateColumns:`repeat(${cols},1fr)`,gap:6}}>{opts.map(o=>(<button key={o} onClick={()=>onChange(o)} style={{padding:"9px 6px",borderRadius:10,fontSize:12,fontWeight:val===o?700:500,border:val===o?`2px solid ${C.nzBlack}`:`1px solid ${C.border}`,background:val===o?C.nzPale:"#fff",color:val===o?C.nzBlack:C.textMuted,cursor:"pointer",fontFamily:"DM Sans,sans-serif"}}>{o}</button>))}</div>);
export default function AdminPage(){
  const[unlocked,setUnlocked]=useState(false);const[pin,setPin]=useState("");const[toast,setToast]=useState("");const[saving,setSaving]=useState(false);
  const[res,setRes]=useState({match_winner:"",top_scorer:"",player_of_match:"",total_sixes:"",first_wicket_over:"",powerplay_score:"",highest_individual:"",over_results:{}});
  const show=m=>{setToast(m);setTimeout(()=>setToast(""),3000)};const upd=(k,v)=>setRes(r=>({...r,[k]:v}));
  useEffect(()=>{(async()=>{const{data}=await supabase.from("match_results").select("*").eq("id",1).single();if(data)setRes({match_winner:data.match_winner||"",top_scorer:data.top_scorer||"",player_of_match:data.player_of_match||"",total_sixes:data.total_sixes||"",first_wicket_over:data.first_wicket_over||"",powerplay_score:data.powerplay_score||"",highest_individual:data.highest_individual||"",over_results:data.over_results||{}})})()},[]);
  async function save(){setSaving(true);await supabase.from("match_results").update({...res,updated_at:new Date().toISOString()}).eq("id",1);const{data}=await supabase.from("predictions").select("*");if(data)for(const p of data)await supabase.from("predictions").update({score:calculateScore(p,res)}).eq("player_name",p.player_name);setSaving(false);show("Saved! ✅")}
  if(!unlocked)return(<div style={{background:"#fff",border:`1px solid ${C.border}`,borderLeft:`4px solid ${C.nzBlack}`,borderRadius:14,padding:20}}>
    {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:999,background:"#fff",border:"2px solid #FF6F00",color:"#FF6F00",padding:"12px 28px",borderRadius:14,fontSize:14,fontWeight:700}}>{toast}</div>}
    <h2 style={{fontFamily:"Teko,sans-serif",fontSize:22,color:C.nzBlack,margin:"0 0 10px"}}>⚙️ ADMIN</h2>
    <div style={{display:"flex",gap:8}}><input value={pin} onChange={e=>setPin(e.target.value)} placeholder="PIN" type="password" style={{flex:1,padding:"11px 14px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:14,fontFamily:"inherit",outline:"none"}}/>
    <button onClick={()=>{if(pin===PIN)setUnlocked(true);else show("Wrong PIN!")}} style={{padding:"11px 20px",borderRadius:10,border:"none",background:C.nzBlack,color:"#fff",fontWeight:800,cursor:"pointer"}}>Unlock</button></div></div>);
  return(<div>
    {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",zIndex:999,background:"#fff",border:"2px solid green",color:"green",padding:"12px 28px",borderRadius:14,fontSize:14,fontWeight:700}}>{toast}</div>}
    {[["🏆","Winner",{o:["India","New Zealand"],k:"match_winner",c:2}],["🔥","Top Scorer",{o:ALL_PLAYERS,k:"top_scorer",c:2}],["⭐","PotM",{o:ALL_PLAYERS,k:"player_of_match",c:2}],["6️⃣","Total Sixes",{o:SIXES_RANGES,k:"total_sixes",c:5}],["🎳","1st Wicket Over",{o:WICKET_OVERS,k:"first_wicket_over",c:4}],["⚡","Powerplay",{o:POWERPLAY_RANGES,k:"powerplay_score",c:3}],["💯","Highest Individual",{o:INDIVIDUAL_RANGES,k:"highest_individual",c:3}]].map(([icon,title,{o,k,c}])=>(
      <div key={k} style={{background:"#fff",border:`1px solid ${C.border}`,borderLeft:`4px solid ${C.nzBlack}`,borderRadius:14,padding:20,marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:22}}>{icon}</span><h3 style={{fontFamily:"Teko,sans-serif",fontSize:19,fontWeight:700,color:C.nzBlack,margin:0,textTransform:"uppercase"}}>{title}</h3></div>
        <Sel opts={o} val={res[k]} onChange={v=>upd(k,v)} cols={c}/>
      </div>
    ))}
    <button onClick={save} disabled={saving} style={{width:"100%",padding:"14px",borderRadius:14,border:"none",fontFamily:"Teko,sans-serif",fontSize:20,fontWeight:700,letterSpacing:2,cursor:"pointer",background:C.nzBlack,color:"#fff",marginBottom:30,opacity:saving?0.5:1}}>{saving?"SAVING...":"💾 SAVE RESULTS"}</button>
  </div>);
}
