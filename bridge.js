(()=>{
  const READY='ROSTERHOME_CREWLINK_READY',REQ='ROSTERHOME_CREWLINK_REQUEST',RES='ROSTERHOME_CREWLINK_RESPONSE',PING='ROSTERHOME_CREWLINK_PING';
  const sendReady=()=>window.postMessage({source:'rosterhome-bridge',kind:READY,version:chrome.runtime.getManifest().version},location.origin);
  window.addEventListener('message',event=>{
    if(event.source!==window||event.origin!==location.origin||!event.data||event.data.source!=='rosterhome-page')return;
    const m=event.data;
    if(m.kind===PING){sendReady();return;}
    if(m.kind!==REQ||!m.requestId)return;
    chrome.runtime.sendMessage({kind:'crewlink',type:m.type,payload:m.payload},response=>{
      const err=chrome.runtime.lastError;
      if(err){
        window.postMessage({source:'rosterhome-bridge',kind:RES,requestId:m.requestId,ok:false,error:err.message},location.origin);
        return;
      }
      window.postMessage({source:'rosterhome-bridge',kind:RES,requestId:m.requestId,...response},location.origin);
    });
  });
  sendReady();
})();
