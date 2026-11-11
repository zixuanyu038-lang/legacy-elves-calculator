# 薪传 Elves 斩杀计算器

填入手牌、战场和对手血量，计算器从己方战斗前主阶段的空堆叠开始，用 Forge 搜索合法操作。找到赢法后会重放路线，列出法术力从哪来、异能重置了谁、找了哪张牌，以及每只攻击生物打了多少。

**[下载带卡图的斩杀手册（Word）](docs/legacy-elves-combo-handbook.docx?raw=1)** · [查看 60＋15 牌表](Deck%20-%20Elves.txt)

手册包括单卡分析和八组组合，涵盖 Cub 地御苗地、Ranger 与共生虫连续重置、剑齿虎循环产费，以及 Order、绿阳和 Hoof 的斩杀路线。

## Windows 启动

1. 准备 Windows x64 和 Node.js 20 或更新版本。克隆仓库，或从 GitHub 的 **Code → Download ZIP** 下载并解压。
2. 双击 **安装Forge.cmd**。首次下载约 488 MB，包括 Forge 2.0.15 和 Temurin JDK 17。脚本会核对 SHA-256，再解压到本地应用数据目录。已有同版本 Studio 便携运行时可直接开始下一步。
3. 双击 **启动计算器.cmd**，或在仓库目录执行 `node calculator.cjs`。
4. 浏览器打开 `http://127.0.0.1:8794/`。在「载入示例」中选「T2 地御 Cradle 斩杀」，点「搜索赢法」。

端口被占用时，可在 PowerShell 里改用 `8795`，然后用浏览器打开 `http://127.0.0.1:8795/`。

```powershell
$env:ELVES_PORT = '8795'
node calculator.cjs
```

如果安装 Forge 时通过 `-RuntimeDir` 指定了运行时目录，启动前把 `ENDSTEP_FORGE_RUNTIME` 设为同一个目录。

## 跑一遍实测局面

用库序种子 **2488**、**1 个进程**，关闭「加入对手」。T2 示例用默认预算 **2,800 次**、深度 **16**。Natural Order 示例用预算 **420 次**、深度 **32**。

| 示例 | 目标和搜索范围 | Forge 重放结果 |
|---|---|---|
| T2 地御 Cradle 斩杀 | 20 血，当回合斩杀 | Forest 和 Llanowar Elves 付 Cub，搜索选中地御苗地。苗地、Llanowar Elves、Hoof 共打 22 点 |
| Natural Order 斩杀 | 20 血，当回合斩杀 | Order 找 Hoof，战斗打 24 点 |
| Natural Order 斩杀 | 25 血，当回合斩杀 | 打到 1 血，页面显示「本轮未找到斩杀」并列出操作 |
| Natural Order 斩杀 | 25 血，再搜一个己方回合 | T3 打到 1 血，T4 摸到 Cub、地御苗地，再打 9 点 |

想逐条校验手册里的核心互动，可运行 `node crosscheck.cjs`，复现 15 项 Forge 检查。

## 输入自己的局面

「己方套牌」默认选中内置的薪传妖精 60＋15。点「添加套牌」，粘贴每行「数量 英文牌名」的牌表。备牌写在 `Sideboard` 下，或在常见的 60 张主牌之后空一行。主牌支持 60–120 张，备牌最多 15 张。

Forge 会检查牌名、主备牌合计的同名牌数量和主牌的生物类别。妖精生物须至少 12 张，且占主牌生物至少一半。通过的牌表保存在当前浏览器，随时可切换回内置套牌。载入示例会选回内置套牌。

牌名用英文，每行一张。同名牌可写 `2 Forest`。战场状态可写成 `Gaea's Cradle | 地御:1`、`Llanowar Elves | 失调` 或 `Quirion Ranger | 已用`。需要模拟阻挡或互动时，勾选「加入对手」，填上已知手牌和战场。

- **找到赢法**时，页面展示 Forge 已重放的获胜路线。后续回合的摸牌由库序种子决定。
- **本轮未找到斩杀**时，页面展示这次搜索打到的最低血量。有压血路线时，也会列出对应的操作。
- **加入对手**时，搜索按所填手牌与战场进行，战斗声明由 Forge 策略执行。

结果区可把当前选中的路线导出为 `.esreplay`，用 Endstep Studio 打开即可逐步查看。回放从你输入的局面开始。打到一半的路线会导出为推演片段。需要核对搜索过程时，可另行下载 JSON 搜索日志。

## 规则引擎

规则引擎来自 [Card-Forge/forge](https://github.com/Card-Forge/forge)。Java 执行器和 Node 客户端来自 [Endstep Studio 0.4.14](https://github.com/zixuanyu038-lang/end_step_reader_pro/tree/062948a57e45d2b48d58a5c6e9e002808b6c74bd)。`forge-adapter.cjs` 加入了 Elves 的找牌选择、产费和重置互动。

双击 **自检Forge.cmd**，或运行 `npm run forge:self-test`。自检会启动计算器使用的 Forge 适配器，验证 Cub 地御苗地和额外产绿，以及 Natural Order 的费用和战斗斩杀。

手动更新时，从 Forge 的正式发布页下载 `forge-installer-版本.tar.bz2`，拖到 **更新Forge.cmd**，或运行 `npm run forge:update -- install "安装包路径"`。脚本会联网核对官方 SHA-256，并在独立目录通过上述自检后记录新版本。下次启动计算器时生效。回到默认版本可运行 `npm run forge:update -- rollback`，再重启计算器。 [Forge 正式版下载](https://github.com/Card-Forge/forge/releases/latest)
