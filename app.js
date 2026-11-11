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
  byId('verdict').textContent=winner?(winner.state.turn===fixture.turn?'找到当回合斩杀':'找到后续回合赢法'):'本轮未找到斩杀';
  byId('metrics').textContent=`Forge ${result.engine} · ${result.expanded} 个节点 · ${result.workerCount} 个进程 · ${(result.elapsedMs/1000).toFixed(1)} 秒`;
  byId('scope').textContent=winner
    ? `固定库序 ${result.seed}，Forge 已重放并判定己方获胜。${winner.guide?`这条路线由 ${winner.guide} 公式引导展开。`:''}${winner.settled?'部分后续动作由 Forge 策略执行。':''}`
    : `在此库序和预算下，${fixture.ignoreOpponent?'目标':'对手'}最低到 ${Math.max(0,result.minOpponentLife)} 血。${trace?'下面是打到这个血量的路线。':'可以提高预算扩大搜索。'}`;
  const routes=winner?[{winner,trace},...(result.verifiedAlternatives||[])]:[];
  const routePicker=byId('route');
  routePicker.replaceChildren();
  routes.forEach((item,i)=>{
    const turn=fixture.turn+Math.floor((item.winner.state.turn-fixture.turn)/2);
    routePicker.add(new Option(`T${turn} · ${fixture.life-item.winner.state.opponent} 点 · ${item.winner.mechanics.join(' ＋ ')||'战斗伤害'}`,String(i)));
  });
  byId('route-options').hidden=routes.length<2;
  routePicker.onchange=()=>renderTrace(routes[Number(routePicker.value)].trace,fixture);
  renderTrace(trace,fixture);
  const reply=byId('response');reply.hidden=fixture.ignoreOpponent;
  reply.textContent=responses?.length && result.winAgainstEnumeratedReplies
    ? '在 Forge 枚举的对手优先权动作下均找到赢法。战斗声明由 Forge 策略执行。'
    : responses?.length
    ? `这条胜局有其他合法应对，例如 ${responses[0].action.split(' — ')[0]}。看搜索详情可核对哪些应对已有赢法。`
    : fixture.oppHand.length||fixture.oppBoard.length
      ? '结果按所填的对手手牌与场面计算。战斗声明由 Forge 策略执行。'
      : '对手手牌和战场均按空处理。';
  const detail=byId('detail');detail.replaceChildren();
  for (const gap of result.gaps||[]) details(detail,gap);
  for (const [name,count] of Object.entries(result.errors||{})) details(detail,`${count} 次分支执行失败 · ${name}`);
  for (const item of responses||[]) details(detail,`${item.ownWinVerified?'己方有赢法':item.checked?'已展开，未验证赢法':'未展开'} · ${item.action}`);
  byId('diagnostics').hidden=detail.children.length===0;
}

function renderTrace(trace,fixture){
  const steps=byId('steps');steps.replaceChildren();
  let opponentLife=fixture.life;
  let lastWindow='';
  for (const entry of trace||[]) {
    const {action,state}=entry;
    if(action){
      const who=action.actorId===1?'':'对手 ';
      const verbs={cast:'施放',activate:'启动',play_land:'下',mana:'横置产费'};
      const window=state.turn+'/'+state.phase;
      const turn=fixture.turn+Math.floor((state.turn-fixture.turn)/2);
      const timing=window===lastWindow?'':`T${turn} ${phaseName(state.phase)} · `;
      lastWindow=window;
      const sourceNames=(action.manaPaid||[]).map(x=>x.sourceName);
      const paid=[...new Set(sourceNames)].map(name=> {
        const n=sourceNames.filter(source=>source===name).length;
        return n>1?`${name} ×${n}`:name;
      });
      const costs=[...new Set((action.paidCards||[]).flatMap(x=>x.cards.map(c=>c.name)))];
      const manaNames={G:'绿',B:'黑',C:'无色',R:'红',U:'蓝',W:'白'};
      const made=Object.entries(entry.generated||{}).map(([color,n])=>`${n} ${manaNames[color]||color}`).join('、');
      const describe=[made?'产生 '+made:'',paid.length?'付费来源 '+paid.join('、'):'',costs.length?'用作费用 '+costs.join('、'):''].filter(Boolean).join(' · ');
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

byId('examples').addEventListener('change',e=>{if (demos[e.target.value]) load(demos[e.target.value]);});
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
  if (request) return;
  request=new AbortController();
  const payload=Object.fromEntries([...fields.map(id=>[id,byId(id).value]),...numeric.map(id=>[id,Number(byId(id).value)])]);
  payload.landAvailable=byId('landAvailable').checked;
  payload.noSpells=byId('noSpells').checked;
  payload.includeOpponent=byId('includeOpponent').checked;
  byId('run').disabled=true;byId('cancel').hidden=false;byId('result').hidden=true;
  byId('status').hidden=false;byId('status').textContent='Forge 正在搜索候选路线…';
  try {
    const response=await fetch('/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:request.signal});
    const result=await response.json();
    if(!response.ok) throw Error(result.error);
    show(result);
  } catch(error) {
    byId('status').textContent=error.name==='AbortError'?'已取消计算。':error.message;
  } finally {
    request=null;byId('run').disabled=false;byId('cancel').hidden=true;
  }
});

fetch('/examples').then(r=>r.json()).then(examples=>{
  demos=examples;
  for(const [id,label] of Object.entries(labels)) byId('examples').add(new Option(label,id));
  byId('examples').value='hoof-clean';load(demos['hoof-clean']);
}).catch(()=>{byId('status').textContent='无法读取示例。请检查计算器服务。';});
