const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {ForgeClient} = require('./runtime/forge-client');
const {ElvesForgeClient} = require('./forge-adapter.cjs');

const input = process.env.ELVES_DECK || process.argv[2] || path.join(__dirname,'Deck - Elves.txt');
const [main, side] = fs.readFileSync(input, 'utf8').trim().split(/\r?\n\s*\r?\n/)
  .map(section => section.split(/\r?\n/).map(line => {
    const [, count, name] = line.match(/^(\d+)\s+(.+)$/);
    return {name, count: Number(count)};
  }));
const elfDeck = main.flatMap(({name, count}) => Array(count).fill(name));
const counts = names => [...new Set(names)].map(name => ({name, count:names.filter(n => n === name).length}));
const C = 'Gaea\'s Cradle', S = 'Allosaurus Shepherd', U = 'Badgermole Cub';
const R = 'Quirion Ranger', W = 'Wirewood Symbiote', T = 'Temur Sabertooth';
const F = 'Forest', L = 'Llanowar Elves', M = 'Elvish Mystic', E = 'Fyndhorn Elves';
const N = 'Natural Order', Z = 'Green Sun\'s Zenith', H = 'Craterhoof Behemoth';
const A = 'Atraxa, Grand Unifier', K = 'Formidable Speaker', Y = 'Marwyn, the Preserver', V = 'Vibrance';
const SP = 'Swords to Plowshares', WW = 'Wasteland', FW = 'Force of Will';
const dorks = [L,M,E,'Dryad Arbor'];
const fetchlands = ['Misty Rainforest','Verdant Catacombs','Windswept Heath','Wooded Foothills'];
const fixtures = [
  {id:'hoof-clean', board:[F,F,C,L,M,E,W], hand:[N], manualMana:true, depth:10, budget:260},
  {id:'hoof-blockers', board:[F,F,C,L,M,E,W], hand:[N], manualMana:true, oppBoard:['Hill Giant','Grizzly Bears'], depth:10, budget:250},
  {id:'hoof-force', board:[F,F,C,L,M,E,W,S], hand:[N], manualMana:true, oppHand:[FW,'Brainstorm'], depth:9, budget:260},
  {id:'hoof-swords', board:[F,F,C,L,M,E,W], hand:[N], manualMana:true, oppBoard:['Plains'], oppHand:[SP], depth:10, budget:380},
  {id:'shepherd', board:[F,F,C,L,M,E,S], hand:[], depth:5, budget:90},
  {id:'t2-cub-order', turn:2, lands:0, board:[F,L], hand:[C,U,N,R,W,W], depth:8, budget:260},
  {id:'t2-on-board', turn:2, lands:1, board:[F,C,L], hand:[U,N,R,W,W], depth:7, budget:130},
  {id:'cub-engine', turn:4, board:[F,C,U,T,W,R,L], hand:[K], depth:4, budget:55},
  {id:'speaker-engine', turn:4, board:[F,C,U,K,W,R,L], hand:[N], depth:5, budget:75},
  {id:'zenith-top-end', turn:4, board:[F,F,C,L,M,E,S,W,U], hand:[Z], manualMana:true, depth:9, budget:270},
  {id:'cradle-wasteland', turn:3, lands:1, board:[F,C,L,M], hand:[U,N], oppBoard:[WW], depth:5, budget:100},
  {id:'hoof-in-hand', turn:4, board:[F,F,C,L,M,E,W], hand:[H], depth:5, budget:80},
  {id:'hoof-vs-swords', board:[F,F,C,L,M,E,W,S], hand:[N], oppBoard:['Plains'], oppHand:[SP], depth:8, budget:320},
  {id:'cub-sprint', turn:2, lands:0, board:[F,L], hand:[C,U,N,R,W,W], manualMana:true, depth:16, budget:600},
  {id:'marwyn-wasteland', board:[F,C,L,M,E,W,Y], hand:[N], oppBoard:[WW], manualMana:true, depth:9, budget:240},
  {id:'marwyn-recover', turn:4, lands:0, board:[F,F,W,W,R,Y], hand:[N], grave:[C], oppBoard:[WW], manualMana:true, depth:14, budget:450},
  {id:'vibrance-cradle', turn:4, lands:0, board:[F,F,W,W,R,S], hand:[V,N], manualMana:true, depth:14, budget:450},
  {id:'progenitus-moat', turn:4, board:[F,F,C,L,M,E,W], hand:[N], oppBoard:['Moat'], life:20, horizon:4, cuts:[A], adds:['Progenitus'], depth:12, budget:210},
  {id:'progenitus-blockers', turn:4, board:[F,F,C,L,M,E,W], hand:[N], grave:[H], oppBoard:['Hill Giant','Grizzly Bears'], life:20, horizon:4, cuts:[A], adds:['Progenitus'], depth:12, budget:250},
  {id:'atruxa-moat', turn:4, board:[F,F,C,L,M,E,W], hand:[N], oppBoard:['Moat'], life:7, horizon:2, depth:12, budget:250},
  {id:'terastodon-moat', turn:4, board:[F,F,C,L,M,E,W], hand:[N,N], oppBoard:['Moat'], cuts:[A], adds:['Terastodon'], depth:12, budget:240},
  {id:'cage-deathclaw', turn:4, board:['Bayou',F,C,L,M,E,W], hand:['Alpha Deathclaw',N], oppBoard:["Grafdigger's Cage"], manualMana:true, depth:12, budget:280},
  {id:'earthbend-cradle', turn:4, board:[F,`${C}|Earthbend:1`,L,M,E,W,U], hand:[N], manualMana:true, depth:12, budget:230},
  {id:'opening-cub-hoof', turn:1, lands:0, board:[], hand:[U,S,L,'Bayou','Once Upon a Time',H,'Misty Rainforest'],
    top:['Boseiju, Who Endures','Bayou',K,'Dryad Arbor',C], horizon:6, ignoreOpponent:true, manualMana:true, depth:26, budget:420},
  {id:'ranger-zenith-20', turn:4, board:[F,`${C}|Earthbend:1`,U,R], hand:[Z], ignoreOpponent:true, manualMana:true, depth:20, budget:580},
  {id:'double-untap-hoof', turn:4, board:[F,F,L,U,R,W], hand:[H], ignoreOpponent:true, manualMana:true, depth:24, budget:780},
];

function openingFixtures(horizon=4,budget=260) {
  return Array.from({length:16},(_,i)=> {
    const deck=elfDeck.slice();
    let seed=9173+i*3929;
    for (let j=deck.length-1;j>0;j--) {
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const k=seed%(j+1);
      [deck[j],deck[k]]=[deck[k],deck[j]];
    }
    return {id:`opening-${String(i+1).padStart(2,'0')}`,turn:1,lands:0,board:[],hand:deck.slice(0,7),
      top:deck.slice(7),oppBoard:[],oppHand:[],horizon,manualMana:true,depth:18,budget,seed:13201+i};
  });
}

function makeRoot(f, orderSeed=2488) {
  const serialize = (cards, base) => cards.map((card, i) => {
    const [name, ...flags] = card.split('|');
    return [name, `Id:${base+i}`, ...flags].join('|');
  }).join(';');
  const deck = f.deck ? f.deck.main.flatMap(({name,count})=>Array(count).fill(name)) : elfDeck.slice();
  const sideboard=f.deck?.side??side;
  for (const card of f.cuts || []) {
    const i=deck.indexOf(card);
    if (i < 0) throw Error(`Cannot side out ${card}`);
    deck.splice(i,1);
  }
  for (const name of new Set(f.adds||[])) {
    const available=sideboard.find(card=>card.name===name)?.count||0;
    if (f.adds.filter(card=>card===name).length>available) throw Error(`Too many sideboard copies of ${name}`);
  }
  deck.push(...(f.adds || []));
  const remaining = deck.slice();
  for (const card of [...f.board, ...f.hand, ...(f.grave || []), ...(f.exile || []), ...(f.top || [])]) {
    const i = remaining.indexOf(card.split('|')[0]);
    if (i < 0) throw Error(`Unavailable card in ${f.id}: ${card}`);
    remaining.splice(i, 1);
  }
  let state = orderSeed;
  for (let i=remaining.length-1; i>0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i+1);
    [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
  }
  const oppBoard = f.ignoreOpponent ? [] : f.oppBoard || [];
  const oppHand = f.ignoreOpponent ? [] : f.oppHand || [];
  const oppLibrary = Array(60-oppBoard.length-oppHand.length).fill('Island');
  let nextId=100;
  function zoneBase(preferred,size) {
    const base=Math.max(preferred,nextId);
    nextId=base+size;
    return base;
  }
  const library=[...(f.top||[]),...remaining];
  const handBase=zoneBase(100,f.hand.length), boardBase=zoneBase(120,f.board.length);
  const graveBase=zoneBase(150,f.grave?.length||0), libraryBase=zoneBase(180,library.length);
  const oppHandBase=zoneBase(300,oppHand.length), oppBoardBase=zoneBase(320,oppBoard.length);
  const oppLibraryBase=zoneBase(350,oppLibrary.length), exileBase=zoneBase(410,f.exile?.length||0);
  const earthbend = f.board.flatMap((card,i)=> {
    const match=card.match(/\|Earthbend:(\d+)(?=\||$)/);
    return match ? [{id:boardBase+i,counters:Number(match[1])}] : [];
  });
  const usedUntaps=f.board.flatMap((card,i)=>card.split('|').includes('UntapUsed')?[boardBase+i]:[]);
  return {seed:orderSeed, manualMana:!!f.manualMana, ignoreOpponent:!!f.ignoreOpponent, earthbend, usedUntaps, viewerId:1, names:['Opponent','Elves'],gameId:f.id,
    activePlayerId:1, priorityPlayerId:1, firstPriorityId:1, history:[{}, {spellsCastThisGame:(f.noSpells ?? ((f.turn || 3)===1)) ? 0 : 1}],
    decks:[{main:counts([...oppBoard.map(c=>c.split('|')[0]),...oppHand,...oppLibrary])},{main:counts(deck),sideboard}],
    stateText:[`turn=${f.turn || 3}`,'activeplayer=p1','activephase=MAIN1',
      `p0life=${f.life || 20}`,`p1life=${f.ownLife || 20}`,`p1landsplayed=${f.lands ?? 1}`,
      `p1manapool=${Array(f.green || 0).fill('G').join(' ')}`,
      `p1hand=${serialize(f.hand,handBase)}`,`p1battlefield=${serialize(f.board.map(c=>c.replace(/\|(?:Earthbend:\d+|UntapUsed)(?=\||$)/g,'')),boardBase)}`,
      `p1graveyard=${serialize(f.grave||[],graveBase)}`,`p1exile=${serialize(f.exile||[],exileBase)}`,`p1library=${serialize(library,libraryBase)}`,
      `p0hand=${serialize(oppHand,oppHandBase)}`,`p0battlefield=${serialize(oppBoard,oppBoardBase)}`,
      `p0library=${serialize(oppLibrary,oppLibraryBase)}`].join('\n')+'\n'};
}

function summary(node) {
  const s = node.state;
  return {turn:s.turnNumber, phase:s.phase, active:s.activePlayerId, status:s.status, winner:s.winnerId ?? null,
    opponent:s.players[0].life, hand:s.players[1].hand.map(c => c.name),
    board:s.players[1].battlefield.map(c => [c.name,c.power,c.tapped,c.hasSummoningSickness,c.types,c.id]),
    grave:s.players[1].graveyard.map(c => c.name), mana:s.players[1].manaPool};
}

function canHoldCradle(node, cardId) {
  const own=node.state.players[1];
  const cradle=own.battlefield.find(card=>card.id===cardId);
  return cradle&&!cradle.types.includes('Creature')&&
    node.actions.some(a=>a.kind==='cast'&&a.cardName===U)&&
    ((own.manaPool.G||0)>=2||node.actions.some(a=>a.kind==='mana'&&a.cardId!==cardId));
}

function moveValue(a, node) {
  if (a.kind === 'pass') return node.state.stack.length ? 37 : 14;
  if (a.actorId === 0) return 28;
  if (a.kind === 'choice') {
    if (a.label.includes(H)) return 46;
    if (a.label.includes('Progenitus')) return 42;
    if (a.label.includes(C)) return 37;
    if (a.label.includes(A)) return 25;
    return a.label.endsWith('[]') ? 0 : 20;
  }
  if (a.kind === 'mana') return a.cardName === C ? (canHoldCradle(node,a.cardId)?7:32) : 11;
  if (a.kind === 'play_land') return a.cardName===C?40:25;
  const paid=node.state.players[1].battlefield.find(c=>c.id===a.costCard);
  const costPenalty=paid&&!paid.tapped&&!paid.hasSummoningSickness?Math.max(1,paid.power):0;
  if (a.cardName===Y&&a.kind==='activate'&&node.state.players[1].graveyard.some(c=>c.name===C&&(a.targets||[]).flat().includes(`c:${c.id}`))) return 52;
  if ([H,N,S,U,V,Y].includes(a.cardName)) return 32-costPenalty;
  if (a.cardName === Z) return a.x===8?46:25+a.x*2;
  if (a.kind === 'activate') {
    const targets = (a.targets || []).flat();
    const target = node.state.players[1].battlefield.find(c => targets.includes(`c:${c.id}`));
    if (target?.tapped) return 23-costPenalty;
    if ([S,Y,K].includes(a.cardName)) return 24;
    return 2;
  }
  return 16;
}

function goldfishPriority(action,node,style) {
  const {kind,cardName}=action;
  const state=node.state;
  const own=state.players[1];
  const hand=own.hand.map(card=>card.name);
  const board=own.battlefield;
  const creatures=board.filter(card=>card.types.includes('Creature'));
  const hasCradle=board.some(card=>card.name===C);
  const isMain=['MAIN1','MAIN2'].includes(state.phase);
  const cubs=board.filter(card=>card.name===U).length;
  const floating=own.manaPool.G || 0;
  const threshold=hand.includes(H)?8:hand.includes(N)?4:hand.includes(Z)?9:hand.includes(U)?2:hand.length?4:0;
  const searchingResets=style==='untap'||style==='recycle';
  const canCastFinisher=node.actions.some(a=>a.kind==='cast'&&(a.cardName===H||a.cardName===N&& !hand.includes(H)||a.cardName===Z&&a.x===8));
  if(kind==='choice'){
    if(cardName===U){
      const land=board.find(card=>action.label.endsWith(`[${card.name}]`));
      if(!land)return 0;
      const canUntap=board.some(c=>[R,W,K].includes(c.name));
      return (land.name===C&&(!land.tapped||canUntap||searchingResets)?125:85)+(land.tapped?0:15);
    }
    if(fetchlands.includes(cardName))return action.label.includes('[Forest]')?110:action.label.includes('[Bayou]')?103:action.label.includes('[Dryad Arbor]')?75:0;
    if(cardName==='Once Upon a Time'){
      const landCount=board.filter(card=>card.types.includes('Land')).length+hand.filter(name=>[F,'Bayou','Boseiju, Who Endures',C,...fetchlands].includes(name)).length;
      if(action.label.includes(`[${C}]`))return landCount>=2?126:105;
      if([F,'Bayou','Boseiju, Who Endures',...fetchlands].some(name=>action.label.includes(`[${name}]`)))return landCount<3?115:85;
      if(action.label.includes(`[${U}]`))return hand.includes(U)?95:112;
      if(dorks.some(name=>action.label.includes(`[${name}]`)))return 90;
    }
    if(cardName===T&&style==='recycle'&&action.label.includes(`[${W}]`))return 135;
    return 70+moveValue(action,node);
  }
  if(kind==='pass'){
    if(state.stack.length)return 200;
    return isMain?25:100;
  }
  if(kind==='play_land'){
    if(cardName===C)return creatures.length?(hand.includes(U)?114:83):15;
    if(cardName==='Dryad Arbor')return 39;
    return 79;
  }
  if(kind==='activate'&&fetchlands.includes(cardName))return 84;
  if(kind==='cast'){
    if(cardName==='Once Upon a Time')return 100;
    if(cardName===H)return 105;
    if(cardName===N)return hand.includes(H)?50:101;
    if(cardName===Z&&action.x===8)return 101;
    if(cardName===U)return style==='develop'?103:94;
    if(dorks.includes(cardName))return 75;
    if(cardName===Z&&action.x===0)return creatures.length?34:73;
    if(cardName===Z&&action.x===2&& !board.some(c=>c.name===U))return 67;
    if(cardName===V&& !hasCradle&&!hand.includes(C))return action.label.includes('Evoke')?73:64;
    if(style==='recycle'&&cardName===R&&floating>=1&&floating<=threshold&&board.some(c=>c.name===W)&&
      board.some(c=>c.types.includes('Land')&&[F,'Bayou','Dryad Arbor'].includes(c.name))&&board.some(c=>dorks.includes(c.name)&&!c.hasSummoningSickness))return 114;
    if(searchingResets&&[R,W].includes(cardName)&&floating<threshold&&creatures.some(c=>dorks.includes(c.name)||c.name===C))return 92;
    return 46;
  }
  if(kind==='mana'){
    const source=board.find(c=>c.id===action.cardId);
    if(!source)return 4;
    if(cardName===C&&canHoldCradle(node,action.cardId))return 2;
    if(searchingResets&&floating<threshold){
      const isCreature=source.types.includes('Creature');
      const resettable=node.actions.some(a=>[R,W,K].includes(a.cardName)&&a.kind==='activate'&&a.costCard!==source.id&&(a.targets||[]).flat().includes(`c:${source.id}`));
      if(!isCreature&&node.actions.some(a=>a.kind==='activate'&&a.cardName===R&&a.costCard===source.id))return 125;
      if(resettable&&(cardName===C||dorks.includes(cardName)))return 111+(cardName===C?creatures.length:1)+(isCreature?cubs:0);
      if(source.types.includes('Land')&&source.name!==C&&!isCreature&&canCastFinisher===false&&node.actions.some(a=>[R,W,K].includes(a.cardName)&&a.kind==='activate'))return 76;
    }
    if(cardName===C&&canCastFinisher&&floating<Math.min(threshold,4))return style==='preserve'?113:94;
    return 4;
  }
  if(kind==='activate'){
    const refs=(action.targets||[]).flat();
    const tapped=board.find(c=>c.tapped&&refs.includes(`c:${c.id}`));
    if(searchingResets&&tapped&&floating<threshold&&[R,W,K].includes(cardName)&&action.costCard!==tapped.id){
      const cost=board.find(c=>c.id===action.costCard);
      const returnRanger=cardName===W&&cost?.name===R&&!node.actions.some(a=>a.kind==='activate'&&a.cardId===cost.id);
      return (tapped.name===C?119:dorks.includes(tapped.name)?111:58)+(cardName===R?7:0)+(returnRanger?6:0)+(cost?.tapped||cost?.hasSummoningSickness?3:0);
    }
    if(tapped?.name===C&&!canCastFinisher)return 83;
    if(tapped&&dorks.includes(tapped.name)&&hand.some(name=>[H,N,Z,U].includes(name)))return 71;
    if(cardName===S&&state.phase==='COMBAT_DECLARE_BLOCKERS')return own.battlefield.filter(c=>c.isAttacking&&c.power<5).length>=2?110:13;
    if(cardName===T&&style==='recycle'&&floating>=2&&floating<threshold&&board.some(c=>c.name===W)&&!node.actions.some(a=>a.kind==='activate'&&a.cardName===W))return 98;
    if(cardName===Y&&own.graveyard.some(c=>c.name===C&&refs.includes(`c:${c.id}`)))return 82;
  }
  return 12;
}

function scenarioGuide(f) {
  const move=(kind,name,cost)=>(a)=>a.kind===kind&&a.cardName===name&&(!cost||a.costName===cost);
  const pick=(source,name)=>a=>a.kind==='choice'&&a.cardName===source&&a.label.includes(`[${name}]`);
  const untap=(source,name,cost)=>(a,node)=>move('activate',source,cost)(a)&&
    (a.targets||[]).flat().some(id=>node.state.players[1].battlefield.some(c=>c.name===name&&id===`c:${c.id}`));
  if(f.lands===0 && f.grave?.includes(C) && f.hand.includes(N) && f.board.some(card=>card.split('|')[0]===Y)){
    const recover=(a,node)=>move('activate',Y)(a)&&
      (a.targets||[]).flat().some(id=>node.state.players[1].graveyard.some(c=>c.name===C&&id===`c:${c.id}`));
    return {name:'Marwyn 回收 Cradle',steps:[recover,move('play_land',C),move('mana',C),move('cast',N,W),pick(N,H)]};
  }
  const dork=f.board.find(name=>dorks.includes(name));
  if (f.turn!==2 || f.lands!==0 || !dork || !f.board.includes(F) || f.board.length!==2 ||
      f.oppHand?.length || f.oppBoard?.length || ![C,U,N,R,W].every(name=>f.hand.includes(name)) || f.hand.filter(name=>name===W).length<2) return null;
  return {name:'T2-Cub–Cradle',steps:[move('play_land',C),move('mana',F),move('mana',dork),move('cast',U),pick(U,C),move('mana',C),
    move('cast',R),move('cast',W),move('cast',W),untap(R,C,F),move('mana',C),untap(W,C,R),move('cast',R),
    untap(W,dork,R),move('cast',N,W),pick(N,H)]};
}

function mechanics(path) {
  const labels=new Set();
  for(const a of path){
    if(a.actorId!==1)continue;
    if(a.kind==='choice'&&a.cardName===U&&a.label.includes(`[${C}]`))labels.add('Cub 地御 Cradle');
    if(a.kind==='activate'&&[R,W,K].includes(a.cardName))labels.add(a.cardName===W&&a.costName===R?'Symbiote 回收 Ranger':a.cardName+' 重置');
    if(a.kind==='cast'&&a.cardName===R&&labels.has('Symbiote 回收 Ranger'))labels.add('重下 Ranger');
    if(a.kind==='choice'&&a.cardName===T&&a.label.includes(`[${W}]`))labels.add('Sabertooth 重下 Symbiote');
    if(a.kind==='cast'&&a.cardName===H)labels.add('硬拍 Hoof');
    if(a.kind==='cast'&&a.cardName===N)labels.add('Natural Order');
    if(a.kind==='cast'&&a.cardName===Z&&a.x===8)labels.add('Zenith X=8');
    if(a.kind==='activate'&&a.cardName===S)labels.add('Shepherd 变身');
  }
  return [...labels].sort();
}

async function search(client, f, {signal,orderSeed,policyOffset=0,policyStride=1}={}) {
  const root = makeRoot(f,orderSeed);
  const started = performance.now();
  const options = {root,exhaustive:true,skipForcedPasses:true,enumerateChoices:true};
  const stats = {expanded:0, leaves:0, errors:{}, gaps:new Set()};
  const nodes = new Map();
  const key = p => p.map(a => a.key).join('\n');
  const error = e => {stats.errors[e.message] = (stats.errors[e.message] || 0)+1;};
  async function expand(p) {
    const id = key(p);
    if (!nodes.has(id)) {
      stats.expanded++;
      nodes.set(id, await client.request({...options,command:'expand',path:p,searchProbe:true},{signal}));
    }
    const node = nodes.get(id);
    for (const g of node.enumerationGaps || []) stats.gaps.add(g);
    return node;
  }
  const initial = await expand([]);
  let winner = null;
  let explicitWinner = null;
  let bestDamage = null;
  let guidedPath = null;
  const samples = [];
  const baseTurn = f.turn || 3;
  const horizon = f.horizon || 0;
  const lastTurn = baseTurn+horizon;
  let minOpponentLife = f.life || 20;
  const queue = [{node:initial,p:[],value:0}];
  const processed=new Set();
  const childrenByAction = new Map();
  const winsByMechanics = new Map();
  const investment = x => x.path.reduce((mana,a)=>mana+Math.max(0,a.x||0),0);
  const lateCub = x => x.path.reduce((late,a,i)=>late+Number(a.kind==='cast'&&a.cardName===U&&nodes.get(key(x.path.slice(0,i)))?.state.phase==='MAIN2'),0);
  const bentCradle = x=>x.path.some(a=>a.kind==='choice'&&a.cardName===U&&a.label.includes(`[${C}]`));
  function cradleTapsBeforeEarthbend(path) {
    const taps=new Map();
    let count=0;
    for (const [index,action] of path.entries()) {
      if(action.kind==='mana'&&action.cardName===C){
        const before=nodes.get(key(path.slice(0,index)))?.state;
        const card=before?.players[1].battlefield.find(c=>c.id===action.cardId);
        if(card&&!card.types.includes('Creature')){
          const id=`${before.turnNumber}/${card.id}`;
          taps.set(id,(taps.get(id)||0)+1);
        }
      }else if(action.kind==='choice'&&action.cardName===U&&action.label.includes(`[${C}]`)){
        const target=action.key.match(/:\[(\d+)\]$/)?.[1];
        const turn=nodes.get(key(path.slice(0,index)))?.state.turnNumber;
        const id=`${turn}/${target}`;
        count+=taps.get(id)||0;
        taps.delete(id);
      }
    }
    return count;
  }
  const compareWins = (a,b) => a.state.turn-b.state.turn || lateCub(a)-lateCub(b) ||
    Number(bentCradle(b))-Number(bentCradle(a)) || a.earlyCradleTaps-b.earlyCradleTaps ||
    a.path.length-b.path.length || investment(a)-investment(b);
  function record(node,p,settled=false) {
    const state = summary(node);
    const result = {path:p,state,settled};
    if (state.turn <= lastTurn || (state.turn === lastTurn+1 && state.phase === 'UNTAP')) {
      minOpponentLife = Math.min(minOpponentLife,state.opponent);
      if (p.length && state.opponent < (f.life || 20) && (!bestDamage || state.opponent < bestDamage.state.opponent)) bestDamage=result;
    }
    if (state.winner === '1' && state.turn <= lastTurn) {
      result.earlyCradleTaps=cradleTapsBeforeEarthbend(p);
      if (!settled && (!explicitWinner || compareWins(result,explicitWinner)<0)) explicitWinner=result;
      if (!winner || compareWins(result,winner)<0) winner=result;
      if(!settled){
        result.mechanics=mechanics(p);
        const family=result.mechanics.join('|');
        const previous=winsByMechanics.get(family);
        if(!previous||compareWins(result,previous)<0)winsByMechanics.set(family,result);
      }
    }
    if (p.length && (state.status === 'COMPLETE' || state.turn > lastTurn || settled)) {
      const k=p[0].key;
      const first = childrenByAction.get(k);
      if (!first || state.opponent < first.state.opponent || (state.winner === '1' && first.state.winner !== '1')) childrenByAction.set(k,result);
    }
    if (samples.length < 14 && p.length && (settled || state.winner || state.opponent < (f.life || 20))) samples.push(result);
  }
  const guide=scenarioGuide(f);
  if (guide) {
    let node=initial;
    const p=[];
    const advance=async action=>{p.push(action);node=await expand(p.slice());record(node,p.slice());};
    try {
      for (const pick of guide.steps) {
        for (let i=0;i<7&&!node.actions.some(a=>pick(a,node))&&node.state.turnNumber===baseTurn;i++) {
          const pass=node.actions.find(a=>a.kind==='pass');
          if(!pass)break;
          await advance(pass);
        }
        if (node.state.turnNumber!==baseTurn) break;
        const action=node.actions.find(a=>pick(a,node));
        if(!action)break;
        await advance(action);
      }
      for (let i=0;i<16&&node.state.turnNumber===baseTurn&&node.state.status!=='COMPLETE';i++) {
        const pass=node.actions.find(a=>a.kind==='pass');
        if(!pass)break;
        await advance(pass);
      }
      if (node.state.winnerId==='1') guidedPath=key(p);
    } catch(e) {error(e);}
  }
  if(f.ignoreOpponent){
    const probeLimit=Math.min(f.budget,stats.expanded+Math.floor(f.budget/2));
    const probes=[['untap',-1],['recycle',-1],['develop',-1],['preserve',-1],['untap',0],['preserve',1]]
      .filter((_,index)=>index%policyStride===policyOffset);
    for(const [style,alternateAt] of probes){
      let node=initial;
      const p=[];
      while(stats.expanded<probeLimit&&p.length<f.depth&&node.state.turnNumber<=lastTurn&&node.state.status!=='COMPLETE'){
        signal?.throwIfAborted();
        const moves=node.actions.map(action=>({action,rank:goldfishPriority(action,node,style)})).sort((a,b)=>b.rank-a.rank);
        if(p.length===alternateAt&&moves.length>1)[moves[0],moves[1]]=[moves[1],moves[0]];
        let advanced=false;
        for(const {action,rank} of moves){
          if(stats.expanded>=probeLimit)break;
          const next=[...p,action];
          try{
            const child=await expand(next);
            record(child,next);
            queue.push({node:child,p:next,value:rank*0.55+Math.min(15,next.length)});
            node=child;p.push(action);advanced=true;break;
          }catch(e){error(e);}
        }
        if(!advanced)break;
      }
    }
  }
  while (queue.length && stats.expanded + stats.leaves < f.budget) {
    signal?.throwIfAborted();
    queue.sort((a,b) => b.value-a.value || a.p.length-b.p.length);
    const {node,p} = queue.shift();
    const pathKey=key(p);
    if(processed.has(pathKey))continue;
    processed.add(pathKey);
    record(node,p);
    if (node.state.status === 'COMPLETE' || node.state.turnNumber > lastTurn || p.length >= f.depth) continue;
    if (!f.ignoreOpponent && !horizon && explicitWinner && !f.oppHand?.length && !f.oppBoard?.length && p.length >= explicitWinner.path.length) continue;
    if (!f.ignoreOpponent && !f.explicitOnly && p.length && !['pass','mana'].includes(p.at(-1).kind) && p.every(a => a.actorId === 1) && stats.leaves < Math.ceil(f.budget/6)) {
      try {
        stats.leaves++;
        const leaf = await client.request({...options,command:'simulate',path:p,horizonTurns:horizon+1},{signal});
        record(leaf,p,true);
      } catch(e) {error(e);}
    }
    const style=['untap','recycle','develop','preserve'][policyOffset];
    const actions = node.actions.map(action => ({action,priority:moveValue(action,node)+
      (f.ignoreOpponent&&policyStride>1?goldfishPriority(action,node,style)*0.12:0)})).sort((a,b) => b.priority-a.priority);
    for (const {action,priority} of actions) {
      if (stats.expanded+stats.leaves >= f.budget) break;
      try {
        const next = [...p,action];
        const child = await expand(next);
        record(child,next);
        const own = child.state.players[1];
        const hoof = own.battlefield.some(c => c.name === H) ? 38 : 0;
        const impendingChoice = child.actions.some(a=>a.kind==='choice'&&a.label.includes(H)) ? 36 : 0;
        const mana = Math.min(10,own.manaPool.G || 0);
        const boardPower = own.battlefield.filter(c => !c.tapped && !c.hasSummoningSickness).reduce((n,c) => n+c.power,0);
        const lostLife = (f.life || 20)-child.state.players[0].life;
        queue.push({node:child,p:next,value:priority+hoof+impendingChoice+Math.min(boardPower,35)*1.4+lostLife*2+mana*1.2-next.length*2});
      } catch(e) {error(e);}
    }
  }
  const proofCache=new Map();
  function backedWin(p) {
    const id=key(p);
    if(proofCache.has(id))return proofCache.get(id);
    const node=nodes.get(id);
    if(!node || node.state.turnNumber>lastTurn)return null;
    let result=null;
    if(node.state.winnerId==='1')result={path:p,state:summary(node),settled:false,earlyCradleTaps:cradleTapsBeforeEarthbend(p)};
    else if(node.actions.length){
      const children=node.actions.map(a=>backedWin([...p,a]));
      const opponent=node.actions[0].actorId===0;
      if(!opponent||children.every(Boolean))result=children.filter(Boolean).sort(compareWins)[0]||null;
    }
    proofCache.set(id,result);
    return result;
  }
  const backed=backedWin([]);
  winner = backed || explicitWinner || winner;
  if(winner){
    winner.guide=key(winner.path)===guidedPath?guide.name:null;
    winner.mechanics=mechanics(winner.path);
    winner.lateCub=lateCub(winner);
  }
  async function replay(line,winning) {
    const proof = await client.request({...options,command:line.settled?'simulate':'expand',path:line.path,horizonTurns:horizon+1,includeTrace:true},{signal});
    if (winning && (proof.state.winnerId !== '1' || proof.state.turnNumber > lastTurn)) throw Error('Winning branch did not replay to the same result');
    if (!winning && proof.state.players[0].life!==line.state.opponent) throw Error('Damage branch did not replay to the same life total');
    let life=f.life || 20;
    let previousPools=[{},{}];
    return proof.trace.flatMap(x => {
      const current=x.state.players[0].life;
      const lifeChanged=current!==life;
      life=current;
      const pools=x.state.players.map(p=>p.manaPool||{});
      let generated;
      if(x.action?.kind==='mana'){
        const actor=x.action.actorId;
        generated=Object.fromEntries(Object.entries(pools[actor]).map(([color,n])=>[color,n-(previousPools[actor][color]||0)]).filter(([,n])=>n>0));
      }
      previousPools=pools;
      if (f.ignoreOpponent && x.action?.actorId===0) return [];
      if (!(x.action || x.kind === 'choice' || x.kind === 'end' || lifeChanged)) return [];
      return [{kind:x.kind, action:x.action, generated, label:x.label, state:summary(x),
        attackers:x.state.players[1].battlefield.filter(c=>c.isAttacking).map(c=>[c.name,c.power])}];
    });
  }
  const line=winner || bestDamage;
  const trace=line?await replay(line,!!winner):null;
  const verifiedAlternatives=[];
  if(winner&&f.ignoreOpponent){
    const others=[...winsByMechanics.values()].filter(x=>x.mechanics.join('|')!==winner.mechanics.join('|')).sort(compareWins);
    for(const other of others.slice(0,4)){
      try{verifiedAlternatives.push({winner:{...other,lateCub:lateCub(other)},trace:await replay(other,true)});}
      catch(e){error(e);}
    }
  }
  const responses = [];
  if (winner) {
    for (let i=0;i<=winner.path.length;i++) {
      const parent=nodes.get(key(winner.path.slice(0,i)));
      if (parent?.actions[0]?.actorId !== 0) continue;
      const chosen=winner.path[i]?.key;
      for (const action of parent.actions.filter(a => a.key !== chosen && a.kind !== 'pass')) {
        const branch=[...winner.path.slice(0,i),action];
        const node=nodes.get(key(branch));
        responses.push({step:i+1,action:action.label,targets:action.targets,checked:!!node,ownWinVerified:!!backedWin(branch)});
      }
    }
  }
  const winningStarts=[...childrenByAction.values()].filter(x=>x.state.winner==='1'&&x.state.turn<=lastTurn);
  return {id:f.id,fixture:f,elapsedMs:Math.round(performance.now()-started),root:summary(initial),
    expanded:stats.expanded,leaves:stats.leaves,errors:stats.errors,gaps:[...stats.gaps],
    initial:initial.actions,minOpponentLife,winner,bestDamage,trace,verifiedAlternatives,responses,winAgainstEnumeratedReplies:!!backed,winningStarts,firstActionOutcomes:[...childrenByAction.values()],samples};
}

async function run() {
  const mode = process.argv[3];
  const selected = mode==='openings' ? openingFixtures() : mode==='openings-t4' ? openingFixtures(6,420)
    : mode && mode !== 'all' ? fixtures.filter(f => mode.split(',').includes(f.id)) : fixtures;
  const workerCount = Math.min(selected.length, Number(process.env.ELVES_WORKERS || 3));
  const baseline=process.env.ELVES_BASELINE==='1';
  const dataDir = path.join(__dirname,baseline?'.forge-baseline':'.forge');
  const started = performance.now();
  const Client=baseline?ForgeClient:ElvesForgeClient;
  const clients = Array.from({length:workerCount}, () => new Client({dataDir,javaHeap:'2g',activeProcessors:3,timeoutMs:30000}));
  const results = [];
  let next = 0;
  try {
    const catalog = await clients[0].request({command:'catalog',names:[...main,...side].map(c => c.name)});
    fs.writeFileSync(path.join(__dirname,'Forge-card-catalog.json'),JSON.stringify(catalog,null,2));
    console.log('catalog missing:',catalog.cards.filter(c => !c.found).map(c => c.name));
    await Promise.all(clients.map(async client => {
      while (next < selected.length) {
        const f=selected[next++];
        try {
          const result=await search(client,f,{orderSeed:f.seed});
          results.push(result);
          console.log(f.id,result.elapsedMs+'ms',result.expanded+' nodes',result.leaves+' rollouts',result.winner?.state.winner || '-',result.minOpponentLife,JSON.stringify(result.errors).slice(0,450));
        } catch(e) {results.push({id:f.id,error:e.stack}); console.error(f.id,e.message);}
      }
    }));
    const elapsedMs=Math.round(performance.now()-started);
    fs.writeFileSync(path.join(__dirname,`Forge-search-${mode && mode !== 'all'?mode:'all'}.json`),JSON.stringify({engine:clients[0].engine,baseline,workerCount,elapsedMs,results},null,2));
    console.log('elapsedMs:',elapsedMs);
  } finally {for (const client of clients) client.close();}
}

if(require.main===module) run().catch(e => {console.error(e);process.exitCode=1;});
module.exports={search,makeRoot,fixtures,main,side};
