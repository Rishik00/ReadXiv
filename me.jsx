import { useState, useEffect } from "react";

const t = {
  bg:"hsl(224,71%,4%)",fg:"hsl(213,31%,91%)",muted:"hsl(223,47%,11%)",mutedFg:"hsl(215,16%,57%)",
  accent:"hsl(216,34%,17%)",accentFg:"hsl(213,31%,91%)",border:"hsl(216,34%,17%)",
  primary:"hsl(210,40%,98%)",primaryFg:"hsl(222,47%,11%)",secondary:"hsl(223,47%,11%)",
  secondaryFg:"hsl(215,20%,65%)",sidebarMuted:"hsl(215,16%,47%)",
  yellow:"hsl(48,96%,53%)",yellowBg:"hsla(48,96%,53%,0.08)",
  blue:"hsl(217,91%,60%)",blueBg:"hsla(217,91%,60%,0.08)",
  green:"hsl(142,71%,45%)",greenBg:"hsla(142,71%,45%,0.08)",
};
const ff="-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const mono="'JetBrains Mono','SF Mono',ui-monospace,monospace";
const R=8,S=6;

function Kbd({children}){return <kbd style={{fontSize:10,fontFamily:mono,color:t.mutedFg,background:t.muted,border:`1px solid ${t.border}`,borderRadius:4,padding:"1px 5px",lineHeight:"16px"}}>{children}</kbd>}
function Badge({children,color,variant}){
  const base={fontSize:11,fontWeight:500,padding:"2px 8px",borderRadius:9999,lineHeight:"16px",display:"inline-flex",whiteSpace:"nowrap"};
  if(color)return <span style={{...base,background:`${color}15`,color}}>{children}</span>;
  if(variant==="outline")return <span style={{...base,background:"transparent",color:t.mutedFg,border:`1px solid ${t.border}`}}>{children}</span>;
  return <span style={{...base,background:t.secondary,color:t.secondaryFg,border:`1px solid ${t.border}`}}>{children}</span>;
}
function Btn({children,v="default",style:s,...p}){
  const base={fontFamily:ff,fontWeight:500,cursor:"pointer",borderRadius:S,transition:"all 0.15s",display:"inline-flex",alignItems:"center",gap:6,whiteSpace:"nowrap",lineHeight:1,fontSize:12,padding:"6px 12px"};
  const vars={
    default:{background:t.primary,color:t.primaryFg,border:"none"},
    secondary:{background:t.secondary,color:t.secondaryFg,border:`1px solid ${t.border}`},
    outline:{background:"transparent",color:t.fg,border:`1px solid ${t.border}`},
    ghost:{background:"transparent",color:t.mutedFg,border:"1px solid transparent"},
  };
  return <button style={{...base,...vars[v],...s}} {...p}>{children}</button>;
}
function Sep({v,style:s}){return <div style={{background:t.border,...(v?{width:1,alignSelf:"stretch"}:{height:1,width:"100%"}),...s}}/>}

// ─── Sidebar ───
function Sidebar({page,setPage,openCmd}){
  const nav=[{id:"home",icon:"⌂",label:"Home"},{id:"shelf",icon:"☰",label:"Paper Shelf"},{id:"reader",icon:"◫",label:"Reader"},{id:"canvas",icon:"◇",label:"Canvas"},{id:"publish",icon:"↗",label:"Publish"},{id:"ext",icon:"⬡",label:"Extension"}];
  return(
    <div style={{width:220,background:t.bg,borderRight:`1px solid ${t.border}`,display:"flex",flexDirection:"column",flexShrink:0,height:"100vh",position:"sticky",top:0}}>
      <div style={{padding:"16px 16px 12px"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <div style={{width:20,height:20,borderRadius:5,background:t.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:t.primaryFg,fontWeight:800}}>P</div>
          <span style={{fontSize:13,fontWeight:600,letterSpacing:"-0.02em"}}>Papyrus</span>
          <span style={{marginLeft:"auto",fontSize:10,color:t.sidebarMuted,fontFamily:mono}}>v0.1</span>
        </div>
        <button onClick={openCmd} style={{width:"100%",display:"flex",alignItems:"center",gap:8,background:t.muted,border:`1px solid ${t.border}`,borderRadius:S,padding:"6px 10px",cursor:"pointer"}}>
          <span style={{fontSize:12,color:t.sidebarMuted}}>⌕</span>
          <span style={{fontSize:12,color:t.sidebarMuted,fontFamily:ff,flex:1,textAlign:"left"}}>Search...</span>
          <Kbd>⌘K</Kbd>
        </button>
      </div>
      <Sep/>
      <div style={{padding:8,flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:1}}>
        <div style={{padding:"4px 8px",marginBottom:4,fontSize:10,fontWeight:600,color:t.sidebarMuted,textTransform:"uppercase",letterSpacing:"0.06em"}}>Navigation</div>
        {nav.map(n=>(
          <button key={n.id} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:page===n.id?t.accent:"transparent",color:page===n.id?t.accentFg:t.sidebarMuted,border:"none",borderRadius:S,padding:"7px 10px",fontSize:13,fontFamily:ff,fontWeight:page===n.id?500:400,cursor:"pointer",textAlign:"left",transition:"all 0.1s"}}>
            <span style={{fontSize:14,width:18,textAlign:"center",opacity:page===n.id?1:0.6}}>{n.icon}</span>{n.label}
          </button>
        ))}
        <div style={{padding:"12px 8px 4px",fontSize:10,fontWeight:600,color:t.sidebarMuted,textTransform:"uppercase",letterSpacing:"0.06em"}}>Recent</div>
        {["Attention Is All You Need","Flash Attention","Scaling Laws"].map((p,i)=>(
          <button key={i} onClick={()=>setPage("reader")} style={{display:"flex",alignItems:"center",gap:8,width:"100%",background:"transparent",color:t.sidebarMuted,border:"none",borderRadius:S,padding:"5px 10px",fontSize:12,fontFamily:ff,cursor:"pointer",textAlign:"left"}}>
            <span style={{fontSize:12,opacity:0.4}}>◫</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p}</span>
          </button>
        ))}
      </div>
      <Sep/>
      <div style={{padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:22,height:22,borderRadius:9999,background:t.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:600}}>R</div>
          <span style={{fontSize:12,color:t.mutedFg}}>Rishi</span>
        </div>
        <span style={{fontSize:14,color:t.sidebarMuted,cursor:"pointer"}}>⚙</span>
      </div>
    </div>
  );
}

// ─── Command Palette ───
function CmdPalette({open,onClose,setPage}){
  const [q,setQ]=useState("");
  if(!open)return null;
  const items=[
    {g:"Papers",items:[{icon:"◫",label:"Attention Is All You Need",sub:"Vaswani et al. · 2017"},{icon:"◫",label:"Scaling Laws for Neural LMs",sub:"Kaplan et al. · 2020"},{icon:"◫",label:"Flash Attention",sub:"Dao et al. · 2022"}]},
    {g:"Actions",items:[{icon:"+",label:"Add paper from URL",kbd:"⌘N"},{icon:"☰",label:"Open Paper Shelf",kbd:"⌘1",page:"shelf"},{icon:"◇",label:"Open Canvas",kbd:"⌘3",page:"canvas"},{icon:"↗",label:"Publish notes",kbd:"⌘⇧P",page:"publish"}]},
  ];
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:100,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"18vh"}}>
      <div onClick={e=>e.stopPropagation()} style={{width:480,background:t.bg,border:`1px solid ${t.border}`,borderRadius:10,overflow:"hidden",boxShadow:"0 16px 48px rgba(0,0,0,0.4)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderBottom:`1px solid ${t.border}`}}>
          <span style={{fontSize:14,color:t.mutedFg}}>⌕</span>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type a command or search papers..." style={{flex:1,background:"transparent",border:"none",outline:"none",fontSize:14,color:t.fg,fontFamily:ff}}/>
          <Kbd>esc</Kbd>
        </div>
        <div style={{maxHeight:320,overflow:"auto",padding:"4px 0"}}>
          {items.map((g,gi)=>(
            <div key={gi}>
              <div style={{padding:"8px 14px 4px",fontSize:11,fontWeight:500,color:t.mutedFg}}>{g.g}</div>
              {g.items.filter(i=>!q||i.label.toLowerCase().includes(q.toLowerCase())).map((item,ii)=>(
                <div key={ii} onClick={()=>{if(item.page)setPage(item.page);onClose();}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",cursor:"pointer",transition:"background 0.1s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=t.accent} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{fontSize:13,color:t.mutedFg,width:18,textAlign:"center"}}>{item.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:t.fg}}>{item.label}</div>
                    {item.sub&&<div style={{fontSize:11,color:t.mutedFg}}>{item.sub}</div>}
                  </div>
                  {item.kbd&&<Kbd>{item.kbd}</Kbd>}
                </div>
              ))}
            </div>
          ))}
          {q&&<div style={{padding:"12px 14px",fontSize:13,color:t.mutedFg,textAlign:"center"}}>Search arxiv for "{q}" ↵</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Home ───
function Home(){
  const[val,setVal]=useState("");
  const det=val.includes("arxiv.org")?"arxiv URL":val.match(/^\d{4}\.\d+/)?"arxiv ID":val.startsWith(":")?"command":val.length>2?"searching...":null;
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"78vh"}}>
      <h1 style={{fontSize:28,fontWeight:600,letterSpacing:"-0.03em",marginBottom:6}}>What are you reading?</h1>
      <p style={{fontSize:14,color:t.mutedFg,marginBottom:32,maxWidth:380,textAlign:"center",lineHeight:1.6}}>Paste an arxiv link, drop a paper ID, or search.</p>
      <div style={{width:"100%",maxWidth:520,marginBottom:20}}>
        <div style={{background:t.bg,border:`1px solid ${det?`hsla(210,40%,98%,0.2)`:t.border}`,borderRadius:R,padding:"12px 16px",transition:"border-color 0.2s"}}>
          <input value={val} onChange={e=>setVal(e.target.value)} placeholder='paste arxiv link, paper ID, or :arxiv <query>' style={{width:"100%",background:"transparent",border:"none",outline:"none",fontSize:14,color:t.fg,fontFamily:ff}}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
            <div>{det&&<Badge color={det.includes("arxiv")?"hsl(217,91%,60%)":"hsl(48,96%,53%)"}>{det}</Badge>}</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}><Kbd>⌘ ↵</Kbd><Btn v={val.trim()?"default":"secondary"}>Add →</Btn></div>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
        {["2401.12345","https://arxiv.org/abs/1706.03762",":arxiv transformer survey"].map((ex,i)=>(
          <button key={i} onClick={()=>setVal(ex)} style={{background:t.muted,border:`1px solid ${t.border}`,borderRadius:S,padding:"4px 10px",fontSize:11,color:t.mutedFg,fontFamily:mono,cursor:"pointer"}}>{ex}</button>
        ))}
      </div>
      <div style={{marginTop:48,width:"100%",maxWidth:480}}>
        <p style={{fontSize:11,fontWeight:500,color:t.mutedFg,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Supported inputs</p>
        {[["https://arxiv.org/abs/...","Full arxiv URL"],["2401.12345","Bare arxiv ID"],[":arxiv <query>","Search arxiv"],[":openreview <query>","Search OpenReview"],["any text","Fuzzy search your shelf"]].map(([cmd,desc],i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"5px 0"}}>
            <code style={{fontSize:11,color:t.fg,fontFamily:mono,background:t.muted,padding:"2px 6px",borderRadius:4,border:`1px solid ${t.border}`,minWidth:200}}>{cmd}</code>
            <span style={{fontSize:12,color:t.mutedFg}}>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Shelf ───
function Shelf({setPage}){
  const[search,setSearch]=useState("");
  const[view,setView]=useState("table");
  const[hov,setHov]=useState(-1);
  const papers=[
    {title:"Attention Is All You Need",authors:"Vaswani et al.",year:2017,status:"Done",tags:["Transformers","NLP"],id:"1706.03762",added:"Feb 18"},
    {title:"Scaling Laws for Neural Language Models",authors:"Kaplan et al.",year:2020,status:"Reading",tags:["Scaling"],id:"2001.08361",added:"Feb 15"},
    {title:"The Free-Energy Principle",authors:"Friston, K.",year:2010,status:"Queued",tags:["Neuroscience"],id:"friston2010",added:"Feb 12"},
    {title:"Constitutional AI",authors:"Bai et al.",year:2022,status:"Reading",tags:["Alignment"],id:"2212.08073",added:"Feb 10"},
    {title:"Flash Attention",authors:"Dao et al.",year:2022,status:"Done",tags:["Efficiency"],id:"2205.14135",added:"Feb 8"},
    {title:"Predictive Processing and Experience",authors:"Clark, A.",year:2013,status:"Queued",tags:["CogSci"],id:"clark2013",added:"Feb 5"},
  ];
  const sc=s=>s==="Done"?t.green:s==="Reading"?t.blue:t.mutedFg;
  const f=papers.filter(p=>!search||p.title.toLowerCase().includes(search.toLowerCase())||p.tags.some(tg=>tg.toLowerCase().includes(search.toLowerCase())));
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13}}>
        <span style={{color:t.mutedFg,cursor:"pointer"}} onClick={()=>setPage("home")}>⌂</span><span style={{color:t.mutedFg,fontSize:10}}>/</span><span style={{fontWeight:500}}>Paper Shelf</span>
        <span style={{marginLeft:"auto",fontSize:12,color:t.mutedFg}}>{papers.length} papers</span>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
        <div style={{position:"relative",flex:1,maxWidth:280}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",fontSize:13,color:t.mutedFg,pointerEvents:"none"}}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Fuzzy search... (⌘F)" style={{width:"100%",background:t.bg,border:`1px solid ${t.border}`,borderRadius:S,padding:"7px 12px 7px 32px",fontSize:13,color:t.fg,fontFamily:ff,outline:"none"}}/>
        </div>
        <Btn v="outline">Status ▾</Btn><Btn v="outline">Tags ▾</Btn>
        <Sep v style={{height:20}}/>
        <div style={{display:"flex",gap:2,background:t.muted,borderRadius:S,padding:2,border:`1px solid ${t.border}`}}>
          {[["table","☰"],["canvas","◇"]].map(([v,ic])=>(
            <button key={v} onClick={()=>setView(v)} style={{background:view===v?t.accent:"transparent",color:view===v?t.fg:t.mutedFg,border:"none",borderRadius:4,padding:"4px 8px",fontSize:12,cursor:"pointer",fontFamily:ff}}>{ic}</button>
          ))}
        </div>
        <Sep v style={{height:20}}/>
        <Btn>+ Add paper</Btn><Kbd>⌘N</Kbd>
      </div>
      {view==="table"?(
        <div style={{border:`1px solid ${t.border}`,borderRadius:R,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"2.2fr 1fr 0.5fr 0.6fr 0.8fr 0.5fr",padding:"8px 16px",background:t.muted,borderBottom:`1px solid ${t.border}`}}>
            {["Paper","Authors","Year","Status","Tags","Added"].map((h,i)=><div key={i} style={{fontSize:11,fontWeight:500,color:t.mutedFg}}>{h}</div>)}
          </div>
          {f.map((p,i)=>(
            <div key={i} onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(-1)} onClick={()=>setPage("reader")}
              style={{display:"grid",gridTemplateColumns:"2.2fr 1fr 0.5fr 0.6fr 0.8fr 0.5fr",padding:"10px 16px",borderBottom:i<f.length-1?`1px solid ${t.border}`:"none",background:hov===i?t.accent:"transparent",cursor:"pointer",transition:"background 0.1s",alignItems:"center"}}>
              <div><div style={{fontSize:13,fontWeight:500,lineHeight:1.4}}>{p.title}</div><div style={{fontSize:11,fontFamily:mono,color:t.mutedFg,marginTop:1}}>{p.id}</div></div>
              <div style={{fontSize:12,color:t.mutedFg}}>{p.authors}</div>
              <div style={{fontSize:12,color:t.mutedFg,fontFamily:mono}}>{p.year}</div>
              <div><Badge color={sc(p.status)}>{p.status}</Badge></div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{p.tags.map((tg,j)=><Badge key={j} variant="outline">{tg}</Badge>)}</div>
              <div style={{fontSize:11,color:t.mutedFg}}>{p.added}</div>
            </div>
          ))}
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {f.map((p,i)=>(
            <div key={i} onClick={()=>setPage("reader")} style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:R,padding:14,cursor:"pointer",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="hsl(215,20%,30%)";e.currentTarget.style.transform="translateY(-1px)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=t.border;e.currentTarget.style.transform="none";}}>
              <div style={{background:t.muted,borderRadius:S,height:100,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",border:`1px solid ${t.border}`,fontSize:10,fontFamily:mono,color:t.mutedFg}}>{p.id}</div>
              <div style={{fontSize:13,fontWeight:500,marginBottom:4,lineHeight:1.4}}>{p.title}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:11,color:t.mutedFg}}>{p.authors}</span><Badge color={sc(p.status)}>{p.status}</Badge></div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:4,marginTop:16}}>
        <Btn v="ghost">← Prev</Btn>
        {[1,2,3].map(n=><button key={n} style={{width:28,height:28,borderRadius:S,border:n===1?`1px solid ${t.border}`:"1px solid transparent",background:n===1?t.accent:"transparent",color:n===1?t.fg:t.mutedFg,fontSize:12,fontFamily:ff,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>{n}</button>)}
        <Btn v="ghost">Next →</Btn>
      </div>
    </div>
  );
}

// ─── Reader ───
function Reader({setPage}){
  const[noteTab,setNoteTab]=useState("notes");
  const[hc,setHc]=useState(false);
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13}}>
        <span style={{color:t.mutedFg,cursor:"pointer"}} onClick={()=>setPage("shelf")}>Paper Shelf</span><span style={{color:t.mutedFg,fontSize:10}}>/</span><span style={{fontWeight:500}}>Attention Is All You Need</span>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{display:"flex",gap:4,alignItems:"center"}}><Kbd>⌘H</Kbd><span style={{fontSize:11,color:t.mutedFg}}>highlight</span></span>
          <span style={{display:"flex",gap:4,alignItems:"center"}}><Kbd>⌘D</Kbd><span style={{fontSize:11,color:t.mutedFg}}>dictate</span></span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1.35fr 1fr",gap:14,minHeight:520}}>
        {/* PDF */}
        <div style={{border:`1px solid ${t.border}`,borderRadius:R,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"6px 12px",borderBottom:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:t.muted}}>
            <div style={{display:"flex",gap:6,alignItems:"center"}}><Btn v="ghost">◀</Btn><span style={{fontSize:12,color:t.mutedFg,fontFamily:mono}}>1 / 15</span><Btn v="ghost">▶</Btn></div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}><Btn v="ghost">−</Btn><span style={{fontSize:11,color:t.mutedFg,fontFamily:mono}}>100%</span><Btn v="ghost">+</Btn><Sep v style={{height:16}}/><Btn v="ghost">⋯</Btn></div>
          </div>
          <div style={{flex:1,padding:20,overflow:"auto"}}>
            <div style={{maxWidth:520,margin:"0 auto"}}>
              <h1 style={{fontSize:20,fontWeight:700,letterSpacing:"-0.02em",marginBottom:6,lineHeight:1.3}}>Attention Is All You Need</h1>
              <p style={{fontSize:12,color:t.mutedFg,marginBottom:4}}>Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit, Llion Jones, Aidan N. Gomez, Łukasz Kaiser, Illia Polosukhin</p>
              <p style={{fontSize:11,color:t.mutedFg,fontFamily:mono,marginBottom:20}}>arXiv:1706.03762 · June 2017</p>
              <h2 style={{fontSize:14,fontWeight:600,marginBottom:8}}>Abstract</h2>
              <p style={{fontSize:13,color:t.mutedFg,lineHeight:1.85,marginBottom:14}}>The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.</p>
              {/* Highlight yellow */}
              <div onMouseEnter={()=>setHc(true)} onMouseLeave={()=>setHc(false)} style={{background:t.yellowBg,borderLeft:`2px solid ${t.yellow}`,padding:"8px 12px",borderRadius:`0 ${S}px ${S}px 0`,marginBottom:14,position:"relative"}}>
                <p style={{fontSize:13,color:t.fg,lineHeight:1.85,margin:0}}>We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.</p>
                <div style={{fontSize:10,color:t.yellow,marginTop:6,fontWeight:500}}>⊙ annotation linked</div>
                {hc&&<div style={{position:"absolute",top:-60,right:-210,width:200,background:t.bg,border:`1px solid ${t.border}`,borderRadius:R,padding:10,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",zIndex:10}}>
                  <div style={{fontSize:11,fontWeight:500,marginBottom:4}}>Linked note</div>
                  <div style={{fontSize:11,color:t.mutedFg,lineHeight:1.5}}>Key innovation: removing recurrence entirely. Pure attention + FF layers.</div>
                </div>}
              </div>
              <p style={{fontSize:13,color:t.mutedFg,lineHeight:1.85,marginBottom:14}}>Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable.</p>
              <div style={{background:t.blueBg,borderLeft:`2px solid ${t.blue}`,padding:"8px 12px",borderRadius:`0 ${S}px ${S}px 0`,marginBottom:14}}>
                <p style={{fontSize:13,color:t.fg,lineHeight:1.85,margin:0}}>Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU.</p>
                <div style={{fontSize:10,color:t.blue,marginTop:6,fontWeight:500}}>⊙ annotation linked</div>
              </div>
            </div>
          </div>
        </div>
        {/* Notes */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{display:"flex",gap:2,background:t.muted,borderRadius:S,padding:2,border:`1px solid ${t.border}`}}>
            {[["notes","Notes"],["annotations","Annotations"],["sketch","Sketch"]].map(([id,label])=>(
              <button key={id} onClick={()=>setNoteTab(id)} style={{flex:1,background:noteTab===id?t.bg:"transparent",color:noteTab===id?t.fg:t.mutedFg,border:noteTab===id?`1px solid ${t.border}`:"1px solid transparent",borderRadius:4,padding:"6px 0",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:ff}}>{label}</button>
            ))}
          </div>
          {noteTab==="notes"&&(
            <div style={{border:`1px solid ${t.border}`,borderRadius:R,flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"8px 14px",borderBottom:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:t.muted}}>
                <span style={{fontSize:12,fontWeight:500,fontFamily:mono}}>notes.md</span><span style={{fontSize:10,color:t.mutedFg}}>auto-saved</span>
              </div>
              <div style={{flex:1,padding:16,fontFamily:mono,fontSize:12,color:t.mutedFg,lineHeight:1.9}}>
                <div style={{fontSize:16,fontWeight:600,color:t.fg,marginBottom:8,fontFamily:ff}}>Key Takeaways</div>
                <p style={{marginBottom:12}}>The core innovation is removing recurrence entirely. The whole architecture is self-attention + feed-forward layers. This enabled massive parallelization.</p>
                <div style={{fontSize:16,fontWeight:600,color:t.fg,marginBottom:8,fontFamily:ff}}>Questions</div>
                <p style={{marginBottom:8}}>— How does sinusoidal positional encoding compare to learned embeddings?</p>
                <p style={{marginBottom:8}}>— Cross-reference with Kaplan et al. on scaling behavior</p>
                <p style={{opacity:0.4}}>|</p>
              </div>
              <div style={{padding:"8px 14px",borderTop:`1px solid ${t.border}`,display:"flex",gap:6,alignItems:"center"}}><Kbd>⌘D</Kbd><span style={{fontSize:11,color:t.mutedFg}}>dictate</span><Sep v style={{height:14}}/><span style={{fontSize:11,color:t.mutedFg}}>markdown</span></div>
            </div>
          )}
          {noteTab==="annotations"&&(
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
              {[{text:"...the Transformer, based solely on attention mechanisms...",color:t.yellow,note:"Key innovation: removing recurrence entirely.",pg:1},{text:"...achieves 28.4 BLEU on the WMT 2014...",color:t.blue,note:"SOTA at time — compare Table 3",pg:7}].map((a,i)=>(
                <div key={i} style={{border:`1px solid ${t.border}`,borderRadius:R,padding:12,borderLeft:`2px solid ${a.color}`}}>
                  <p style={{fontSize:12,color:t.fg,lineHeight:1.6,fontStyle:"italic",marginBottom:6}}>"{a.text}"</p>
                  <p style={{fontSize:12,color:t.mutedFg,lineHeight:1.5,marginBottom:6}}>{a.note}</p>
                  <span style={{fontSize:10,fontFamily:mono,color:t.mutedFg}}>p. {a.pg}</span>
                </div>
              ))}
              <Btn v="outline" style={{alignSelf:"flex-start"}}>+ Add annotation</Btn>
            </div>
          )}
          {noteTab==="sketch"&&(
            <div style={{border:`1px solid ${t.border}`,borderRadius:R,flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
              <div style={{padding:"6px 12px",borderBottom:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",background:t.muted}}>
                <div style={{display:"flex",gap:4}}>{["Select","Draw","Arrow","Text","Sticky"].map((tool,i)=><button key={i} style={{fontSize:11,color:i===0?t.fg:t.mutedFg,background:i===0?t.accent:"transparent",border:"none",borderRadius:4,padding:"3px 8px",cursor:"pointer",fontFamily:ff}}>{tool}</button>)}</div>
                <span style={{fontSize:11,color:t.mutedFg,cursor:"pointer"}}>Open full ↗</span>
              </div>
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{textAlign:"center"}}><div style={{fontSize:32,opacity:0.15,marginBottom:8}}>✎</div><p style={{fontSize:13,color:t.mutedFg}}>tldraw canvas</p><p style={{fontSize:11,color:t.mutedFg,opacity:0.6,marginTop:4}}>Draw diagrams, map concepts</p></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Canvas ───
function Canvas({setPage}){
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13}}><span style={{color:t.mutedFg,cursor:"pointer"}} onClick={()=>setPage("home")}>⌂</span><span style={{color:t.mutedFg,fontSize:10}}>/</span><span style={{fontWeight:500}}>Canvas</span></div>
      <div style={{border:`1px solid ${t.border}`,borderRadius:R,overflow:"hidden",minHeight:460,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"6px 12px",borderBottom:`1px solid ${t.border}`,display:"flex",gap:4,background:t.muted}}>
          {["Select","Draw","Arrow","Text","Sticky","Paper Node"].map((tool,i)=><button key={i} style={{fontSize:11,color:i===0?t.fg:t.mutedFg,background:i===0?t.accent:"transparent",border:"none",borderRadius:4,padding:"4px 10px",cursor:"pointer",fontFamily:ff}}>{tool}</button>)}
          <div style={{marginLeft:"auto"}}><Kbd>⌘Z</Kbd></div>
        </div>
        <div style={{flex:1,position:"relative",height:420}}>
          <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}}><line x1="180" y1="70" x2="340" y2="170" stroke={t.border} strokeWidth="1" strokeDasharray="4"/><line x1="540" y1="70" x2="400" y2="170" stroke={t.border} strokeWidth="1" strokeDasharray="4"/><line x1="370" y1="210" x2="280" y2="300" stroke={t.border} strokeWidth="1" strokeDasharray="4"/></svg>
          {[{x:50,y:30,title:"Attention Is All You Need",sub:"Vaswani et al. 2017",w:200},{x:420,y:30,title:"Scaling Laws",sub:"Kaplan et al. 2020",w:170},{x:150,y:280,title:"Flash Attention",sub:"Dao et al. 2022",w:170}].map((n,i)=>(
            <div key={i} style={{position:"absolute",left:n.x,top:n.y,width:n.w,background:t.bg,border:`1px solid ${t.border}`,borderRadius:R,padding:10,cursor:"grab"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="hsl(215,20%,30%)"} onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
              <div style={{fontSize:12,fontWeight:500,lineHeight:1.4}}>{n.title}</div><div style={{fontSize:10,color:t.mutedFg,marginTop:2,fontFamily:mono}}>{n.sub}</div>
            </div>
          ))}
          <div style={{position:"absolute",left:280,top:150,width:200,background:t.yellowBg,border:`1px solid hsla(48,96%,53%,0.19)`,borderRadius:R,padding:10,fontSize:11,color:t.yellow,lineHeight:1.5}}>How do these relate to Flash Attention efficiency gains?</div>
        </div>
      </div>
    </div>
  );
}

// ─── Publish ───
function Publish({setPage}){
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13}}><span style={{color:t.mutedFg,cursor:"pointer"}} onClick={()=>setPage("home")}>⌂</span><span style={{color:t.mutedFg,fontSize:10}}>/</span><span style={{fontWeight:500}}>Publish</span></div>
      <p style={{fontSize:13,color:t.mutedFg,marginBottom:20}}>Export notes as styled HTML → push to GitHub → Vercel auto-deploys.</p>
      {[{title:"Pipeline",content:(
        <div style={{display:"flex"}}>{[{n:"1",t:"Write",d:"Markdown notes"},{n:"2",t:"Style",d:"Pick template"},{n:"3",t:"Build",d:"md → HTML"},{n:"4",t:"Push",d:"Git commit"},{n:"5",t:"Live",d:"Vercel deploys"}].map((s,i)=>(
          <div key={i} style={{flex:1,padding:14,borderRight:i<4?`1px solid ${t.border}`:"none"}}><div style={{fontSize:10,fontWeight:600,color:t.mutedFg,fontFamily:mono,marginBottom:4}}>{s.n}</div><div style={{fontSize:13,fontWeight:500,marginBottom:2}}>{s.t}</div><div style={{fontSize:11,color:t.mutedFg}}>{s.d}</div></div>
        ))}</div>
      )},{title:"Setup",content:(
        <div style={{padding:14,fontFamily:mono,fontSize:11,color:t.mutedFg,lineHeight:2}}>
          <div><span style={{color:t.fg}}>$</span> papyrus publish init</div><div style={{color:"hsl(215,16%,37%)"}}># Creates github.com/you/papyrus-notes</div>
          <div><span style={{color:t.fg}}>$</span> vercel link</div><div style={{color:"hsl(215,16%,37%)"}}># One-time Vercel connection</div>
          <div><span style={{color:t.fg}}>$</span> papyrus publish push</div>
        </div>
      )},{title:"Preview",header_extra:(<div style={{display:"flex",gap:6,alignItems:"center"}}><Badge color={t.green}>● Live</Badge><Btn>Copy link</Btn></div>),content:(
        <div style={{padding:24,background:"#fafafa",borderRadius:"0 0 8px 8px"}}>
          <div style={{maxWidth:480,margin:"0 auto"}}><div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.1em",color:"#888",marginBottom:6}}>Rishi's Reading Notes</div><div style={{fontSize:22,fontWeight:700,color:"#111",fontFamily:"Georgia,serif",marginBottom:4,letterSpacing:"-0.02em"}}>Attention Is All You Need</div><div style={{fontSize:12,color:"#666",marginBottom:16}}>Vaswani et al. · 2017 · annotated Feb 18, 2026</div><div style={{fontSize:13,color:"#333",lineHeight:1.85}}>The core innovation is removing recurrence entirely. The whole architecture is self-attention + feed-forward layers...</div></div>
        </div>
      )}].map((card,i)=>(
        <div key={i} style={{border:`1px solid ${t.border}`,borderRadius:R,overflow:"hidden",marginBottom:12}}>
          <div style={{padding:"8px 14px",background:t.muted,borderBottom:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:12,fontWeight:500}}>{card.title}</span>{card.header_extra}</div>
          {card.content}
        </div>
      ))}
    </div>
  );
}

// ─── Extension ───
function Ext({setPage}){
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13}}><span style={{color:t.mutedFg,cursor:"pointer"}} onClick={()=>setPage("home")}>⌂</span><span style={{color:t.mutedFg,fontSize:10}}>/</span><span style={{fontWeight:500}}>Chrome Extension</span></div>
      <p style={{fontSize:13,color:t.mutedFg,marginBottom:20}}><Kbd>⌘⇧P</Kbd> on any paper page. Instant capture.</p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <div>
          <p style={{fontSize:11,fontWeight:500,color:t.mutedFg,marginBottom:8}}>Extension Popup</p>
          <div style={{width:280,border:`1px solid ${t.border}`,borderRadius:R,overflow:"hidden"}}>
            <div style={{padding:"8px 12px",borderBottom:`1px solid ${t.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:16,height:16,borderRadius:4,background:t.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:t.primaryFg,fontWeight:800}}>P</div><span style={{fontSize:12,fontWeight:600}}>Papyrus</span></div>
              <Badge color={t.green}>● local</Badge>
            </div>
            <div style={{padding:12,display:"flex",flexDirection:"column",gap:10}}>
              <div><div style={{fontSize:13,fontWeight:500}}>Attention Is All You Need</div><div style={{fontSize:11,color:t.mutedFg,marginTop:2}}>Vaswani et al. · arxiv.org</div></div>
              <div style={{fontFamily:mono,fontSize:10,color:t.blue,background:t.blueBg,padding:"6px 8px",borderRadius:S,wordBreak:"break-all"}}>arxiv.org/abs/1706.03762</div>
              <div style={{display:"flex",gap:4}}><Badge variant="outline">Transformers</Badge><Badge variant="outline">NLP</Badge><button style={{fontSize:10,color:t.mutedFg,background:"transparent",border:`1px dashed ${t.border}`,borderRadius:S,padding:"2px 8px",cursor:"pointer",fontFamily:ff}}>+ tag</button></div>
              <div style={{display:"flex",gap:4}}>
                {["Queued","Reading"].map((s,i)=><button key={i} style={{flex:1,fontSize:11,fontWeight:500,fontFamily:ff,color:i===0?t.fg:t.mutedFg,background:i===0?t.accent:"transparent",border:`1px solid ${t.border}`,borderRadius:S,padding:"5px 0",cursor:"pointer",textAlign:"center"}}>{s}</button>)}
              </div>
              <Btn style={{width:"100%",justifyContent:"center"}}>Add to Shelf →</Btn>
            </div>
          </div>
        </div>
        <div>
          <p style={{fontSize:11,fontWeight:500,color:t.mutedFg,marginBottom:8}}>Capture flow</p>
          <div style={{display:"grid",gap:8}}>
            {[["⌨","Browse any paper page — arxiv, OpenReview, Semantic Scholar"],["⌘","Hit ⌘⇧P. Extension reads page metadata and finds PDF link."],["→","POST to localhost:7474. Papyrus downloads PDF, creates notes.md."],["✓","Toast confirmation. Paper appears in shelf. Start reading."]].map(([icon,text],i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:10,border:`1px solid ${t.border}`,borderRadius:S}}>
                <span style={{fontSize:14,width:20,textAlign:"center",flexShrink:0}}>{icon}</span><span style={{fontSize:12,color:t.mutedFg,lineHeight:1.5}}>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App(){
  const[page,setPage]=useState("home");
  const[cmdOpen,setCmdOpen]=useState(false);
  useEffect(()=>{
    const h=e=>{if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmdOpen(o=>!o);}if(e.key==="Escape")setCmdOpen(false);};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);
  return(
    <div style={{background:t.bg,minHeight:"100vh",fontFamily:ff,color:t.fg,display:"flex"}}>
      <Sidebar page={page} setPage={setPage} openCmd={()=>setCmdOpen(true)}/>
      <CmdPalette open={cmdOpen} onClose={()=>setCmdOpen(false)} setPage={setPage}/>
      <div style={{flex:1,overflow:"auto",maxHeight:"100vh"}}>
        <div style={{padding:"28px 36px",maxWidth:880,margin:"0 auto"}}>
          {page==="home"&&<Home/>}
          {page==="shelf"&&<Shelf setPage={setPage}/>}
          {page==="reader"&&<Reader setPage={setPage}/>}
          {page==="canvas"&&<Canvas setPage={setPage}/>}
          {page==="publish"&&<Publish setPage={setPage}/>}
          {page==="ext"&&<Ext setPage={setPage}/>}
        </div>
      </div>
    </div>
  );
}