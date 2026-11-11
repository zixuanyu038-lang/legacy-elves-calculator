const fs = require('node:fs/promises');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const {ForgeClient} = require('./runtime/forge-client');

const execute = promisify(execFile);
const worker = path.join(__dirname,'./runtime/forge/EngineWorker.java');

function extend(source) {
  function replace(before,after) {
    if (!source.includes(before)) throw Error('Studio Forge adapter changed: '+before);
    source = source.replace(before,after);
  }
  replace('if(ability!=null&&ability.getHostCard().getName().equals("Atraxa, Grand Unifier")){',
    'if(ability!=null&&List.of("Atraxa, Grand Unifier","Eladamri, Korvecdal","Temur Sabertooth","Formidable Speaker","Once Upon a Time").contains(ability.getHostCard().getName())){');
  replace('if(destination==ZoneType.Battlefield&&origin.contains(ZoneType.Hand)&&', `
            String sourceName=ability.getHostCard().getName();
            if(origin.contains(ZoneType.Library)&&List.of("Natural Order","Green Sun's Zenith","Formidable Speaker","Vibrance","Once Upon a Time","Misty Rainforest","Verdant Catacombs","Windswept Heath","Wooded Foothills").contains(sourceName)){
                Map<String,Card> unique=new LinkedHashMap<>();
                for(Card card:options)unique.putIfAbsent(card.getName(),card);
                List<Card> selection=searchEffectChoice(unique.values(),ability,0,1);
                if(selection!=null)return selection.isEmpty()?null:selection.get(0);
            }
            if(origin.contains(ZoneType.Battlefield)&&sourceName.equals("Temur Sabertooth")){
                List<Card> selection=searchEffectChoice(options,ability,0,1);
                if(selection!=null)return selection.isEmpty()?null:selection.get(0);
            }
            if(destination==ZoneType.Battlefield&&origin.contains(ZoneType.Hand)&&`);
  replace('        @Override public List<SpellAbility> chooseSpellAbilityToPlay(){', `
        @Override public List<SpellAbility> chooseSpellAbilityToPlay(){
            if(bool(context.root,"ignoreOpponent",false)&&context.seats.indexOf(actor)!=context.viewer)return null;`);
  replace('final Set<String> enumerationGaps=new LinkedHashSet<>();',
    'final Set<String> enumerationGaps=new LinkedHashSet<>(), usedElfUntaps=new HashSet<>();');
  replace('    static List<Choice> candidates(Context ctx,Player p){', `
    static boolean oncePerTurnUntap(SpellAbility sa){
        return !sa.isSpell()&&sa.getApi()==ApiType.Untap&&Set.of("Quirion Ranger","Wirewood Symbiote").contains(sa.getHostCard().getName());
    }
    static String elfUntapKey(Context ctx,Card card){
        return ctx.game.getPhaseHandler().getTurn()+"/"+card.getId()+"/"+card.getGameTimestamp();
    }
    static List<Choice> candidates(Context ctx,Player p){`);
  replace('for(SpellAbility original:all){', `for(SpellAbility original:all){
            if(oncePerTurnUntap(original)&&ctx.usedElfUntaps.contains(elfUntapKey(ctx,original.getHostCard())))continue;`);
  replace('            require(sa.canPlay(),"Forge rejected action timing: "+sa.getHostCard().getName());', `
            require(sa.canPlay(),"Forge rejected action timing: "+sa.getHostCard().getName());
            String elfUntap=oncePerTurnUntap(sa)?elfUntapKey(context,sa.getHostCard()):null;
            require(elfUntap==null||!context.usedElfUntaps.contains(elfUntap),"Untap ability already used this turn: "+sa.getHostCard().getName());`);
  replace('            require(success,"Forge rejected payment or choices: "+label);', `
            require(success,"Forge rejected payment or choices: "+label);
            if(elfUntap!=null)context.usedElfUntaps.add(elfUntap);`);
  replace('        if(root.has("impending")){', `
        if(root.has("usedUntaps"))for(JsonElement id:root.getAsJsonArray("usedUntaps")){
            Card card=(Card)c.target("c:"+id.getAsInt());
            require(card.isInZone(ZoneType.Battlefield)&&Set.of("Quirion Ranger","Wirewood Symbiote").contains(card.getName()),"Invalid used untap source");
            c.usedElfUntaps.add(elfUntapKey(c,card));
        }
        if(root.has("impending")){`);
  replace('if(ctx.exhaustive&&original.costHasManaX())ctx.enumerationGaps.add',
    'if(ctx.exhaustive&&original.costHasManaX()&&!original.getHostCard().getName().equals("Green Sun\'s Zenith"))ctx.enumerationGaps.add');
  replace('new int[]{0,1,2,3,5}:new int[]{-1}',
    '(original.getHostCard().getName().equals("Green Sun\'s Zenith")?new int[]{0,1,2,3,4,5,6,7,8,9,10}:new int[]{0,1,2,3,5}):new int[]{-1}');
  replace('if(original.isManaAbility())continue;',
    `if(original.isManaAbility()){
                var ph=ctx.game.getPhaseHandler();
                boolean ownMain=ph.getPlayerTurn()==p&&Set.of("MAIN1","MAIN2").contains(ph.getPhase().name());
                boolean landThreat=!ctx.game.getStack().isEmpty()&&ctx.game.getStack().peekAbility().getHostCard().getName().equals("Wasteland");
                if(!bool(ctx.root,"manualMana",false)||actor!=ctx.viewer||!ownMain||(!ctx.game.getStack().isEmpty()&&!landThreat))continue;
            }`);
  replace('sa.isSpell()?"cast":"activate";boolean success;',
    'sa.isSpell()?"cast":sa.isManaAbility()?"mana":"activate";boolean success;');
  replace('else success=ComputerUtil.handlePlayingSpellAbility',
    'else if(sa.isManaAbility())success=ComputerUtil.playNoStack(actor,sa,context.game,false);\n            else success=ComputerUtil.handlePlayingSpellAbility');
  replace('            SpellAbility[] actualAbility={sa};', `
            List<Mana> beforeMana=new ArrayList<>();
            if(context.includeTrace&&sa.isManaAbility())actor.getManaPool().forEach(beforeMana::add);
            SpellAbility[] actualAbility={sa};`);
  replace('                action.put("manaPaid",mana);', `
                if(sa.isManaAbility()){
                    List<Object> produced=new ArrayList<>();
                    for(Mana added:actor.getManaPool()){
                        if(beforeMana.remove(added))continue;
                        Card source=added.getSourceCard();
                        String color=forge.card.MagicColor.toShortString(added.getColor());
                        if(source==null)produced.add(Map.of("color",color));
                        else produced.add(Map.of("sourceId",context.external(source),"sourceName",source.getName(),"color",color));
                    }
                    action.put("manaProduced",produced);
                }
                action.put("manaPaid",mana);`);
  replace('sa.isSpell()?"cast":"activate");', 'sa.isSpell()?"cast":sa.isManaAbility()?"mana":"activate");');
  replace('targetProducts(ctx,p,sa,parts(sa),0,new JsonArray(),result,action,ctx.exhaustive?Integer.MAX_VALUE:Math.min(80,result.size()+8));',
    'costCandidates(ctx,p,sa,result,action);');
  replace('    static List<Choice> candidates(Context ctx,Player p){', `
    static void costCandidates(Context ctx,Player p,SpellAbility sa,List<Choice> result,JsonObject action){
        String name=sa.getHostCard().getName();
        String valid=sa.isSpell()&&name.equals("Natural Order")?"Creature.Green":null;
        if(!sa.isSpell()&&name.equals("Wirewood Symbiote"))valid="Elf";
        if(!sa.isSpell()&&name.equals("Quirion Ranger"))valid="Forest";
        int limit=ctx.exhaustive?Integer.MAX_VALUE:Math.min(80,result.size()+8);
        if(valid==null){targetProducts(ctx,p,sa,parts(sa),0,new JsonArray(),result,action,limit);return;}
        for(Card card:p.getCardsIn(ZoneType.Battlefield)){
            if(!card.isValid(valid,p,sa.getHostCard(),sa))continue;
            SpellAbility paid=sa.copy(p);
            String uid=valid+(valid.contains(".")?"+":".")+"CardUID_"+card.getId();
            String cost=sa.isSpell()?"2 G G Sac<1/"+uid+"/green creature>":"Return<1/"+uid+">";
            paid.setPayCosts(new forge.game.cost.Cost(cost,!sa.isSpell()));
            if(!ComputerUtilCost.canPayCost(paid,p,false))continue;
            JsonObject desc=action.deepCopy();
            desc.addProperty("costCard",ctx.external(card));
            desc.addProperty("costName",card.getName());
            desc.addProperty("label",str(desc,"label","")+" ["+(sa.isSpell()?"sacrifice ":"return ")+card.getName()+"]");
            int start=result.size();
            targetProducts(ctx,p,paid,parts(paid),0,new JsonArray(),result,desc,limit);
            for(int i=start;i<result.size();i++){
                JsonObject row=result.get(i).action;
                row.addProperty("key",str(row,"key","")+"/cost:"+ctx.external(card));
            }
        }
    }
    static List<Choice> candidates(Context ctx,Player p){`);
  replace('action.put("paidCards",paidCards);', `action.put("paidCards",paidCards);
                if(forced!=null){
                    action.put("declaredX",num(forced.action,"x",-1));
                    List<String> targetNames=new ArrayList<>();
                    for(JsonElement group:forced.action.has("targets")?forced.action.getAsJsonArray("targets"):new JsonArray())for(JsonElement reference:group.getAsJsonArray()){
                        String ref=reference.getAsString();
                        try{Object target=context.target(ref);targetNames.add(target instanceof GameEntity entity?entity.getName():ref);}
                        catch(RuntimeException ignored){targetNames.add(ref);}
                    }
                    action.put("targetNames",targetNames);
                }`);
  replace('        @Override public boolean playChosenSpellAbility', `
        @Override public void orderAndPlaySimultaneousSa(List<SpellAbility> abilities){
            if(abilities.size()==1){
                SpellAbility sa=abilities.get(0);
                String name=sa.getHostCard().getName();
                if(sa.isTrigger()&&sa.usesTargeting()&&(name.equals("Badgermole Cub")||name.equals("Alpha Deathclaw")||name.equals("Terastodon"))){
                    List<Card> targets=new ArrayList<>();
                    for(Card c:context.game.getCardsIn(ZoneType.Battlefield)){
                        if(name.equals("Badgermole Cub")&&(!c.isLand()||c.getController()!=actor))continue;
                        if(name.equals("Terastodon")&&c.isCreature())continue;
                        if(c.canBeTargetedBy(sa))targets.add(c);
                    }
                    List<Card> chosen=searchEffectChoice(targets,sa,name.equals("Terastodon")?0:1,name.equals("Terastodon")?3:1);
                    if(chosen!=null){
                        sa.getTargets().clear();
                        for(Card card:chosen)sa.getTargets().add(card);
                        ComputerUtil.playStack(sa,actor,context.game);
                        return;
                    }
                }
            }
            super.orderAndPlaySimultaneousSa(abilities);
        }
        @Override public boolean playChosenSpellAbility`);
  replace('min<0||max>2||max<min','min<0||max>3||max<min');
  replace('if(max==2)for(int i=0;i<cards.size();i++)for(int j=i+1;j<cards.size();j++)picks.add(List.of(cards.get(i),cards.get(j)));', `
            if(max>=2)for(int i=0;i<cards.size();i++)for(int j=i+1;j<cards.size();j++){
                if(min<=2)picks.add(List.of(cards.get(i),cards.get(j)));
                if(max==3)for(int k=j+1;k<cards.size();k++)picks.add(List.of(cards.get(i),cards.get(j),cards.get(k)));
            }`);
  replace('        if(root.has("impending")){', `
        if(root.has("earthbend"))for(JsonElement entry:root.getAsJsonArray("earthbend")){
            JsonObject state=entry.getAsJsonObject();
            Card card=(Card)c.target("c:"+num(state,"id",-1));
            require(card.isLand(),"Earthbend fixture must target a land");
            var effect=forge.game.ability.AbilityFactory.getAbility("DB$ Earthbend | Num$ "+num(state,"counters",1),card);
            effect.setActivatingPlayer(card.getController());effect.getTargets().add(card);
            forge.game.ability.AbilityUtils.resolve(effect);
            c.game.getAction().checkStaticAbilities();
            require(card.isCreature(),"Earthbend was not restored");
        }
        if(root.has("impending")){`);
  return source;
}

class ElvesForgeClient extends ForgeClient {
  constructor(options) {
    super(options);
    const build=createHash('sha256').update(readFileSync(worker)).update(readFileSync(__filename)).digest('hex');
    this.classes=path.join(this.classes,build.slice(0,16));
  }

  async compile() {
    const source = extend(await fs.readFile(worker,'utf8'));
    const digest = createHash('sha256').update(source).digest('hex');
    const stamp = path.join(this.classes,'source.sha256');
    await fs.mkdir(this.classes,{recursive:true});
    if (await fs.readFile(stamp,'utf8').catch(()=>'') === digest) return;
    const file = path.join(this.classes,'EngineWorker.java');
    await fs.writeFile(file,source);
    try {
      await execute(this.javac,['-encoding','UTF-8','-cp',this.jar,'-d',this.classes,file],{windowsHide:true,timeout:60000});
    } catch(e) {
      throw Error(String(e.stderr || e.message));
    }
    await fs.writeFile(stamp,digest);
  }
}

module.exports = {ElvesForgeClient};
