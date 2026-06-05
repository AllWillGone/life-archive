# LifeArchive

A Mnemosyne-inspired autobiographical memory system for AI-assisted reflection.

LifeArchive 是一个自传式记忆系统开源模板，用来长期记录使用者自己的经历、关系、情绪变化和人生线索。它保留了「记忆女神 Mnemosyne」的意象，但使用更直白、容易搜索的项目名。

本仓库只提供规则、目录结构和示例，不应保存真实个人记忆。真正使用时，建议复制为私人仓库；公开分享时，只发布模板或经过彻底清理的版本。

使用方式：

- `summary/` 用来快速同步整体情况。
- `fact/` 按完整事件记录事实，以事件开始时间和事件名排序。
- `feeling/` 记录使用者对同一事件在不同时间节点的情绪、看法和变化。
- `session/` 只保存每次对话后的记忆更新摘要，不保存完整聊天记录。
- `support/` 保存对话中产生的建议、行动提醒和支持性分析，不作为自传事实或情绪底层记录。
- `inbox/` 暂存暂时无法归档的事实碎片、关系线索或事件线索。
- `archive/` 保存旧格式、废弃内容或迁移前备份。

未来 agent 进入本目录工作时，应先阅读 `AGENTS.md`，再按摘要到细节的顺序读取记忆。

## 新对话启动提示词

每次重新开启对话时，可以先发送。请把 `<你的 LifeArchive 路径>` 替换成实际路径；如果 agent 已经在仓库目录中工作，也可以直接写“本仓库的 AGENTS.md”。

```text
请先按 <你的 LifeArchive 路径>\AGENTS.md 读取我的记忆系统，然后像平常一样优先和我聊天、分析和回应我。记忆维护不要压过正常回应：当对话中出现新的事实、情绪变化、关系线索或事件线索时，在本轮中按规则安静更新 <你的 LifeArchive 路径> 下的记忆文件；能归入完整事件的写入对应事件，暂时无法准确归档的先写入 inbox。agent 主动给出的建议、行动提醒或支持性分析默认不要写入 feeling，若需要长期保留，应写入 support。默认不要在回复结尾主动汇报“已记录”或“已更新”，除非我明确询问、更新涉及重要结构变化，或本轮任务本身就是整理记忆。若需要说明更新情况，必须先确认文件实际写入成功，不能凭计划或印象声称已经更新。
```

## 周期整理提示词

每隔一段时间，或发现索引、排序、摘要开始变乱时，可以发送：

```text
请按 <你的 LifeArchive 路径>\AGENTS.md 读取并整理我的自传式记忆系统。这次任务是周期整理，不是普通聊天；但仍要遵守对话优先、真实性、写入确认、底层记忆保护和事实/情绪分离规则。fact/ 和 feeling/ 里的既有内容是我的底层记忆，我通常不会再完整复述；整理时不要为了压缩、润色或概括而删除、弱化、替换、改写已有事实、细节、情绪和原始表述。原则上只做时间顺序调整、原文搬移、补链接、补日期标注和少量必要语言串联；不确定能否删改时，先保留并询问我。

请先只审计，不要写入。按推荐读取顺序检查：summary/overview.md、summary/current.md、summary/timeline.md、fact/index.md、相关 fact/events/、feeling/index.md、相关 feeling/by_event/、summary/people.md、summary/topics.md、support/index.md、相关 support/by_event/、inbox/unresolved.md，以及最近的 session 文件。

重点检查并提出方案：
1. fact 与 feeling 是否混写；是否有事实应迁移到 fact，情绪和看法变化应迁移到 feeling。
2. fact/events 是否按完整事件、关系阶段或人生阶段组织；是否有重复事件、过碎事件、该合并的小事，或聚合事件已经可以拆分。
3. fact/index.md、feeling/index.md、summary/timeline.md 和事件内 ## 时间线 是否按事件开始时间或条目发生时间排序；回溯补充的信息是否被错误追加到末尾。
4. 修改过的 fact/events 和 feeling/by_event 文件内“最近更新”是否滞后。
5. summary/current.md 是否过长、过细或像事件合集；过期内容是否应沉淀到事件文件和 summary/timeline.md。
6. summary/overview.md、summary/people.md、summary/topics.md 是否需要补充、压缩、去重或修正链接。
7. inbox/unresolved.md 中是否有碎片已经可以归档；是否有不确定信息应该转入对应事件的“不确定或待澄清”部分。
8. support/ 是否只保存建议、行动提醒和支持性分析；是否有内容应迁回 feeling 的“需要或愿望”，或有建议仍误留在 fact/feeling/summary 中。
9. session 文件是否只记录本次对话后的记忆更新摘要，没有保存完整聊天记录；是否需要为本次整理创建或更新当天 session 摘要。
10. 链接、文件名、日期精度、真实姓名、推测/不确定标注和 UTF-8 读写是否一致。

输出时先给我一个简短整理方案：列出建议修改的文件、每类问题的处理办法、是否有需要我确认的拆分/合并/删除/归档决定。等我确认后，再实际写入文件。写入完成后，必须基于实际成功的文件操作简短说明更新了哪些文件；如果有任何写入失败或不确定，明确说明尚未写入成功。
```

## 开源与隐私提醒

LifeArchive 面向真实、长期、细节化的自传式记录。填充后的个人记忆仓库可能包含姓名、地点、关系、情绪、会话摘要和 Git 历史中的旧版本信息。不要直接公开真实记忆仓库；公开时应使用本模板或经过彻底清理的新仓库。

## License

MIT License. See `LICENSE`.
