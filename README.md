# Sage · dsh-expert-sage

> **新项目从立项到 PRD，再交给开发流水线的一条通用工作流插件。**
> 在 [expert-team](https://github.com/yangdcm/dsh-expert-team) 的 12 角色 / 9 阶段交付引擎之上，补上 **kickoff → 发现 → PRD → 可选原型/技术方案** 这一段，并把流程、模板、设置、看板统一在一个插件里。

| 12 角色 | 9 阶段 | 99 个测试文件 | 0 运行时依赖 | 0 构建步骤 |
|---|---|---|---|---|

## 为什么要有 Sage

团队引擎解决「怎么把活干完」，但项目开始前还有三件事经常被跳过或做得很薄：

- **立项没对齐**：范围、边界、拍板人、非目标没写清，开发中反复返工；
- **调研不分项目**：不管有没有竞品、有没有合规要求，都套同一套模板；
- **PRD 写成检查表**：有章节但没有痛点、亮点、失败定义和可验收指标。

Sage 把这三件事变成**可配置的模板**，而不是写死在某一个项目里的规则。

## 一条默认工作流

```text
kickoff（章程草案/定稿 + 方案版 AGENTS）
   → discovery（按项目裁剪路线，无竞品不强制）
   → PRD（一个文件两态：草案对齐 → 人签定稿）
   → [可选] 原型 / 技术方案（只在 PRD 定稿后派生，须回指 PRD）
   → /team 开发（专家团 12 角色 / 9 阶段）
```

要点：

- **PRD 一个文件两种状态**：草案允许开放问题；定稿必须人签（记入 `decisions.md`）—— agent 不能自称定稿；
- **发现可裁剪**：internal / users / competitors / policy / tech-form / market，按项目需要选；
- **派生前置**：PRD 未定稿时，原型与技术方案不可用（不是灰按钮，是不出现）；
- **门禁默认只提示**：严格模式（设置里开）才在 PRD 未定稿时拒绝建 run / 拒绝写 `src/`；
- **模板是数据**：`workflow/base.yml` + 预设 `software` / `internal-platform` / `tool`；换项目只换预设，不改代码。

## 安装

```bash
# npm（发布后）
dsh plugin --profile <profile> add dsh-expert-sage

# 本地开发（link）
dsh plugin --profile <profile> add link:/path/to/dsh-sage
```

装完**重启一次 dsh**。`<profile>` 用你实际在跑的 profile（例如 `desktop` 或 `web`）。

## 快速上手

1. 切换到 Sage 的会话/插件视图；
2. 用 `/team` 起一个开发 run（沿用专家团流水线）；
3. 项目前期按 skill 走：`kickoff` → `discovery`（可选）→ `prd`；
4. 设置页「Sage」→「工作流」：选模板/预设、开关阶段、选发现路线、开严格模式。

## 统一看板与统一设置

- **一个视图**：项目条（PRD 草案/定稿徽标）+ 就绪度（维度覆盖 / 开放问题 / 亮点 / 冲突）+ 产物缺项 + 下方 run 阶段，同屏显示；
- **一处设置**：现有设置页里的「工作流」分组（8 项）；可选阶段开关留空 = 按预设；发现阶段由预设决定（不在设置里重复开关）；
- **优先级**：内置默认 ← 全局设置 ← 项目 `.sage/state.json`（项目优先）。

## 模板与预设

| 预设 | 发现路线 | 技术方案 | 原型 |
|---|---|---|---|
| `base` | internal + users | 关 | 关 |
| `software` | + tech-form | 关 | 关 |
| `internal-platform` | + policy | **开** | 关 |
| `tool` | 关闭发现 | 关 | 关 |

默认预设是 **`software`（通用软件）**：在「基础」的最小路线之上多一条「技术与形态」调研；`base`（通用最小）适合不需要技术形态调研的项目。设置页默认只显示 5 项常用设置，其余收在「高级设置」折叠里；发现阶段由预设决定（`tool` 预设才会跳过）。

模板骨架在 `assets/project/`（章程草案 / 章程 / 方案版 AGENTS / PRD / 原型 / 技术方案）。未知阶段、未知路线、引用了不存在的 skill 或产物键，一律**报错并列出合法值**，不静默降级。

## 引擎：12 角色 / 9 阶段

沿用 expert-team 的交付流水线（`clarify → research → design → spec-review → 方案确认 → implement → review → test → deliver`），角色含 pm / architect / researcher / ui / backend / frontend / dba / sec / reviewer / qa / devops / docs。

工件落在 `<工作区>/team/<run-id>/`；项目前期工件落在 `tasks/`、`research/`、`docs/`。

## 质量

- **99 个测试文件**（`npm run test:all`，零依赖、无需 `install`），含 **176 条变异目录**与多组棘轮；
- 门禁原则：结构问题机器查、质量问题人签；不把「覆盖」渲染成「质量通过」。

## 与 upstream 的关系

Sage 是 [expert-team](https://github.com/yangdcm/dsh-expert-team) 的 fork，保留其 MIT 许可与引擎设计；在其上新增项目前置工作流。上游引擎的缺陷修复会尽量回提 upstream。

## License

MIT
