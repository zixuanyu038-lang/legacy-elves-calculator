const byId=id=>document.getElementById(id);
const fields=['hand','board','oppHand','oppBoard','grave','exile','top','cuts','adds'];
const numeric=['life','ownLife','turn','green','horizon','budget','depth','seed','workers'];
const labels={
  'opening-cub-hoof':'七张起手 · Cub 与 Hoof',
  'ranger-zenith-20':'地御 Cradle ＋ Ranger ＋ Zenith',
  'double-untap-hoof':'两种重置接起来拍 Hoof',
  'hoof-clean':'Natural Order 斩杀','hoof-blockers':'同一手牌，两个阻挡者','hoof-force':'顶着 Force of Will','hoof-swords':'对手有 Swords to Plowshares',
  shepherd:'Allosaurus Shepherd 进战斗后变身','zenith-top-end':'Zenith 找 Craterhoof','marwyn-recover':'Marwyn 捡回 Cradle',
  'vibrance-cradle':'Vibrance 呼魂找 Cradle','cub-sprint':'T2 地御 Cradle 斩杀','progenitus-blockers':'换备后用 Progenitus 穿过阻挡'
};
let demos={},request,lastResult;
let importingDeck=false;
const deckStorageKey='legacy-elves-decks';
const savedDecks=new Map();
const deckSelect=byId('deck-select');

function addDeckOption(deck) {
  savedDecks.set(deck.id,deck);
  deckSelect.add(new Option(`${deck.name} · ${deck.mainCount} 张`,deck.id));
}

function restoreDecks() {
  try {
    const stored=JSON.parse(localStorage.getItem(deckStorageKey)||'{}');
    for (const deck of stored.decks||[]) {
      if (typeof deck?.id==='string'&&deck.id&&typeof deck.name==='string'&&typeof deck.text==='string') addDeckOption(deck);
    }
    if (savedDecks.has(stored.selected)) deckSelect.value=stored.selected;
  } catch {}
}

function saveDecks() {
  try {
    localStorage.setItem(deckStorageKey,JSON.stringify({decks:[...savedDecks.values()],selected:deckSelect.value}));
    return true;
  } catch { return false; }
}

function clearResult(message) {
  byId('result').hidden=true;
  byId('status').hidden=false;
  byId('status').textContent=message;
}

function changeDeck() {
  if (deckSelect.value&&byId('examples').value) {
    byId('examples').value='';
    load({});
  }
  const deck=savedDecks.get(deckSelect.value);
  clearResult(deck?`当前使用 ${deck.name}。请填写局面后搜索。`:'当前使用内置薪传妖精套牌。');
  return saveDecks();
}

function deckStatus(message,error=false) {
  const status=byId('deck-status');
  status.hidden=false;
  status.textContent=message;
  status.dataset.error=String(error);
}

function updateBusyControls() {
  const busy=!!request||importingDeck;
  for (const id of ['run','deck-save','deck-select','examples']) byId(id).disabled=busy;
}

function updateOpponentMode() {
  const enabled=byId('includeOpponent').checked;
  byId('opponent-fields').hidden=!enabled;
  byId('life-label').textContent=enabled?'对手生命':'目标血量';
}

function load(f) {
  for(const key of fields) byId(key).value=(f[key]||[]).join('\n');
  const settings={life:20,ownLife:20,turn:3,green:0,horizon:0,...f,depth:Math.max(16,f.depth||0)};
  for(const key of numeric) if (!['seed','budget','workers'].includes(key)) byId(key).value=settings[key];
  byId('landAvailable').checked=f.lands===0;
  byId('noSpells').checked=!!f.noSpells||f.turn===1;
  byId('includeOpponent').checked=!!(f.oppHand?.length||f.oppBoard?.length);
  updateOpponentMode();
}

function details(list, text, small) {
  const li=document.createElement('li');
  li.textContent=text;
  if (small) {
    const meta=document.createElement('small');
    meta.textContent=small;
    li.append(meta);
  }
  list.append(li);
}

function show(result) {
  lastResult=result;
  const {winner,trace,fixture,responses}=result;
  byId('status').hidden=true;
  byId('result').hidden=false;
  const testedReply=responses?.filter(item=>!item.ownWinVerified&&item.outcome?.life>0).sort((a,b)=>b.outcome.life-a.outcome.life)[0];
  const openReply=responses?.find(item=>!item.ownWinVerified&&item.kind!=='play_land'&&item.outcome?.winner!=='1');
  const unproven=winner&&!fixture.ignoreOpponent&&!result.winAgainstEnumeratedReplies;
  const winTitle=winner?.state.turn===fixture.turn?'当回合斩杀':'后续回合赢法';
  const prefix=unproven?(testedReply||openReply?'找到有条件的':'已重放一条'):'找到';
  byId('verdict').textContent=winner?prefix+winTitle:'本轮未找到斩杀';
  byId('metrics').textContent=`Forge ${result.engine} · ${result.expanded} 个节点 · ${result.workerCount} 个进程 · ${(result.elapsedMs/1000).toFixed(1)} 秒`;
  byId('scope').textContent=winner
    ? `固定库序 ${result.seed}，Forge 已重放并判定己方获胜。${winner.settled?'部分后续动作由 Forge 策略执行。':''}`
    : `在此库序和预算下，${fixture.ignoreOpponent?'目标':'对手'}最低到 ${Math.max(0,result.minOpponentLife)} 血。${trace?'下面是打到这个血量的路线。':'可以提高预算扩大搜索。'}`;
  const routes=[result,...(result.verifiedAlternatives||[])];
  const routePicker=byId('route');
  routePicker.replaceChildren();
  routes.forEach((item,i)=>{
    if(!item.winner)return;
    const turn=fixture.turn+Math.floor((item.winner.state.turn-fixture.turn)/2);
    routePicker.add(new Option(`T${turn} · ${fixture.life-item.winner.state.opponent} 点 · ${item.winner.mechanics.join(' ＋ ')||'战斗伤害'}`,String(i)));
  });
  byId('route-options').hidden=routes.length<2;
  function showRoute(route){
    renderTrace(route.trace,fixture);
    const link=byId('download-replay'),status=byId('replay-status');
    link.hidden=!route.replayUrl;
    if(route.replayUrl)link.href=route.replayUrl;
    else link.removeAttribute('href');
    link.textContent=route.replayComplete?'导出 .esreplay':'导出推演片段 .esreplay';
    status.hidden=!route.replayError;
    status.textContent=route.replayError?`回放导出失败。 ${route.replayError}`:'';
  }
  routePicker.onchange=()=>showRoute(routes[Number(routePicker.value)]);
  showRoute(result);
  const reply=byId('response');reply.hidden=fixture.ignoreOpponent;
  const replyName=item=>`${item.cardName||item.action.split(' — ')[0]}${item.targetNames?.length?' → '+item.targetNames.join('、'):''}`;
  reply.textContent=responses?.length && result.winAgainstEnumeratedReplies
    ? '在 Forge 枚举的对手优先权动作下均找到赢法。战斗声明由 Forge 策略执行。'
    : testedReply
    ? `对手在${phaseName(testedReply.phase)}用 ${replyName(testedReply)}，照这条路线打完对手还剩 ${testedReply.outcome.life} 血。`
    : openReply
    ? `对手还可以 ${replyName(openReply)}，这条应对下尚未找到斩杀。`
    : fixture.oppHand.length||fixture.oppBoard.length
      ? '结果按所填的对手手牌与场面计算。战斗声明由 Forge 策略执行。'
      : '对手手牌和战场均按空处理。';
  const detail=byId('detail');detail.replaceChildren();
  for (const gap of result.gaps||[]) details(detail,gap);
  for (const [name,count] of Object.entries(result.errors||{})) details(detail,`${count} 次分支执行失败 · ${name}`);
  for (const item of responses||[]) details(detail,`${item.ownWinVerified?'己方有赢法':item.checked?'已展开，未验证赢法':'未展开'} · ${replyName(item)}`);
  byId('diagnostics').hidden=detail.children.length===0;
}

const manaNames={G:'绿',B:'黑',C:'无色',R:'红',U:'蓝',W:'白'};

function manaText(colors) {
  return Object.entries(colors).map(([color,count])=>`${count} ${manaNames[color]||color}`).join('、');
}

function countMana(mana) {
  const colors={};
  for (const {color} of mana) colors[color]=(colors[color]||0)+1;
  return colors;
}

function describeManaSources(mana) {
  const bySource=new Map();
  for (const unit of mana) {
    const name=unit.sourceName||'法术力池';
    if (!bySource.has(name)) bySource.set(name,[]);
    bySource.get(name).push(unit);
  }
  return [...bySource].map(([name,units])=>`${name} ${manaText(countMana(units))}`).join('、');
}

function renderTrace(trace,fixture){
  const steps=byId('steps');steps.replaceChildren();
  let opponentLife=fixture.life;
  let lastWindow='';
  for (const entry of trace||[]) {
    const {action,state}=entry;
    if(action){
      const who=action.actorId===1?'':'对手 ';
      const tapped=action.tappedSources?.some(source=>source.cardId===action.cardId);
      const verbs={cast:action.description?.endsWith(' (Evoked)')?'呼魂施放':'施放',activate:'起动',play_land:'下',mana:tapped?'横置':'起动产费异能'};
      const window=state.turn+'/'+state.phase;
      const turn=fixture.turn+Math.floor((state.turn-fixture.turn)/2);
      const timing=window===lastWindow?'':`T${turn} ${phaseName(state.phase)} · `;
      lastWindow=window;
      const paid=action.manaPaid||[];
      const produced=action.manaProduced||[];
      const costs=[...new Set((action.paidCards||[]).flatMap(x=>x.cards.map(c=>c.name)))];
      const made=manaText(produced.length?countMana(produced):entry.generated||{});
      const madeBy=produced.some(unit=>unit.sourceId!==action.cardId)?`（${describeManaSources(produced)}）`:'';
      const tappedForAction=action.kind==='mana'?[]:(action.tappedSources||[]).map(source=>source.name);
      const describe=[
        made?`产 ${made}${madeBy}`:'',
        paid.length?`支付 ${manaText(countMana(paid))}（${describeManaSources(paid)}）`:'',
        tappedForAction.length?`本步横置 ${tappedForAction.join('、')}`:'',
        costs.length?'用作费用 '+costs.join('、'):'',
        action.actorId===1&&(made||paid.length)?`剩余浮费 ${manaText(state.mana||{})||'0'}`:'',
      ].filter(Boolean).join(' · ');
      const choice=action.declaredX>=0?`（X=${action.declaredX}）`:'';
      const target=action.targetNames?.length?' → '+action.targetNames.join('、'):'';
      details(steps,`${timing}${who}${verbs[action.kind]||'使用'} ${action.cardName}${choice}${target}`,describe);
    } else if(entry.kind==='choice'&&entry.label) {
      const label=entry.label.startsWith('Badgermole Cub → [')?entry.label.replace('Badgermole Cub → [','地御 '):entry.label.replace(' → [',' 找 ');
      details(steps,label.replace(/\]$/,''));
    }
    if(state.opponent!==opponentLife){
      const attackers=(entry.attackers||[]).map(([name,power])=>`${name}（${power} 力）`);
      const turn=fixture.turn+Math.floor((state.turn-fixture.turn)/2);
      details(steps,`T${turn} ${phaseName(state.phase)} · ${fixture.ignoreOpponent?'目标':'对手'} ${opponentLife} → ${Math.max(0,state.opponent)} 血`,attackers.join('、'));
      opponentLife=state.opponent;
    }
  }
}

function phaseName(phase){return ({MAIN1:'战斗前主阶段',COMBAT_BEGIN:'战斗开始',COMBAT_DECLARE_ATTACKERS:'宣告攻击',COMBAT_DECLARE_BLOCKERS:'宣告阻挡',COMBAT_DAMAGE:'战斗伤害',MAIN2:'战斗后主阶段',END_OF_TURN:'结束步骤'})[phase]||phase;}

restoreDecks();
deckSelect.addEventListener('change',changeDeck);
byId('deck-name').addEventListener('keydown',e=>{
  if (e.key==='Enter'&&!e.isComposing) {
    e.preventDefault();
    byId('deck-save').click();
  }
});
byId('deck-save').addEventListener('click',async()=>{
  if (importingDeck||request) return;
  const text=byId('deck-text').value.trim();
  if (!text) {
    deckStatus('请先粘贴英文牌表。',true);
    byId('deck-text').focus();
    return;
  }
  importingDeck=true;
  updateBusyControls();
  deckStatus('Forge 正在校验牌表…');
  try {
    const response=await fetch('/decks/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deck:text})});
    const result=await response.json();
    if (!response.ok) throw Error(result.error);
    const name=byId('deck-name').value.trim()||`自定义妖精 ${savedDecks.size+1}`;
    const existing=[...savedDecks.values()].find(deck=>deck.name===name&&deck.text===result.text);
    const deck=existing||{...result,name,id:crypto.randomUUID()};
    if (!existing) addDeckOption(deck);
    deckSelect.value=deck.id;
    const saved=changeDeck();
    byId('deck-name').value='';
    byId('deck-text').value='';
    const summary=`已选用 ${name}。主牌 ${result.mainCount} 张，备牌 ${result.sideCount} 张，主牌妖精 ${result.elfCount} 张。`;
    deckStatus(saved?summary:`${summary} 当前浏览器未能保存牌表，刷新后需要重新添加。`,!saved);
  } catch (error) {
    deckStatus(error.message,true);
  } finally {
    importingDeck=false;
    updateBusyControls();
  }
});
byId('examples').addEventListener('change',e=>{
  const demo=demos[e.target.value];
  if (!demo) return;
  deckSelect.value='';
  saveDecks();
  load(demo);
  clearResult('示例已载入，点击「搜索赢法」。');
});
byId('position').addEventListener('input',e=>{
  if (fields.includes(e.target.id)) byId('examples').value='';
});
byId('includeOpponent').addEventListener('change',updateOpponentMode);
byId('cancel').addEventListener('click',()=>request?.abort());
byId('download').addEventListener('click',()=>{
  const link=document.createElement('a');
  const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));
  link.href=url;link.download='Legacy-Elves-Forge-search.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
byId('position').addEventListener('submit',async e=>{
  e.preventDefault();
  if (request||importingDeck) return;
  request=new AbortController();
  const payload=Object.fromEntries([...fields.map(id=>[id,byId(id).value]),...numeric.map(id=>[id,Number(byId(id).value)])]);
  payload.landAvailable=byId('landAvailable').checked;
  payload.noSpells=byId('noSpells').checked;
  payload.includeOpponent=byId('includeOpponent').checked;
  const deck=savedDecks.get(deckSelect.value);
  if (deck) payload.deck=deck.text;
  updateBusyControls();
  byId('cancel').hidden=false;byId('result').hidden=true;
  byId('status').hidden=false;byId('status').textContent='Forge 正在搜索候选路线…';
  try {
    const response=await fetch('/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:request.signal});
    const result=await response.json();
    if(!response.ok) throw Error(result.error);
    show(result);
  } catch(error) {
    byId('status').textContent=error.name==='AbortError'?'已取消计算。':error.message;
  } finally {
    request=null;updateBusyControls();byId('cancel').hidden=true;
  }
});

fetch('/examples').then(r=>r.json()).then(examples=>{
  demos=examples;
  for(const [id,label] of Object.entries(labels)) byId('examples').add(new Option(label,id));
  if (deckSelect.value) changeDeck();
  else if (!fields.some(id=>byId(id).value)) {
    byId('examples').value='hoof-clean';
    load(demos['hoof-clean']);
  }
}).catch(()=>{byId('status').textContent='无法读取示例。请检查计算器服务。';});
