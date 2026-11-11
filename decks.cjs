const sideHeader=/^(?:sideboard|side deck|备牌)\s*[:：]?$/i;
const sidePrefix=/^SB\s*:\s*/i;
const mainHeader=/^(?:deck|main(?:board| deck)?|主牌)\s*[:：]?$/i;
const total=cards=>[...cards.values()].reduce((sum,count)=>sum+count,0);

function parseDeck(text) {
  if (typeof text!=='string'||!text.trim()) throw Error('请粘贴英文牌表。');
  const rows=text.trim().split(/\r?\n/).map(row=>row.trim());
  const heading=row=>row.replace(/^\/\/\s*/, '');
  const explicitSide=rows.some(row=>sideHeader.test(heading(row))||sidePrefix.test(row));
  const main=new Map(), side=new Map();
  let section=main, mainCount=0;
  for (const [index,row] of rows.entries()) {
    if (!row) {
      if (!explicitSide&&mainCount>=60) section=side;
      continue;
    }
    if (mainHeader.test(heading(row))) {
      section=main;
      continue;
    }
    if (sideHeader.test(heading(row))||sidePrefix.test(row)) section=side;
    if (sideHeader.test(heading(row))||/^(?:#|\/\/)/.test(row)) continue;
    const match=/^(\d+)(?:x)?\s+(.+)$/i.exec(row.replace(sidePrefix,''));
    if (!match) throw Error(`牌表第 ${index+1} 行请填写数量和英文牌名。`);
    const count=Number(match[1]);
    const name=match[2].replaceAll('’',"'").replace(/\s+\([A-Z0-9]{2,8}\)\s+\d+[a-z★]*$/u,'').trim();
    if (!Number.isSafeInteger(count)||count<1||count>120||!name||/[;|\x00-\x1f]/.test(name)) {
      throw Error(`牌表第 ${index+1} 行的牌名或数量有误。`);
    }
    section.set(name,(section.get(name)||0)+count);
    if (section===main) mainCount+=count;
  }
  const sideCount=total(side);
  if (mainCount<60||mainCount>120) throw Error('主牌需要 60–120 张。备牌可写在 Sideboard 下。');
  if (sideCount>15) throw Error('备牌最多 15 张。');
  return {main,side,mainCount,sideCount};
}

function validateDeck(parsed, cards) {
  const lookup=new Map(cards.map(card=>[card.name,card]));
  const missing=[...new Set([...parsed.main.keys(),...parsed.side.keys()])].filter(name=>!lookup.get(name)?.found);
  if (missing.length) throw Error(`Forge 找不到这些牌：${missing.join('、')}。请使用英文牌名。`);
  const copies=new Map();
  const canonical=section=>{
    const counts=new Map();
    for (const [name,count] of section) {
      const {canonicalName,copyLimit}=lookup.get(name);
      if (/[;|\x00-\x1f]/.test(canonicalName)) throw Error(`暂不支持这张牌的牌名：${canonicalName}。`);
      const combined=(copies.get(canonicalName)||0)+count;
      if (copyLimit>0&&combined>copyLimit) throw Error(`${canonicalName} 的主牌和备牌合计最多 ${copyLimit} 张，当前有 ${combined} 张。`);
      copies.set(canonicalName,combined);
      counts.set(canonicalName,(counts.get(canonicalName)||0)+count);
    }
    return [...counts].map(([name,count])=>({name,count}));
  };
  const main=canonical(parsed.main), side=canonical(parsed.side);
  let creatureCount=0, elfCount=0;
  for (const [name,count] of parsed.main) {
    if (lookup.get(name).creature) creatureCount+=count;
    if (lookup.get(name).elfCreature) elfCount+=count;
  }
  if (elfCount<12||elfCount*2<creatureCount) {
    throw Error(`主牌有 ${elfCount} 张妖精生物、${creatureCount} 张生物。妖精生物须至少 12 张，并占主牌生物至少一半。`);
  }
  const format=section=>section.map(({name,count})=>`${count} ${name}`).join('\n');
  const text=format(main)+(side.length?'\n\nSideboard\n'+format(side):'');
  return {main,side,mainCount:parsed.mainCount,sideCount:parsed.sideCount,creatureCount,elfCount,text};
}

module.exports={parseDeck,validateDeck};
