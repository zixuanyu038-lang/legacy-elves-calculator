const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makeRoot,fixtures}=require('./search.cjs');
const {ElvesForgeClient}=require('./forge-adapter.cjs');

const C="Gaea's Cradle", W='Wirewood Symbiote', T='Temur Sabertooth', R='Quirion Ranger';
const F='Forest', L='Llanowar Elves', U='Badgermole Cub';
const H='Craterhoof Behemoth';
const S='Formidable Speaker', Z="Green Sun's Zenith";

async function check(client,fixture,steps,finish=false) {
  const root=makeRoot(fixture);
  const executed=[];
  const options={command:'expand',root,skipForcedPasses:true,exhaustive:true,enumerateChoices:true};
  let node=await client.request(options);
  const report=[];
  for (const step of steps) {
    let action;
    for (let pass=0;pass<8;pass++) {
      action=node.actions.find(a=>step.pick(a,node));
      if(action)break;
      const next=node.actions.find(a=>a.kind==='pass');
      if(!next)break;
      executed.push(next);
      node=await client.request({...options,path:executed});
    }
    if(!action) throw Error(`${step.label}: ${node.actions.map(a=>a.label).join(' / ')} at turn ${node.state.turnNumber}, ${node.state.phase}`);
    executed.push(action);
    node=await client.request({...options,path:executed});
    const p=node.state.players[1];
    report.push({step:step.label,choice:action.label,mana:p.manaPool.G||0,hand:p.hand.map(c=>c.name),
      lands:p.battlefield.filter(c=>c.types.includes('Land')).map(c=>({name:c.name,tapped:c.tapped,types:c.types,counters:c.counters})),
      board:p.battlefield.map(c=>[c.name,c.power,c.tapped,c.hasSummoningSickness]),
      phase:node.state.phase,turn:node.state.turnNumber,life:node.state.players[0].life,winner:node.state.winnerId??null});
    step.assert?.(node,report.at(-1));
  }
  for (let i=0;finish&&i<16&&node.state.turnNumber===fixture.turn&&node.state.status!=='COMPLETE';i++) {
    const pass=node.actions.find(a=>a.kind==='pass');
    if(!pass)break;
    executed.push(pass);
    node=await client.request({...options,path:executed});
  }
  return {fixture,path:executed,steps:report,final:{life:node.state.players[0].life,winner:node.state.winnerId??null,turn:node.state.turnNumber,phase:node.state.phase}};
}

const action=(kind,name)=>a=>a.kind===kind&&a.cardName===name;
const choose=(source,name)=>a=>a.kind==='choice'&&a.cardName===source&&a.label.includes(`[${name}]`);
const target=(source,name,cost)=>(a,node)=>a.kind==='activate'&&a.cardName===source&&(!cost||a.costName===cost)&&
  (a.targets||[]).flat().some(id=>node.state.players[1].battlefield.some(c=>c.name===name&&id===`c:${c.id}`));
const float=(name,mana)=>({label:`横 ${name}`,pick:action('mana',name),assert(_,r){if(mana!==undefined)assert.equal(r.mana,mana);}});
const use=(source,name,cost)=>({label:`${source} 重置 ${name}`,pick:target(source,name,cost)});
const cast=name=>({label:`施放 ${name}`,pick:action('cast',name)});
const land=name=>({label:`下 ${name}`,pick:action('play_land',name)});
const pick=(source,name)=>({label:`${source} 选 ${name}`,pick:choose(source,name)});
const setup=(id,board,hand=[],extra={})=>({id,turn:4,board,hand,manualMana:true,...extra});
const animated=`${C}|Earthbend:1`;

async function ending(client,fixture,steps,damage){
  const result=await check(client,fixture,steps,true);
  assert.equal(result.final.winner,'1',JSON.stringify(result.final));
  assert.equal(result.final.life,20-damage);
  return result;
}

async function run() {
  const client=new ElvesForgeClient({dataDir:path.join(__dirname,'.forge'),activeProcessors:3});
  const log={};
  const tasks={
    eachUntapOnce:async()=>{
      const fixture=setup('each-untap-once',[F,F,L,U,R,W,'Elvish Mystic']);
      const exclude=name=>node=>assert.ok(!node.actions.some(a=>a.kind==='activate'&&a.cardName===name),`${name} offered again`);
      const result=await check(client,fixture,[
        float(L,2),{...use(R,L,F),assert:exclude(R)},float(L,4),
        {...use(W,L,R),assert:exclude(W)},float(L,6),cast(R),use(R,L,F),float(L,7),
      ]);
      const used=makeRoot(setup('already-used',[F,F,L,U,`${R}|UntapUsed`,`${W}|UntapUsed`,'Elvish Mystic']));
      const initial=await client.request({command:'expand',root:used});
      exclude(R)(initial);
      exclude(W)(initial);
      return result;
    },
    rangerSix:()=>check(client,setup('ranger-six',[F,L,U,R],['Natural Order'],{lands:0}),[
      float(F,1),float(L,3),use(R,L,F),float(L,5),land(F),float(F,6),
    ]),
    symbioteFour:()=>check(client,setup('symbiote-four',[L,U,W,R]),[
      float(L,2),use(W,L,R),float(L,4),
    ]),
    bothUntappersSeven:()=>check(client,setup('both-untappers-seven',[F,F,L,U,W,R],['Natural Order']),[
      float(L,2),use(R,L,F),float(L,4),use(W,L,R),float(L,6),cast(R),use(R,L,F),float(L,7),
    ]),
    cradleRangerZenith20:()=>ending(client,setup('cradle-ranger-zenith-20',[F,animated,U,R],[Z]),[
      float(F,1),float(C,5),use(R,C,F),float(C,9),
      {label:'Zenith X=8',pick:a=>action('cast',Z)(a)&&a.x===8},pick(Z,H),
    ],20),
    cradleRangerHoof20:()=>ending(client,setup('cradle-ranger-hoof-20',[F,animated,U,R],[H]),[
      float(C,4),use(R,C,F),float(C,8),cast(H),
    ],20),
    speakerRanger28:()=>ending(client,setup('speaker-ranger-28',[F,C,L,S,R,W],[H]),[
      float(C,4),use(S,C),float(C,7),use(R,S,F),use(S,C),float(C,10),cast(H),
    ],28),
    symbioteHold29:()=>ending(client,setup('symbiote-hold-29',[animated,U,W,R,L],[H]),[
      float(C,6),use(W,C,R),float(C,11),cast(H),
    ],29),
    symbioteReplay33:()=>ending(client,setup('symbiote-replay-33',[animated,U,W,R,L],[H]),[
      float(C,6),use(W,C,R),cast(R),float(C,11),cast(H),
    ],33),
    secondCradle35:()=>ending(client,setup('second-cradle-35',[F,C,L,R,W,U],[C,H],{lands:0}),[
      float(C,4),land(C),float(C,8),cast(H),
    ],35),
    repeatedHoof:()=>ending(client,setup('repeat-hoof',[F,L,R,T],[H],{green:18}),[
      cast(H),{label:'第一轮 Hoof 触发结算后回手',pick:(a,n)=>action('activate',T)(a)&&!n.state.stack.length&&n.state.players[1].battlefield.some(c=>c.name===H)},pick(T,H),cast(H),
    ],39),
    cradleLoop:async()=>{
      const fixture={id:'cradle-loop-replay',turn:4,board:[F,`${C}|Earthbend:1`,U,T,W,R,L],hand:[],manualMana:true};
      const initial=await client.request({command:'expand',root:makeRoot(fixture)});
      const cradle=initial.state.players[1].battlefield.find(c=>c.name===C);
      assert.ok(cradle.types.includes('Creature'),'Cradle must be restored as a creature');
      let returned;
      const loop=() => [
        {label:'横置地御 Cradle',pick:action('mana',C)},
        {label:'Symbiote 回收一费妖精、重置 Cradle',pick:target(W,C),assert(node,r){returned=r.hand.find(n=>[R,L].includes(n));assert.ok(returned);}},
        {label:'Sabertooth 回收 Symbiote',pick:action('activate',T)},
        {label:'选 Symbiote',pick:choose(T,W)},
        {label:'重下 Symbiote',pick:action('cast',W)},
        {label:'重下一费妖精',pick:a=>action('cast',returned)(a)},
      ];
      const result=await check(client,fixture,[...loop(),...loop()]);
      assert.equal(result.steps[5].mana,3);
      assert.equal(result.steps[11].mana,6);
      return result;
    },
    t2Sequence:async()=>{
      const fixture=fixtures.find(f=>f.id==='cub-sprint');
      const result=await check(client,fixture,[
        {label:'下 Cradle',pick:action('play_land',C)},
        {label:'Forest 产费',pick:action('mana',F)},
        {label:'Cradle 产费',pick:action('mana',C)},
        {label:'下 Cub',pick:action('cast',U)},
        {label:'地御 Cradle',pick:choose(U,C)},
        {label:'Llanowar 产两费',pick:action('mana',L),assert(_node,r){assert.equal(r.mana,2);}},
        {label:'下 Ranger',pick:action('cast',R)},
        {label:'下第一只 Symbiote',pick:action('cast',W)},
        {label:'Ranger 重置 Cradle',pick:target(R,C)},
        {label:'Cradle 产六费',pick:action('mana',C),assert(_node,r){assert.equal(r.mana,6);}},
        {label:'下第二只 Symbiote',pick:action('cast',W)},
        {label:'第一只 Symbiote 回收 Ranger、重置 Cradle',pick:target(W,C,R)},
        {label:'重下 Ranger',pick:action('cast',R)},
        {label:'第二只 Symbiote 回收 Ranger、重置 Llanowar',pick:target(W,L,R)},
        {label:'施放 Natural Order',pick:a=>action('cast','Natural Order')(a)&&a.costName===W},
        {label:'找 Craterhoof',pick:choose('Natural Order',H)},
      ],true);
      assert.equal(result.final.winner,'1',JSON.stringify(result.final));
      assert.equal(result.final.life,-2);
      return result;
    },
  };
  try {
    for (const [name,task] of Object.entries(tasks)) {
      try {log[name]=await task();console.log(name,'passed');}
      catch(e){log[name]={error:e.message};console.error(name,e.message);process.exitCode=1;}
    }
    fs.writeFileSync(path.join(__dirname,'Forge-crosschecks.json'),JSON.stringify(log,null,2));
  } finally {client.close();}
}

run().catch(e=>{console.error(e);process.exitCode=1;});
