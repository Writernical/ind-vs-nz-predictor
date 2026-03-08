"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { calculateScore } from "@/lib/constants";
export default function LeaderboardPage(){
  const[entries,setEntries]=useState([]);const[results,setResults]=useState(null);const[myName,setMyName]=useState("");
  useEffect(()=>{setMyName(localStorage.getItem("predictor_name")||"");fetchAll()},[]);
  async function fetchAll(){
    const[{data:preds},{data:res}]=await Promise.all([supabase.from("predictions").select("*"),supabase.from("match_results").select("*").eq("id",1).single()]);
    if(res)setResults(res);if(preds){const s=preds.map(p=>({...p,score:res?calculateScore(p,res):p.score}));s.sort((a,b)=>b.score-a.score);setEntries(s)}
  }
  useEffect(()=>{const ch=supabase.channel("lb").on("postgres_changes",{event:"*",schema:"public",table:"predictions"},()=>fetchAll()).on("postgres_changes",{event:"UPDATE",schema:"public",table:"match_results"},()=>fetchAll()).subscribe();return()=>supabase.removeChannel(ch)},[]);
  return(<div>
    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:20,marginBottom:12,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
      <h2 style={{fontFamily:"Teko,sans-serif",fontSize:26,margin:"0 0 4px",color:"#0D47A1"}}>🏆 LIVE LEADERBOARD</h2>
      <p style={{color:"#64748b",fontSize:11,margin:"0 0 12px"}}>{results?.match_winner?"Scores update in real-time":"Awaiting match results..."}</p>
      {entries.length===0?<div style={{textAlign:"center",padding:30,color:"#94a3b8"}}>👻 No predictions yet!</div>:
        <div style={{display:"flex",flexDirection:"column",gap:5}}>{entries.map((e,i)=>{
          const medal=i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`;const isMe=e.player_name===myName;const isInd=e.match_winner==="India";
          return(<div key={e.player_name} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px",borderRadius:12,background:isMe?"#E3F2FD":isInd?"#F0F7FF":"#F5F5F5",border:isMe?"2px solid #0D47A1":"1px solid #e2e8f0"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:i<3?24:13,fontWeight:700,color:"#64748b",minWidth:30,textAlign:"center"}}>{medal}</span>
              <div><div style={{fontWeight:800,fontSize:14,color:isMe?"#0D47A1":"#1a1a2e"}}>{e.player_name}{isMe&&<span style={{fontSize:9,opacity:0.6,marginLeft:3}}>(you)</span>}</div>
                <div style={{fontSize:9,color:"#64748b"}}>{isInd?"🇮🇳":"🇳🇿"} {e.match_winner||""}</div></div>
            </div>
            <div style={{textAlign:"right"}}><div style={{fontFamily:"Teko,sans-serif",fontSize:28,fontWeight:700,color:e.score>0?"#16a34a":"#94a3b8",lineHeight:1}}>{e.score||0}</div><div style={{fontSize:8,color:"#64748b",fontWeight:700,letterSpacing:1}}>PTS</div></div>
          </div>)})}</div>}
    </div>
    {results?.match_winner&&<div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:20,boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
      <h3 style={{fontFamily:"Teko,sans-serif",fontSize:20,color:"#1a1a1a",margin:"0 0 10px"}}>📋 RESULTS</h3>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {results.match_winner&&<span style={{background:"#dcfce7",color:"#16a34a",padding:"3px 11px",borderRadius:20,fontSize:10,fontWeight:800}}>{results.match_winner}</span>}
        {results.top_scorer&&<span style={{background:"#E3F2FD",color:"#0D47A1",padding:"3px 11px",borderRadius:20,fontSize:10,fontWeight:800}}>{results.top_scorer}</span>}
        {results.player_of_match&&<span style={{background:"#ede9fe",color:"#7c3aed",padding:"3px 11px",borderRadius:20,fontSize:10,fontWeight:800}}>{results.player_of_match}</span>}
      </div>
    </div>}
  </div>);
}
