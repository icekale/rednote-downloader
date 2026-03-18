import fs from 'node:fs';
import path from 'node:path';

const agentsPath = '/Users/kale/.openclaw/workspace-bfxia/AGENTS.md';
const toolsPath = '/Users/kale/.openclaw/workspace-bfxia/TOOLS.md';
const skillDir = '/Users/kale/.openclaw/workspace-bfxia/skills/rednote-telegram';
const skillPath = path.join(skillDir, 'SKILL.md');

const toolPrioritiesSection = `## Tool Priorities
- 在 Telegram 会话里，如果用户发来小红书链接、xhslink，或整段分享文案，优先处理媒体解析，不要先手动解释或复述链接内容。
- 处理小红书链接时，不要先读 agent-reach，也不要先用 \`web_fetch\` 总结正文；优先走本地 RedNote 技能。
- 如果 \`rednote.resolve_rednote_media\` 作为直接工具可用，就直接调用它；如果不可用，就立刻改用 \`exec\` 执行 mcporter 的 rednote 命令。
- 工具成功时，优先把结果直接发回 Telegram；工具失败时，再用简短中文解释原因并给出下一步建议。
`;

const rednoteToolsSection = `## RedNote / Xiaohongshu

- 当用户发来小红书链接、xhslink 链接，或整段分享文案时，优先走 RedNote 本地技能，不要先用 \`web_fetch\` 或 agent-reach 总结帖子。
- 首选直接工具：\`rednote.resolve_rednote_media\`。
- 如果直接工具不可用，立刻改用 \`exec\` 执行：
  \`~/.openclaw/npm-global/bin/mcporter call 'rednote.resolve_rednote_media(input: "...原始用户输入...")'\`
- 解析成功后，优先直接复制工具结果里的 \`telegramReply\` 块，整段原样输出，不要自己改写。
- Telegram 回复里使用 OpenClaw 原生媒体格式：
  第一行放 \`[[reply_to_current]]\`
  如果要带说明文字，保持一两行以内
  每个媒体单独一行：\`MEDIA:https://ci.xiaohongshu.com/...\`
- 有图片或视频时，以“直接回发媒体”为第一选择，不要只回文字说明。
- 如果有多个媒体 URL，也应一次性都发出，不要只挑第一张。
- 不要优先使用 \`http://127.0.0.1:3000/api/media?... \` 这种本地代理链给 Telegram，它更适合浏览器预览，不适合 Telegram agent 回发。
- 工具成功后绝对不要空回复；如果看到了 \`telegramReply\`，就把它作为你的整个最终答案。
- 如果工具失败，再用简短中文解释失败原因，并提醒用户补 Cookie、换公开可访问链接，或稍后重试。
- 当前本地服务地址默认是 \`http://127.0.0.1:3000\`。
`;

const rednoteSkill = `---
name: rednote-telegram
description: >
  Telegram 小红书媒体回传专用技能。用户发来小红书链接、xhslink 链接、整段分享文案，
  或明确要“看图/发图/发视频/下载无水印”时使用。优先级高于通用网页/agent-reach 技能。
  Triggers: "小红书", "xhslink", "复制后打开【小红书】查看笔记", "发图", "发视频",
  "无水印", "下载小红书", "RedNote".
---

# RedNote Telegram Reply Flow

这是一条高优先级技能。只要用户发来的是小红书 / xhslink 内容，就先用这条，不要先读 agent-reach。

## Rules

1. 不要先用 \`web_fetch\`、不要先总结帖子内容、不要先闲聊。
2. 先尝试直接工具 \`rednote.resolve_rednote_media\`。
3. 如果直接工具不可见或不可用，立刻改用 \`exec\`：

\`\`\`bash
~/.openclaw/npm-global/bin/mcporter call 'rednote.resolve_rednote_media(input: "...原始用户输入...")'
\`\`\`

4. 如果命令成功并返回 \`telegramReply\` 或 \`mediaUrls:\`，优先直接复制 \`telegramReply\` 作为 Telegram 回复。
5. Telegram 回复格式必须优先用：

\`\`\`text
[[reply_to_current]]
给你发回来啦
MEDIA:https://ci.xiaohongshu.com/...
MEDIA:https://sns-video-bd.xhscdn.com/...
\`\`\`

6. 有媒体时，不要只发文字说明。
7. 不要把原始小红书页面链接重复贴很多次；只保留一小段说明文字即可。
8. 如果失败，再简短说明失败原因，例如 Cookie 不足、帖子不可访问、媒体未暴露。
9. 只要工具已经成功返回媒体，就不要空回复；最差也要把上面的 \`[[reply_to_current]] + MEDIA:\` 格式发出去。

## Notes

- \`MEDIA:\` 必须一行一个，OpenClaw 会自动按媒体消息发到 Telegram。
- \`MEDIA:\` 后面应优先使用工具返回的外部直链，例如 \`https://ci.xiaohongshu.com/...\`。
- 如果只有一个媒体，也照样使用 \`MEDIA:\`。
- 如果用户明确要文案，再额外补一小段文字；默认以回媒体为先。
- 工具结果里如果已经给出 \`telegramReply\`，直接原样输出，不要再组织别的内容。
`;

function updateAgents(content) {
  const marker = '## Files\n- `SOUL.md`: 角色定义与说话风格\n';
  if (!content.includes(marker)) {
    throw new Error('Unable to find insertion point in AGENTS.md');
  }

  if (!content.includes('## Tool Priorities')) {
    return content.replace(marker, `${marker}\n${toolPrioritiesSection}`);
  }

  const startMarker = '## Tool Priorities\n';
  const startIndex = content.indexOf(startMarker);
  const afterStart = content.slice(startIndex + startMarker.length);
  const nextSectionIndex = afterStart.indexOf('\n## ');
  const endIndex = nextSectionIndex === -1
    ? content.length
    : startIndex + startMarker.length + nextSectionIndex;

  return content.slice(0, startIndex) + toolPrioritiesSection + content.slice(endIndex);
}

function updateTools(content) {
  const startMarker = '## RedNote / Xiaohongshu\n';
  const startIndex = content.indexOf(startMarker);
  if (startIndex === -1) {
    return `${content.trimEnd()}\n\n${rednoteToolsSection}`;
  }

  const afterStart = content.slice(startIndex + startMarker.length);
  const nextSectionIndex = afterStart.indexOf('\n## ');
  const endIndex = nextSectionIndex === -1
    ? content.length
    : startIndex + startMarker.length + nextSectionIndex;

  return content.slice(0, startIndex) + rednoteToolsSection + content.slice(endIndex);
}

const updatedAgents = updateAgents(fs.readFileSync(agentsPath, 'utf8'));
const updatedTools = updateTools(fs.readFileSync(toolsPath, 'utf8'));

fs.writeFileSync(agentsPath, updatedAgents);
fs.writeFileSync(toolsPath, updatedTools);
fs.mkdirSync(skillDir, { recursive: true });
fs.writeFileSync(skillPath, rednoteSkill);
