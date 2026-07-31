# 周期审计（maintenance-5）

[English](README.md) | 简体中文

`maintenance/` 用于检查私人 LifeArchive 副本中的结构问题、语义边界、过期索引和待归档内容。它把“发现问题”与“修改记忆”分开：审计只生成精确建议，是否执行以及如何执行由使用者逐项决定。

maintenance-5 采用“轻量审计、严格执行”模式：

- 可以只审计一篇、多篇、所有已变化文档或完整配置范围。
- 默认只显示真正的修改建议，并提供精确的修改前、修改后和少量上下文。
- 使用者可以逐项批准、拒绝、延期，也可以新增、删除或替换操作。
- 哈希只在后台用于检测内容漂移并把决定绑定到同一项操作，不要求使用者阅读或手工核对。
- 写入前统一预检所有获批目标和必要依赖；任一冲突都会在首个目标写入前停止整批执行。

## 首次使用

把公开模板复制到新的私人目录或私有仓库。不要在仍连接公开远端的 clone 或 fork 中填写私人记忆，也不要复制其他记忆库生成的审计状态。

在私人副本中初始化一次：

```powershell
node maintenance/.system/audit.mjs init
```

该命令只扫描配置中的系统文件和记忆目录，创建本地 maintenance-5 `baseline.json`，并拒绝覆盖已有基线、运行或提议。也可以指定本地标识：

```powershell
node maintenance/.system/audit.mjs init --id BL5-my-private-copy
```

## 文件职责与隐私

- `.system/rules.json`：审计范围、允许写入范围和语义策略版本。
- `.system/core.mjs`：扫描、依赖、预览、哈希、路径和原子写入能力。
- `.system/audit.mjs`：命令行流程入口。
- `baseline.json`：每份文档最近一次已完成审计的内容状态、时间、策略版本和必要依赖。
- `run/state.json`：当前可续跑审计的进度；没有活动审计时不存在。
- `proposal.json`：正式提议、决定和执行回执的权威数据。
- `proposal.md`：可重新生成的人类视图；直接编辑它不会修改正式提议。
- `proposals/`：已关闭、失效和被修订的提议版本。
- `.system/recovery/`：执行写入期间临时使用的恢复材料。

所有生成状态都必须保持私有。不要公开 `baseline.json`、`run/`、`proposal.json`、`proposal.md`、`proposals/`、迁移产生的 `.previous` 备份、锁或恢复材料。

审计器实现本身不计入自传式记忆范围。`AGENTS.md` 或语义规则变化会改变策略指纹；只修改实现不会强迫全部记忆文档重新审计。

## 推荐流程

### 1. 查看状态

```powershell
node maintenance/.system/audit.mjs status
node maintenance/.system/audit.mjs validate
```

`validate` 只报告已变化或被依赖变化影响的路径：

- `VALID`：没有尚未审计的变化。
- `DRIFT`：文档被新增、修改、删除，或必要依赖已失效。
- `POLICY_STALE`：语义审计策略已变化。

### 2. 预览范围

单篇文档：

```powershell
node maintenance/.system/audit.mjs scope --path fact/events/example.md
```

多篇文档：

```powershell
node maintenance/.system/audit.mjs scope --path fact/events/a.md --path feeling/by_event/a.md
```

也可以使用每行一个路径的 UTF-8 文本文件，或 JSON 字符串数组：

```powershell
node maintenance/.system/audit.mjs scope --paths-file audit-paths.txt
```

`scope` 会列出目标和只读依赖，并说明每项依赖的原因及其服务的目标。相关的 fact/feeling 配对、必要索引、人物索引和一跳链接会按需纳入。依赖不会自动成为写入目标。

### 3. 启动审计

只审计指定文档：

```powershell
node maintenance/.system/audit.mjs start --path fact/events/a.md --path feeling/by_event/a.md
```

审计所有当前已变化文档：

```powershell
node maintenance/.system/audit.mjs start
```

审计完整配置范围：

```powershell
node maintenance/.system/audit.mjs start --mode full
```

无参数默认是“已变化文档”，不是全量审计。显式路径也可以指定没有变化的文档，用于主动复核。

### 4. 保存进度

完整读取当前单元的目标和必要依赖后，写一个简短的检查点输入：

```json
{
  "run_id": "audit-20260731220000",
  "unit_id": "document:fact/events/a.md",
  "status": "completed",
  "summary": "已核对事件、对应情绪和索引链接。",
  "findings": []
}
```

```powershell
node maintenance/.system/audit.mjs checkpoint --file checkpoint.json
```

尚未完成时使用 `status: "partial"`，并提供 `next_exact_read` 和 `stop_reason`。maintenance-5 不再要求手工 EOF 证明、检查点哈希链或事务代次；发布提议时会自动重新核对目标内容。

### 5. 发布精确建议

没有修改建议时可以发布空操作列表：

```json
{
  "proposal_id": "P007",
  "operations": []
}
```

这只会把本轮目标标记为已审计且无需修改，不会把同时发生的其他工作区变化吸收到基线。

有建议时，优先使用能够表达修改的最小操作：

```json
{
  "proposal_id": "P007",
  "operations": [
    {
      "operation_id": "O1",
      "type": "replace_exact_block",
      "path": "summary/current.md",
      "old_text": "现有的精确文本",
      "new_text": "建议替换后的文本",
      "reason": "当前摘要已经与底层记录不一致。",
      "effect": "只修正这一处摘要。",
      "preserves": "其余段落保持不变。",
      "risk": "低；需要确认新表达没有扩大原意。",
      "recommendation": "建议执行此操作。"
    }
  ]
}
```

```powershell
node maintenance/.system/audit.mjs publish --file proposal-draft.json
```

支持 `replace_exact_block`、`replace_file`、`create_file`、`delete_file` 和 `move_file`。系统会封装精确修改前内容、预期结果、目标前置状态、预览和必要依赖。

### 6. 查看修改前与修改后

`proposal.md` 先显示完整操作索引，再默认只展开 `suggested: true` 的操作。每项建议会显示操作类型、路径、精确修改前后和少量上下文；没有建议的文档和只读依赖不会被整篇铺开。

```powershell
node maintenance/.system/audit.mjs show --operation O1
node maintenance/.system/audit.mjs show --path summary/current.md
node maintenance/.system/audit.mjs show --pending
node maintenance/.system/audit.mjs show --all
node maintenance/.system/audit.mjs show --operation O1 --expanded
```

`--operation` 和 `--path` 可以重复。Markdown 视图缺失或被编辑时，`show` 会根据 `proposal.json` 重新生成。

### 7. 自定义提议

使用者可以保留、删除、替换或新增操作，而不必在整份提议的全部接受与全部拒绝之间选择。修订也可以改变目标路径或操作类型：

```json
{
  "proposal_id": "P007",
  "from_version": 1,
  "user_words": "保留 O2，用我的表达替换 O1，并删除 O3。",
  "changes": [
    {
      "action": "replace",
      "operation_id": "O1",
      "operation": {
        "type": "replace_exact_block",
        "path": "summary/current.md",
        "old_text": "现有的精确文本",
        "new_text": "使用者确认后的文本",
        "reason": "采用使用者确认的表达。",
        "effect": "只修改指定片段。",
        "preserves": "其他内容不变。",
        "risk": "低。",
        "recommendation": "采用此版本。"
      }
    },
    { "action": "remove", "operation_id": "O3" }
  ]
}
```

```powershell
node maintenance/.system/audit.mjs revise --file revision.json
```

已执行操作不可修订。未变化操作的有效决定会保留；新增或改变的操作恢复为待决定。

### 8. 决定与执行

决定文件必须列出精确操作编号：

```json
{
  "proposal_id": "P007",
  "version": 2,
  "user_words": "批准 O1，拒绝 O2，延期 O4。",
  "approved": ["O1"],
  "rejected": ["O2"],
  "deferred": ["O4"]
}
```

```powershell
node maintenance/.system/audit.mjs decision --file decision.json
node maintenance/.system/audit.mjs apply
```

决定可以分批提交。系统只识别明确列出的操作编号，不会从模糊自然语言中推断授权。

## 执行边界

`checkpoint`、`publish`、`show`、`revise` 和 `decision` 只修改维护状态。只有 `apply` 可以修改记忆文档。

写入前，`apply` 会统一核验全部获批操作：

- 获批操作仍与使用者决定时的内容一致。
- 每个目标仍处于审计时的修改前状态；恢复中断回执时，也允许目标已经处于精确预期结果。
- 必要配对、索引和直接链接依赖没有变化。
- 语义策略没有变化，路径位于允许写入范围内，且不穿过符号链接。
- 同一文件上的多项精确片段替换按固定顺序组合，并只写入一次。

无关工作区变化不会阻塞局部操作，也不会被悄悄加入本轮基线。任一目标、依赖或策略冲突都会在第一项写入前停止整批操作。使用 `refresh` 重新观察当前范围：

```powershell
node maintenance/.system/audit.mjs refresh
```

原子替换和临时恢复材料使 `apply` 在中断后能够续跑，而不会重复执行已经完成的写入。

## 从 maintenance-4 迁移

仅当私人副本仍使用 schema 4 基线且没有活动 maintenance-4 run 时执行：

```powershell
node maintenance/.system/audit.mjs migrate-v4
```

迁移会复用已有的已审计文件状态，不会把重新扫描记忆正文伪装成已完成审计。它保留待处理项并归档旧提议历史，但不会把无法可靠重建精确修改前状态的旧操作变成可执行的 maintenance-5 操作。原状态保存在本地 `.previous` 备份中，并继续保持私有。
