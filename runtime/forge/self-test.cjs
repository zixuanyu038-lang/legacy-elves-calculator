'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');
const {ElvesForgeClient}=require('../../forge-adapter.cjs');
const {makeRoot,search,fixtures}=require('../../search.cjs');

async function checkElvesRuntime(client){
  const root=makeRoot({id:'forge-self-test',turn:3,ignoreOpponent:true,manualMana:true,green:2,
    board:['Forest','Dryad Arbor','Llanowar Elves'],hand:['Badgermole Cub']});
  const options={root,command:'expand',skipForcedPasses:true,enumerateChoices:true};
  const start=await client.request(options);
  const cast=start.actions.find(action=>action.kind==='cast'&&action.cardName==='Badgermole Cub');
  assert.ok(cast,'应能施放 Badgermole Cub');
  const actions=[cast];
  const targeting=await client.request({...options,path:actions});
  const earthbend=targeting.actions.find(action=>action.kind==='choice'&&action.label.includes('[Dryad Arbor]'));
  assert.ok(earthbend,'Cub 地御应能选择 Dryad Arbor');
  actions.push(earthbend);
  const resolved=await client.request({...options,path:actions});
  const arbor=resolved.state.players[1].battlefield.find(card=>card.name==='Dryad Arbor');
  assert.equal(arbor?.counters.P1P1,1,'苗地应得到地御的 +1/+1 指示物');
  const tap=resolved.actions.find(action=>action.kind==='mana'&&action.cardName==='Dryad Arbor');
  assert.ok(tap,'苗地应能起动法术力异能');
  const tapped=await client.request({...options,path:[...actions,tap]});
  assert.equal(tapped.state.players[1].manaPool.G,2,'Cub 应让苗地多产一绿');

  const fixture={...fixtures.find(item=>item.id==='hoof-clean'),depth:32,budget:420,ignoreOpponent:true};
  const result=await search(client,fixture,{orderSeed:2488});
  assert.equal(result.winner?.state.winner,'1','Forge 应找到并重放 Natural Order 斩杀');
  assert.ok(result.trace?.some(frame=>frame.action?.cardName==='Natural Order'&&frame.action.manaPaid.length===4),'应核对 Natural Order 的四点费用');
  assert.ok(result.trace?.some(frame=>frame.kind==='end'&&frame.state.opponent<=0),'应到达对手生命归零的终局');
}

async function main(){
  const dataDir=path.join(__dirname,'..','..','.forge');
  const client=new ElvesForgeClient({dataDir,activeProcessors:3});
  try{
    console.log(`正在自检 ${client.engine}…`);
    await checkElvesRuntime(client);
    console.log(`${client.engine} 自检通过。Cub 地御苗地、额外产绿、Natural Order 付费和战斗斩杀均已通过。`);
  }finally{client.close();}
}

if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={checkElvesRuntime};
