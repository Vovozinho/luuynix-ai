import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {OAuth2Client} from 'google-auth-library';
import Anthropic from '@anthropic-ai/sdk';
import {fileURLToPath} from 'url';

const E=process.env,OWNER=(E.OWNER_EMAIL||'holderlima96@gmail.com').toLowerCase();
const SECRET=E.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const LIMIT=+E.FREE_DAILY_LIMIT||30,PORT=+E.PORT||3000;
const dir=path.dirname(fileURLToPath(import.meta.url));
const DB=path.join(E.DATA_DIR||dir,'data.json');
const gclient=new OAuth2Client(E.GOOGLE_CLIENT_ID);
const ai=new Anthropic(); // usa ANTHROPIC_API_KEY

const MODELS={'claude-haiku-5-5':{},'claude-sonnet-5-5':{},'claude-opus-5-5':{paid:1},'claude-fable-5-2':{paid:1}};
const PLANS={w:{n:'Opus Semanal',p:14.9,d:7},m:{n:'Opus Mensal',p:39.9,d:30},a:{n:'Opus Anual',p:349,d:365}};
const SYS='Você é a Luuynix, uma IA especializada em Roblox Studio. Responda sempre em português do Brasil. Foque em Luau, serviços do Roblox (DataStoreService, RemoteEvents, TweenService etc.), GUI, física, otimização e segurança (valide tudo no servidor). Para cada script diga o tipo (Script, LocalScript ou ModuleScript) e onde colocá-lo no Explorer. Escreva código em blocos ```lua, um script por bloco. Seja direta e prática.';
const MODES={c:'Modo CRIAR: entregue o sistema completo e pronto para colar no Studio.',b:'Modo CORRIGIR: ache a causa do erro, explique em poucas linhas e mostre o código corrigido.',g:'Modo GUI: foque em interfaces (ScreenGui, UIListLayout, UDim2) e em responsividade no celular.',o:'Modo OTIMIZAR: reduza lag, memória e chamadas desnecessárias e explique os ganhos.',e:'Modo ENSINAR: explique passo a passo para iniciantes, com exemplos curtos.'};
const EFFORT={low:{cost:1,x:'Seja breve e rápida.'},med:{cost:1},high:{cost:2,think:5000},max:{cost:3,think:12000,x:'Pense com o máximo de cuidado: planeje a arquitetura, revise o código linha a linha e procure bugs e exploits antes de responder.'}};

let db={users:{},orders:[],links:{}};
try{db={...db,...JSON.parse(fs.readFileSync(DB,'utf8'))}}catch{}
const save=()=>fs.writeFileSync(DB,JSON.stringify(db));

const isOwner=u=>u.email===OWNER;
const hasOpus=u=>isOwner(u)||(u.planUntil||0)>Date.now();
const pub=u=>({name:u.name,email:u.email,picture:u.picture,owner:isOwner(u),opus:hasOpus(u),planUntil:u.planUntil||0});
const ck=(req,k)=>((req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(k+'='))||'').slice(k.length+1);
const auth=(req,res,next)=>{try{const t=jwt.verify(ck(req,'lx'),SECRET),u=db.users[t.email];if(!u)throw 0;req.u=u;next()}catch{res.status(401).json({error:'login'})}};
const adm=(req,res,next)=>isOwner(req.u)?next():res.sendStatus(403);

const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'300kb'}));
app.use(express.static(path.join(dir,'public')));
app.get('/health',(q,r)=>r.send('ok'));
app.get('/api/config',(q,r)=>r.json({googleClientId:E.GOOGLE_CLIENT_ID||''}));

app.post('/api/auth/google',async(req,res)=>{try{
 const p=(await gclient.verifyIdToken({idToken:req.body.credential,audience:E.GOOGLE_CLIENT_ID})).getPayload();
 if(!p.email_verified)return res.sendStatus(403);
 const email=p.email.toLowerCase(),u=db.users[email]||(db.users[email]={email,planUntil:0});
 u.name=p.name;u.picture=p.picture;save();
 res.cookie('lx',jwt.sign({email},SECRET,{expiresIn:'30d'}),{httpOnly:true,sameSite:'lax',secure:E.NODE_ENV==='production',maxAge:2592e6});
 res.json(pub(u));
}catch{res.sendStatus(401)}});
app.post('/api/auth/logout',(q,r)=>{r.clearCookie('lx');r.sendStatus(204)});
app.get('/api/me',(req,res)=>{try{const t=jwt.verify(ck(req,'lx'),SECRET),u=db.users[t.email];res.json({user:u?pub(u):null})}catch{res.json({user:null})}});

app.post('/api/chat',auth,async(req,res)=>{
 const {model,mode,effort,messages}=req.body||{},M=MODELS[model],F=EFFORT[effort]||EFFORT.med;
 if(!M)return res.status(400).send('Modelo inválido.');
 if(M.paid&&!hasOpus(req.u))return res.status(402).send('Este modelo exige o plano Opus.');
 if(!hasOpus(req.u)){
  const day=new Date().toISOString().slice(0,10),U=req.u.uses||(req.u.uses={day,n:0});
  if(U.day!==day){U.day=day;U.n=0}
  if(U.n+F.cost>LIMIT)return res.status(429).send(`Você atingiu o limite grátis de hoje (${LIMIT} mensagens). Volte amanhã ou assine o Opus.`);
  U.n+=F.cost;save();
 }
 const msgs=(Array.isArray(messages)?messages:[]).slice(-30).filter(m=>['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim()).map(m=>({role:m.role,content:m.content.slice(0,12000)}));
 if(!msgs.length||msgs[0].role!=='user'||msgs.at(-1).role!=='user')return res.status(400).send('Conversa inválida.');
 res.set({'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-cache','X-Accel-Buffering':'no'});
 const system=SYS+' '+(MODES[mode]||MODES.c)+(F.x?' '+F.x:'');
 let wrote=false,stream;
 res.on('close',()=>{try{stream&&stream.abort()}catch{}});
 const run=async think=>{
  stream=ai.messages.stream({model,max_tokens:(think||0)+8000,system,messages:msgs,...(think?{thinking:{type:'enabled',budget_tokens:think}}:{})});
  stream.on('text',t=>{wrote=true;if(!res.destroyed)res.write(t)});
  await stream.finalMessage();
 };
 try{try{await run(F.think)}catch(e){if(F.think&&!wrote&&!res.destroyed)await run(0);else throw e}}
 catch(e){console.error('chat:',e.message);if(!res.destroyed)res.write('\n\n⚠️ Erro ao falar com a IA. Tente novamente.')}
 res.end();
});

app.post('/api/orders',auth,(req,res)=>{
 const P=PLANS[req.body?.plan];if(!P)return res.sendStatus(400);
 if(db.orders.filter(o=>o.email===req.u.email&&o.status==='pendente').length>=5)return res.sendStatus(429);
 db.orders.push({id:crypto.randomUUID(),email:req.u.email,name:req.u.name,plan:req.body.plan,planName:P.n,price:P.p,at:Date.now(),status:'pendente'});save();res.json({ok:1});
});
app.get('/api/admin/orders',auth,adm,(q,r)=>r.json(db.orders.slice(-100).reverse()));
app.post('/api/admin/orders/:id/:d',auth,adm,(req,res)=>{
 const o=db.orders.find(x=>x.id===req.params.id);
 if(!o||o.status!=='pendente'||!['ok','no'].includes(req.params.d))return res.sendStatus(404);
 if(req.params.d==='ok'){const u=db.users[o.email];if(u)u.planUntil=Math.max(Date.now(),u.planUntil||0)+PLANS[o.plan].d*864e5;o.status='aprovado'}else o.status='recusado';
 save();res.json({ok:1});
});

// ---- Ponte com o Roblox Studio ----
const queue=new Map(),seen=new Map(),KINDS=['Script','LocalScript','ModuleScript'];
app.post('/api/studio/code',auth,(req,res)=>{const code=crypto.randomBytes(5).toString('hex').toUpperCase();db.links[code]={email:req.u.email,at:Date.now()};save();res.json({code})});
app.get('/api/studio/status',(req,res)=>res.json({connected:Date.now()-(seen.get(String(req.query.code))||0)<8000}));
app.post('/api/studio/push',auth,(req,res)=>{
 const {code,kind,name,source}=req.body||{},L=db.links[code];
 if(!L||L.email!==req.u.email)return res.status(403).send('Código inválido. Reconecte o Studio.');
 if(typeof source!=='string'||source.length>200000)return res.status(400).send('Script grande demais.');
 const items=queue.get(code)||[];if(items.length>20)return res.status(429).send('Fila cheia.');
 items.push({kind:KINDS.includes(kind)?kind:'Script',name:String(name||'Luuynix').slice(0,60),source});queue.set(code,items);res.json({ok:1});
});
app.get('/api/studio/poll',(req,res)=>{const c=String(req.query.code||'');if(!db.links[c])return res.sendStatus(404);seen.set(c,Date.now());const items=queue.get(c)||[];queue.delete(c);res.json({items})});
const PLUGIN=`local Http=game:GetService("HttpService")
local CH=game:GetService("ChangeHistoryService")
local SERVER,CODE="__SERVER__","__CODE__"
local TARGET={
 Script=function() return game:GetService("ServerScriptService") end,
 LocalScript=function() return game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts") end,
 ModuleScript=function() return game:GetService("ReplicatedStorage") end,
}
plugin:CreateToolbar("Luuynix"):CreateButton("Luuynix","Conectado à Luuynix","")
local function place(it)
 local kind=TARGET[it.kind] and it.kind or "Script"
 local s=Instance.new(kind)
 s.Name=it.name
 s.Source=it.source
 s.Parent=TARGET[kind]()
 CH:SetWaypoint("Luuynix: "..it.name)
 print("[Luuynix] "..kind.." inserido em "..s.Parent.Name)
end
task.spawn(function()
 while true do
  local ok,res=pcall(Http.GetAsync,Http,SERVER.."/api/studio/poll?code="..CODE,true)
  if ok then
   local ok2,d=pcall(Http.JSONDecode,Http,res)
   if ok2 then
    for _,it in ipairs(d.items or {}) do
     local ok3,err=pcall(place,it)
     if not ok3 then warn("[Luuynix] "..tostring(err)) end
    end
   end
  end
  task.wait(2)
 end
end)
print("[Luuynix] Plugin ativo. Código "..CODE)
`;
app.get('/studio/plugin.lua',(req,res)=>{
 const c=String(req.query.code||'');if(!db.links[c])return res.sendStatus(404);
 const host=(E.PUBLIC_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');
 res.set({'Content-Type':'text/plain; charset=utf-8','Content-Disposition':'attachment; filename="Luuynix.lua"'});
 res.send(PLUGIN.replace('__SERVER__',host).replace('__CODE__',c));
});

app.listen(PORT,()=>console.log('Luuynix em http://localhost:'+PORT));
