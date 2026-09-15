const VERSION='0.6.2';
function json(body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    }
  });
}
export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(u.pathname==='/api/crewlink/status'&&request.method==='GET'){
      return json({
        available:true,
        mode:'browser-extension',
        configured:true,
        version:VERSION,
        transport:'local-chrome-bridge'
      });
    }
    if(u.pathname.startsWith('/api/')) return json({error:'Ruta no encontrada.'},404);
    return env.ASSETS.fetch(request);
  }
};
