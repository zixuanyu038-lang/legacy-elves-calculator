# 薪传 Elves 斩杀计算器

输入己方手牌、战场与目标血量，从己方战斗前主阶段的空堆叠开始。计算器用 Forge 枚举合法动作、搜索赢法，并重放找到的路线。页面会显示牌张选择、法术力支付、重置目标和战斗伤害。

使用 [Deck - Elves.txt](Deck%20-%20Elves.txt) 里的固定牌表。可以填入指定的对手手牌、阻挡者和互动牌，也可以关闭对手，单独练习产费和斩杀。

## Windows 启动

1. 使用 Windows x64 和 Node.js 20 或更新版本。克隆仓库或下载 ZIP 解压。
2. 双击 **安装Forge.cmd**。首次下载约 488 MB，分别是 Forge 2.0.15 和 Temurin JDK 17 的官方归档。安装脚本会核对 SHA-256，并解压到当前用户的本地应用数据目录。已经装过同版本 Studio 便携运行时，可以直接开始下一步。
3. 双击 **启动计算器.cmd**，或在仓库目录执行 `node calculator.cjs`。
4. 打开 [本机计算器](http://127.0.0.1:8794/)。第一次可载入「T2 地御 Cradle 斩杀」，点击「搜索赢法」。

端口冲突时，可在 PowerShell 运行

```powershell
$env:ELVES_PORT = '8795'
node calculator.cjs
```

此时浏览器地址为 `http://127.0.0.1:8795/`。如果手动给安装脚本指定了 `-RuntimeDir`，启动前把 `ENDSTEP_FORGE_RUNTIME` 设为相同目录。

## 怎么读结果

- **当回合斩杀**或**后续回合赢法**表示 Forge 重放了该路线并判定己方获胜。未来摸牌取决于固定库序。示例中的组合公式也会引导部分分支的展开。
- **本轮未找到斩杀**时，页面显示搜索中对手到过的最低血量。有压血路线时，会重放并列出步骤。该路线按对手血量挑选。
- **加入对手**会按填入的手牌和战场计算。对手手牌仍按指定牌张处理，战斗声明由 Forge 策略执行。

牌名用英文，每行一张。同名牌可写 `2 Forest`。战场状态可写成 `Gaea's Cradle | 地御:1`、`Llanowar Elves | 失调` 或 `Quirion Ranger | 已用`。页面可下载当前结果的 JSON 搜索日志。

## 复现

运行 `node crosscheck.cjs`，可逐步核对 Cub 地御、重置产费、苗地和 Hoof 的组合动作。录屏用的牌局与口播见 [视频拍摄脚本](VIDEO.md)。

Forge 规则引擎来自 [Card-Forge/forge](https://github.com/Card-Forge/forge)。`runtime/` 中的 Java 执行器和 Node 客户端来自 [Endstep Studio 的 0.4.14 提交](https://github.com/zixuanyu038-lang/end_step_reader_pro/tree/062948a57e45d2b48d58a5c6e9e002808b6c74bd)，本项目通过 `forge-adapter.cjs` 加入 Elves 的牌张选择和产费处理。
