'use strict';

const {gzipSync}=require('node:zlib');

const phases={
  COMBAT_BEGIN:'BEGIN_COMBAT',
  COMBAT_DECLARE_ATTACKERS:'DECLARE_ATTACKERS',
  COMBAT_DECLARE_BLOCKERS:'DECLARE_BLOCKERS',
  COMBAT_FIRST_STRIKE_DAMAGE:'FIRST_STRIKE_DAMAGE',
  COMBAT_END:'END_COMBAT',
  END_OF_TURN:'END_STEP',
};
const actionEvents={cast:'SPELL_CAST',activate:'ABILITY_ACTIVATED',play_land:'LAND_PLAYED',mana:'MANA_LOG'};

// Studio supports an object patch and whole-value replacement in format version 1.
function difference(before,after){
  if(before===after)return null;
  if(!before||!after||typeof before!=='object'||typeof after!=='object'||Array.isArray(before)||Array.isArray(after)){
    return JSON.stringify(before)===JSON.stringify(after)?null:{s:after};
  }
  const fields={};
  const removed=Object.keys(before).filter(key=>!Object.hasOwn(after,key));
  for(const [key,value] of Object.entries(after)){
    const patch=difference(before[key],value);
    if(patch)fields[key]=patch;
  }
  return removed.length||Object.keys(fields).length?{o:fields,d:removed}:null;
}

function encodeReplay(run,{seed,ignoreOpponent}){
  const {trace,state:final}=run;
  if(trace?.[0]?.kind!=='root'||trace.at(-1).kind!=='end')throw Error('缺少 Forge 重放的起点或终点。');
  const complete=run.stopReason==='game_over'&&final.status==='COMPLETE';
  const winner=complete&&final.winnerId!=null?String(final.winnerId):null;
  const result=winner==null?null:winner==='1'?'win':'loss';
  const players=trace[0].state.players.map(p=>({seat:Number(p.id),name:p.name}));
  const title=complete?'妖精计算器 · Forge 重放':'妖精计算器 · 推演片段';
  const header={format:'endstep-replay',formatVersion:1,recordedAt:new Date().toISOString(),seat:1,players,games:1,complete,result,
    branchMeta:{format:'endstep-forge-search-branch',version:1,title,engine:run.engine,validation:'forge-executed-with-audited-root',
      hypothetical:true,sourceKind:'description',scope:'single-game-continuation',complete,seed,
      stop:{reason:run.stopReason,turn:final.turnNumber}}};
  const rows=[header,{k:'chapter',t:0,game:1,edge:'start'}];
  let previous=null;
  let time=0;
  let sequenceNumber=0;
  function event(state,type,message,fields={}){
    rows.push({k:'event',t:time,event:{type,message,gameId:state.gameId,sequenceNumber:++sequenceNumber,...fields}});
  }
  for(const [index,frame] of trace.entries()){
    const raw=frame.state;
    const winsBySeat=[Number(raw.status==='COMPLETE'&&winner==='0'),Number(raw.status==='COMPLETE'&&winner==='1')];
    const state={...raw,phase:phases[raw.phase]||raw.phase,step:phases[raw.step]||raw.step,
      matchScore:{gameNumber:1,gamesPerMatch:1,gamesPlayed:raw.status==='COMPLETE'?1:0,winsBySeat,
        player0Wins:winsBySeat[0],player1Wins:winsBySeat[1],isMatchOver:raw.status==='COMPLETE'},
      players:raw.players.map(p=>String(p.id)==='1'?p:{...p,hand:p.hand.map(c=>({id:c.id,ownerId:c.ownerId,controllerId:c.controllerId,name:'Hidden card',faceDown:true}))})};
    delete state.sequenceNumber;
    time=index*500;
    const playerIndex=state.activePlayerId;
    const playerName=state.players.find(p=>p.id===playerIndex)?.name;
    if(!previous||state.turnNumber!==previous.turnNumber){
      event(state,'TURN_BEGAN',`Turn ${state.turnNumber} (${playerName})`,{turnNumber:state.turnNumber,playerIndex,playerName});
    }
    const patch=previous?difference(previous,state):null;
    if(index%30===0||index===trace.length-1)rows.push({k:'key',t:time,state});
    else if(patch)rows.push({k:'diff',t:time,patch});
    if(!previous||state.phase!==previous.phase||state.turnNumber!==previous.turnNumber){
      event(state,'TURN_PHASE',state.phase,{phase:state.phase,playerIndex,playerName});
    }
    if(!index)event(state,'ADD_LOG',`[Forge] 从输入的 T${state.turnNumber} 主阶段开始，库序种子 ${seed}。${ignoreOpponent?'单人模式，对手由 Forge 自动推进。':''}`);
    if(previous){
      for(const player of state.players){
        const old=previous.players.find(p=>p.id===player.id);
        const actor={playerIndex:player.id,playerName:player.name};
        if(old.life!==player.life)event(state,'PLAYER_LIFE_CHANGED','',{...actor,oldValue:old.life,newValue:player.life});
        const attackers=player.battlefield.filter(c=>c.isAttacking).map(c=>c.id);
        if(attackers.length&&!old.battlefield.some(c=>c.isAttacking)){
          event(state,'ATTACKERS_DECLARED','',{...actor,amount:attackers.length,attackerIds:attackers});
        }
      }
    }
    const action=frame.action;
    if(action){
      const actor=state.players.find(p=>String(p.id)===String(action.actorId));
      event(state,actionEvents[action.kind]||'ADD_LOG',action.description||action.cardName,
        {cardId:action.cardId,cardName:action.cardName,playerIndex:String(action.actorId),playerName:actor?.name});
      const mana=(action.manaPaid||[]).map(unit=>`${unit.sourceName} {${unit.color}}`);
      const costs=(action.paidCards||[]).flatMap(payment=>payment.cards.map(card=>`${payment.kind} ${card.name}`));
      if(action.lifeCost)costs.push(`支付 ${action.lifeCost} 点生命`);
      if(mana.length||costs.length)event(state,'MANA_LOG',`支付 ${[...mana,...costs].join('、')}`);
    }
    if(frame.kind==='choice')event(state,'VALUE_CHOSEN',frame.label);
    for(const message of frame.logs||[])if(message)event(state,'ADD_LOG',message);
    previous=state;
  }
  if(complete){
    const playerName=players.find(p=>String(p.seat)===winner)?.name;
    if(playerName)event(previous,'GAME_OUTCOME',`${playerName} 获胜`,{playerIndex:winner,playerName,endReason:'forge-engine-outcome'});
    else event(previous,'GAME_FINISHED','Forge 判定本局平局。');
    rows.push({k:'chapter',t:time,game:1,edge:'end',outcome:result});
  }else{
    event(previous,'ADD_LOG','[Forge] 推演在此结束，本局尚无胜负。');
  }
  const jsonl=rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
  if(Buffer.byteLength(jsonl)>32*1024*1024)throw Error('回放超过 Studio 的解压大小上限。');
  const bytes=gzipSync(jsonl);
  if(bytes.length>16*1024*1024)throw Error('回放超过 Studio 的文件大小上限。');
  return bytes;
}

module.exports={encodeReplay};
