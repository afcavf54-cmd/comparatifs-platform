'use client'

import { useEffect, useState } from 'react'
import { supabase, type Site, type Build } from '@/lib/supabase'

export default function DashboardPage() {
  const [sites, setSites] = useState<Site[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: sitesData } = await supabase.from('sites').select('*').order('created_at', { ascending: false })
        const { data: buildsData } = await supabase.from('builds').select('*').order('created_at', { ascending: false }).limit(10)
        setSites(sitesData || [])
        setBuilds(buildsData || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function triggerGenerate(site: Site) {
    await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site_slug: site.slug, site_id: site.id, trigger: 'manual' }),
    })
    alert(`Génération lancée pour ${site.name} !`)
  }

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'system-ui'}}>Chargement…</div>

  return (
    <div style={{maxWidth:900,margin:'0 auto',padding:'32px 20px',fontFamily:'system-ui, sans-serif',color:'#1A1714'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:600,margin:'0 0 4px'}}>Dashboard</h1>
          <p style={{fontSize:13,color:'#6B6560',margin:0}}>Plateforme comparatifs — {sites.length} site(s)</p>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        <div style={{background:'#F7F4EF',borderRadius:8,padding:'12px 14px'}}><div style={{fontSize:11,color:'#6B6560',marginBottom:4}}>Sites actifs</div><div style={{fontSize:22,fontWeight:600}}>{sites.filter(s=>s.status==='live').length}</div></div>
        <div style={{background:'#F7F4EF',borderRadius:8,padding:'12px 14px'}}><div style={{fontSize:11,color:'#6B6560',marginBottom:4}}>Sites total</div><div style={{fontSize:22,fontWeight:600}}>{sites.length}</div></div>
        <div style={{background:'#F7F4EF',borderRadius:8,padding:'12px 14px'}}><div style={{fontSize:11,color:'#6B6560',marginBottom:4}}>Pages générées</div><div style={{fontSize:22,fontWeight:600}}>{sites.reduce((a,s)=>a+(s.pages_count||0),0)}</div></div>
        <div style={{background:'#F7F4EF',borderRadius:8,padding:'12px 14px'}}><div style={{fontSize:11,color:'#6B6560',marginBottom:4}}>Dernier build</div><div style={{fontSize:14,fontWeight:600}}>{builds[0]?new Date(builds[0].created_at).toLocaleDateString('fr'):'—'}</div></div>
      </div>
      <div style={{background:'#fff',border:'0.5px solid #E2DDD6',borderRadius:12,padding:16,marginBottom:14}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>Sites</div>
        {sites.length===0 ? <p style={{fontSize:13,color:'#A09890'}}>Aucun site pour l'instant</p> : sites.map(site=>(
          <div key={site.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'0.5px solid #E2DDD6'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:site.status==='live'?'#639922':'#ccc',flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{site.name}</div>
              <div style={{fontSize:11,color:'#A09890'}}>{site.domain}{site.base_path} · {site.pages_count||0} pages</div>
            </div>
            <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:500,background:site.status==='live'?'#EAF3DE':'#F1EFE8',color:site.status==='live'?'#27500A':'#6B6560'}}>{site.status}</span>
            <button onClick={()=>triggerGenerate(site)} style={{background:'#E8410A',color:'#fff',border:'none',borderRadius:6,padding:'4px 10px',fontSize:12,cursor:'pointer'}}>Générer</button>
          </div>
        ))}
      </div>
      <div style={{background:'#fff',border:'0.5px solid #E2DDD6',borderRadius:12,padding:16}}>
        <div style={{fontSize:14,fontWeight:500,marginBottom:12}}>Builds récents</div>
        {builds.length===0?<p style={{fontSize:13,color:'#A09890'}}>Aucun build encore</p>:builds.map(build=>(
          <div key={build.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 0',borderBottom:'0.5px solid #E2DDD6',fontSize:12}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:build.status==='success'?'#639922':build.status==='error'?'#E8410A':'#FAC775'}}/>
            <span style={{fontWeight:500,minWidth:60}}>{build.status}</span>
            <span style={{color:'#6B6560',flex:1}}>{build.pages_built||0} pages · {build.trigger}</span>
            <span style={{color:'#A09890',fontSize:11}}>{new Date(build.created_at).toLocaleString('fr')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
