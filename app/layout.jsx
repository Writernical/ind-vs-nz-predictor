import "./globals.css";
export const metadata = { title: "🏏 IND vs NZ — T20 WC 2026 Final Predictor" };
export default function RootLayout({ children }) {
  return (<html lang="en"><body className="antialiased">
    <header style={{position:"relative",overflow:"hidden"}}>
      <div style={{display:"flex",minHeight:100}}>
        <div style={{flex:1,background:"linear-gradient(135deg,#0D47A1,#1565C0)",padding:"16px 16px 16px 20px",position:"relative",clipPath:"polygon(0 0,100% 0,93% 100%,0 100%)"}}>
          <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(90deg,rgba(255,255,255,0.06) 0px,rgba(255,255,255,0.06) 3px,transparent 3px,transparent 14px)"}}/>
          <div style={{position:"absolute",right:0,top:0,width:6,height:"100%",background:"linear-gradient(180deg,#FF6F00,#FF8F00,#FF6F00)"}}/>
          <div style={{position:"relative"}}><div style={{fontFamily:"Teko,sans-serif",fontSize:10,letterSpacing:4,color:"rgba(255,255,255,0.7)",fontWeight:700}}>DEFENDING CHAMPIONS</div><div style={{fontFamily:"Teko,sans-serif",fontSize:40,fontWeight:700,color:"#fff",lineHeight:1}}>🇮🇳 INDIA</div></div>
        </div>
        <div style={{flex:1,background:"linear-gradient(135deg,#1a1a1a,#333)",padding:"16px 20px 16px 32px",position:"relative",clipPath:"polygon(7% 0,100% 0,100% 100%,0 100%)",marginLeft:-24}}>
          <div style={{position:"absolute",left:0,top:0,width:4,height:"100%",background:"linear-gradient(180deg,#666,#ccc,#666)"}}/>
          <div style={{position:"relative",textAlign:"right"}}><div style={{fontFamily:"Teko,sans-serif",fontSize:10,letterSpacing:4,color:"rgba(255,255,255,0.5)",fontWeight:700}}>THE BLACK CAPS</div><div style={{fontFamily:"Teko,sans-serif",fontSize:40,fontWeight:700,color:"#e0e0e0",lineHeight:1}}>NZ 🇳🇿</div></div>
        </div>
      </div>
      <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:10}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#FF6F00,#FF8F00)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(255,111,0,0.3)",border:"3px solid #fff"}}>
          <span style={{fontFamily:"Teko,sans-serif",fontSize:20,fontWeight:700,color:"#fff"}}>VS</span>
        </div>
      </div>
      <div style={{background:"linear-gradient(90deg,#E3F2FD,#FFF3E0)",padding:"7px 0",textAlign:"center",borderBottom:"1px solid #e2e8f0"}}>
        <span style={{fontFamily:"Teko,sans-serif",fontSize:12,fontWeight:700,letterSpacing:4,color:"#0D47A1"}}>🏏 T20 WORLD CUP 2026 • FINAL • PREDICT & WIN 🏆</span>
      </div>
    </header>
    <nav style={{maxWidth:640,margin:"0 auto",padding:"12px 14px 0"}}>
      <div style={{display:"flex",gap:3,background:"#f1f5f9",borderRadius:12,padding:3}}>
        {[{h:"/",l:"🎯 Predict"},{h:"/leaderboard",l:"🏆 Board"},{h:"/admin",l:"⚙️ Admin"}].map(t=>(<a key={t.h} href={t.h} style={{flex:1,textAlign:"center",padding:"9px 0",borderRadius:10,fontSize:12.5,fontWeight:700,fontFamily:"Teko,sans-serif",letterSpacing:1,textTransform:"uppercase",textDecoration:"none",color:"#0D47A1",background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}>{t.l}</a>))}
      </div>
    </nav>
    <main style={{maxWidth:640,margin:"0 auto",padding:"14px 14px 40px"}}>{children}</main>
<footer style={{textAlign:"center",padding:"20px 14px 30px",borderTop:"1px solid #e2e8f0"}}>
  <a href="https://writernical.com/" target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#64748b",textDecoration:"none",fontWeight:600}}>
    Developed by <span style={{color:"#0D47A1",fontWeight:700}}>Writernical</span> �✦
  </a>
</footer>
  </body></html>);
}
