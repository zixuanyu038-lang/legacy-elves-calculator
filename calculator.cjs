const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {ElvesForgeClient} = require('./forge-adapter.cjs');
const {search,fixtures,main,side} = require('./search.cjs');

const port = Number(process.env.ELVES_PORT || 8794);
const host = `127.0.0.1:${port}`;
let clients=[];
function createWorkers(){
  return Array.from({length:4},()=>new ElvesForgeClient({dataDir:path.join(__dirname,'.forge'),javaHeap:'2g',activeProcessors:3,timeoutMs:45000}));
}
const demos = Object.fromEntries(['opening-cub-hoof','ranger-zenith-20','double-untap-hoof','hoof-clean','hoof-blockers','hoof-force','hoof-swords','shepherd','zenith-top-end','marwyn-recover','vibrance-cradle','cub-sprint','progenitus-blockers']
  .map(id=>[id,fixtures.find(f=>f.id===id)]));
const names = new Map([...main,...side].map(c=>[c.name.toLowerCase(),c.name]));

function lines(value,field,{own=true,flags=false,max=40}={}) {
  if (typeof value !== 'string') throw Error(`${field}格式错误。`);
  const result=[];
  for (const raw of value.split(/\r?\n/)) {
    const line=raw.trim().replaceAll('’',"'");
    if (!line) continue;
    const [,quantity,body]=line.match(/^(?:(\d+)\s+)?(.+)$/);
    const [nameText,...tokens]=body.split('|').map(x=>x.trim());
    const name=own ? names.get(nameText.toLowerCase()) : nameText;
    const count=Number(quantity || 1);
    if (!name) throw Error(`${field}里的 ${nameText} 不在新版牌表。`);
    if (!count || count>20 || result.length+count>max) throw Error(`${field}的张数超出范围。`);
    if (/[;\x00-\x1f]/.test(name)) throw Error(`${field}的牌名格式错误。`);
    const attrs=tokens.map(token=> {
      if (!flags) throw Error(`${field}不能带状态标记。`);
      if (/^(横置|tapped)$/i.test(token)) return 'Tapped';
      if (/^(失调|summonsick)$/i.test(token)) return 'SummonSick';
      if (/^(已用|UntapUsed)$/i.test(token)&&own&&['Quirion Ranger','Wirewood Symbiote'].includes(name)) return 'UntapUsed';
      const earthbend=token.match(/^(?:地御|earthbend)[:：]([1-9]\d?)$/i);
      if (earthbend&&own) return `Earthbend:${earthbend[1]}`;
      const counter=token.match(/^\+1\/\+1[:：]([1-9]\d?)$/);
      if (counter) return `Counters:P1P1=${counter[1]}`;
      const damage=token.match(/^(?:伤害|damage)[:：]([1-9]\d?)$/i);
      if (damage) return `Damage:${damage[1]}`;
      throw Error(`无法读取 ${name} 的状态 ${token}。`);
    });
    result.push(...Array(count).fill([name,...attrs].join('|')));
  }
  return result;
}

function number(value,min,max,field) {
  if (!Number.isInteger(value) || value<min || value>max) throw Error(`${field}必须为 ${min}–${max} 的整数。`);
  return value;
}

function requestFixture(body) {
  const includeOpponent=body.includeOpponent===true;
  const input={id:'calculator',manualMana:true,ignoreOpponent:!includeOpponent,explicitOnly:true,
    board:lines(body.board,'己方战场',{flags:true}),hand:lines(body.hand,'己方手牌'),
    oppBoard:includeOpponent?lines(body.oppBoard,'对手战场',{own:false,flags:true}):[],
    oppHand:includeOpponent?lines(body.oppHand,'对手手牌',{own:false}):[],
    grave:lines(body.grave,'己方坟场'),exile:lines(body.exile,'己方放逐区'),top:lines(body.top,'己方已知库顶'),
    cuts:lines(body.cuts,'换出'),adds:lines(body.adds,'换入'),
    life:number(body.life,1,200,'对手生命'),ownLife:number(body.ownLife,1,200,'己方生命'),
    turn:number(body.turn,1,100,'回合'),lands:body.landAvailable===true?0:1,
    green:number(body.green,0,200,'浮绿'),horizon:number(body.horizon,0,8,'后续回合'),noSpells:body.noSpells===true,
    depth:number(body.depth,6,32,'搜索深度'),budget:number(body.budget,80,3600,'搜索预算')};
  if (input.cuts.length!==input.adds.length) throw Error('换入与换出须同张数。');
  const sideCounts=Object.fromEntries(side.map(c=>[c.name,c.count]));
  for (const card of new Set(input.adds)) {
    if (!sideCounts[card] || input.adds.filter(x=>x===card).length>sideCounts[card]) throw Error(`备牌里没有足够的 ${card}。`);
  }
  const deck=Object.fromEntries(main.map(c=>[c.name,c.count]));
  for (const name of input.cuts) {
    if (!deck[name]) throw Error(`无法从主牌换出 ${name}。`);
    deck[name]--;
  }
  for (const name of input.adds) deck[name]=(deck[name]||0)+1;
  for (const entry of [...input.board,...input.hand,...input.grave,...input.exile,...input.top]) {
    const name=entry.split('|')[0];
    if (!deck[name]) throw Error(`场景里的 ${name} 超过当前牌表的份数，请核对所在区域和换备。`);
    deck[name]--;
  }
  if (input.oppBoard.length+input.oppHand.length>=60) throw Error('对手手牌与战场合计需少于 60 张。');
  return input;
}

async function searchPosition(fixture,workerLimit,signal,seed){
  const count=fixture.ignoreOpponent?Math.min(workerLimit,Math.max(1,Math.floor(fixture.budget/420))):1;
  const results=await Promise.allSettled(clients.slice(0,count).map((worker,index)=>search(worker,{
    ...fixture,budget:Math.floor(fixture.budget/count)+Number(index<fixture.budget%count),
  },{signal,orderSeed:seed,policyOffset:index,policyStride:count})));
  signal.throwIfAborted();
  const complete=results.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!complete.length)throw results[0].reason;
  const byWin=(a,b)=>a.state.turn-b.state.turn||a.lateCub-b.lateCub||
    Number(b.mechanics.includes('Cub 地御 Cradle'))-Number(a.mechanics.includes('Cub 地御 Cradle'))||
    a.earlyCradleTaps-b.earlyCradleTaps||a.path.length-b.path.length;
  complete.sort((a,b)=>a.winner&&b.winner?byWin(a.winner,b.winner):a.winner?-1:b.winner?1:a.minOpponentLife-b.minOpponentLife);
  const main=complete[0];
  const alternatives=new Map();
  const key=winner=>winner.mechanics.join('|');
  for(const result of complete){
    for(const candidate of [{winner:result.winner,trace:result.trace},...result.verifiedAlternatives]){
      if(!candidate.winner||key(candidate.winner)===key(main.winner))continue;
      const name=key(candidate.winner);
      if(!alternatives.has(name)||byWin(candidate.winner,alternatives.get(name).winner)<0)alternatives.set(name,candidate);
    }
  }
  const errors={};
  for(const result of complete)for(const [name,n] of Object.entries(result.errors))errors[name]=(errors[name]||0)+n;
  for(const result of results)if(result.status==='rejected')errors[result.reason.message]=(errors[result.reason.message]||0)+1;
  return {...main,fixture,workerCount:count,expanded:complete.reduce((sum,x)=>sum+x.expanded,0),
    elapsedMs:Math.max(...complete.map(x=>x.elapsedMs)),minOpponentLife:Math.min(...complete.map(x=>x.minOpponentLife)),errors,
    verifiedAlternatives:[...alternatives.values()].sort((a,b)=>byWin(a.winner,b.winner)).slice(0,4)};
}

const mime = {'/':'text/html; charset=utf-8','/app.js':'text/javascript; charset=utf-8','/app.css':'text/css; charset=utf-8'};
const files = {'/':'index.html','/app.js':'app.js','/app.css':'app.css'};
const json = (res,status,payload) => {
  if (res.destroyed) return;
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(payload));
};
let active=false;
const server=http.createServer(async(req,res)=> {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host!==host) return json(res,403,{error:`请用 http://${host}/ 打开。`});
  if (req.method==='GET' && files[req.url]) {
    try {
      const content=await fs.readFile(path.join(__dirname,files[req.url]));
      res.writeHead(200,{'Content-Type':mime[req.url]});return res.end(content);
    } catch(e) {return json(res,500,{error:e.message});}
  }
  if (req.method==='GET' && req.url==='/examples') return json(res,200,demos);
  if (req.method!=='POST' || req.url!=='/search') return json(res,404,{error:'页面不存在。'});
  if (req.headers.origin && req.headers.origin!==`http://${host}` || req.headers['content-type']!=='application/json') {
    return json(res,403,{error:'请从计算器页面提交。'});
  }
  if (active) return json(res,429,{error:'已有计算在运行，结束或取消后再试。'});
  active=true;
  const abort=new AbortController();
  const onClose=()=>{if(!res.writableEnded)abort.abort();};
  res.once('close',onClose);
  let status=400;
  try {
    let raw='';
    req.setEncoding('utf8');
    for await (const chunk of req) {
      raw+=chunk;
      if (raw.length>25000) throw Error('输入内容过长。');
    }
    const body=JSON.parse(raw);
    const seed=number(body.seed,1,2147483647,'库序种子');
    const workers=number(body.workers??2,1,4,'并行进程');
    const fixture=requestFixture(body);
    clients=createWorkers();
    const ask=[...new Set([...fixture.oppBoard.map(s=>s.split('|')[0]),...fixture.oppHand])];
    if (ask.length) {
      const cards=await clients[0].request({command:'catalog',names:ask},{signal:abort.signal});
      const missing=cards.cards.filter(c=>!c.found).map(c=>c.name);
      if (missing.length) throw Error('Forge 找不到对手牌 '+missing.join('、')+'。请用英文牌名。');
    }
    status=500;
    const result=await searchPosition(fixture,workers,abort.signal,seed);
    return json(res,200,{...result,seed});
  } catch(e) {return json(res,status,{error:e.message});}
  finally {
    for(const worker of clients)worker.close();
    clients=[];
    active=false;
    res.removeListener('close',onClose);
  }
});
server.requestTimeout=0;
server.listen(port,'127.0.0.1',()=>console.log(`Legacy Elves calculator http://${host}/`));
function stop(){for(const worker of clients)worker.close();server.close();}
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
