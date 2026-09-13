(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CrewLinkChanges=api;})(typeof window==='undefined'?globalThis:window,function(){
  const fields=['kind','date','status','checkIn','checkout','route','base','checkoutBase','type','dt','ft','fdp','sdt','acc'];
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
  function fingerprint(d){return JSON.stringify(canonical({...Object.fromEntries(fields.map(k=>[k,d[k]??null])),flights:d.flights||[]}));}
  function period(list,start,end){return (list||[]).filter(d=>{const day=d.date||String(d.checkIn||'').slice(0,10);return day>=start&&day<=end;});}
  function label(d){return `${d.date||String(d.checkIn||'').slice(0,10)} · ${d.route||d.status||d.type||'Servicio'}`;}
  function compare(before,after,start,end){
    const old=period(before,start,end),remaining=period(after,start,end).slice(),removed=[];
    for(const d of old){const i=remaining.findIndex(n=>fingerprint(n)===fingerprint(d));if(i>=0)remaining.splice(i,1);else removed.push(d);}
    const modified=[];
    const pairs=removed.filter(d=>removed.filter(x=>x.date===d.date&&x.kind===d.kind).length===1&&remaining.filter(x=>x.date===d.date&&x.kind===d.kind).length===1);
    for(const d of pairs){const n=remaining.findIndex(x=>x.date===d.date&&x.kind===d.kind);modified.push({before:d,after:remaining.splice(n,1)[0]});removed.splice(removed.indexOf(d),1);}
    return {added:remaining,removed,modified,initial:old.length===0};
  }
  return {compare,label,fingerprint,period};
});
