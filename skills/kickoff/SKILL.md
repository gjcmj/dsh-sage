---
name: kickoff
description: 项目立项：把 inputs 资料整理成章程草案（四种标记），逐条确认后定稿，并据此写方案期 AGENTS.md；可脱离插件独立使用。
whenToUse: 用户要开新项目、整理需求资料、写项目章程/AGENTS.md，或说 kickoff、立项、章程、项目规则。
---

# kickoff（立项）

你是立项主持人：把资料整理成「可确认的结构」，把材料能回答的和必须人拍板的分开。不写 PRD、不做调研、不写代码。

> 模板在插件包的 assets/project/（仓库内为 <repo>/assets/project/）。本 skill 不复制模板正文——模板是判据字段的唯一真源。

## 步骤（顺序固定）

### 1. 清点资料
- 读 inputs/ 下所有资料（docx/pdf/md 先抽取到 research/sources/），只读，不改不删。
- 写 research/00-资料理解与基线.md：每份资料一段摘要 + 出处；开头写「内部资料只读、不外发」。
- 缺件或对不上，先报缺，不猜。

### 2. 起草章程（草案）
- 以 assets/project/KICKOFF-DRAFT.md 为骨架，写 tasks/00-kickoff-draft.md。
- 每条结论带标记：【材料事实】有出处、【推断】有依据待确认、【待确认】资料无法回答、【冲突】材料矛盾。
- 不要把推断写成事实。

### 3. 逐条确认
- 把草案里的【待确认】/【冲突】列成问题，用 ask_user_question 一次 1–3 个，给推荐选项。
- 用户答过的记 decisions.md（编号/日期/决策/依据/状态=已确认）；说「不确定 / 按推荐」则记为显式假设，不编造。

### 4. 定稿章程
- 以 assets/project/KICKOFF.md 为骨架写 tasks/00-kickoff.md。
- 头部必须有：确认日期（YYYY-MM-DD）、确认方式。
- 必须有「拍板人：」；明确不做 / 非目标至少 3 条。
- 正文不再残留【待确认】/【冲突】标记（都已回答或转假设）。

### 5. 写方案期 AGENTS.md
- 以 assets/project/AGENTS-SOLUTION.md 为骨架写 AGENTS.md（方案版）。
- 头部：版本、生效日期、依据指向 tasks/00-kickoff.md + decisions.md。
- 七块：项目定位 / 边界 / 当前阶段 / 硬约束 / 证据 / 门禁 / 冲突优先级。
- 不写「开发期」标记；开发版在进入开发前单独切换。

## 交付与自检

- 交付：tasks/00-kickoff-draft.md、tasks/00-kickoff.md、AGENTS.md、decisions.md 追加、基线报告。
- 自检：每份资料有出处？四种标记齐？待确认都收口？确认日期/方式/拍板人/非目标齐？AGENTS 七块齐且依据指向章程？
- 本 skill 可脱离插件独立使用：没有插件时，按上面的交付与自检执行即可。
- 装了插件时，插件用同一套字段做覆盖检查；装不上也照样能靠自检交付。
