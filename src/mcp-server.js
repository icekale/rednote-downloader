import process from 'node:process';

const SERVER_NAME = 'rednote-downloader';
const SERVER_VERSION = '0.2.17';
const DEFAULT_SERVICE_BASE_URL = process.env.REDNOTE_SERVICE_BASE_URL || 'http://127.0.0.1:3000';
const TOOL_NAME = process.env.REDNOTE_MCP_TOOL_NAME || 'resolve_rednote_media';

function sendMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function sendResult(id, result) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    result,
  });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });
}

function buildToolDefinition() {
  return {
    name: TOOL_NAME,
    description: 'Resolve RedNote/Xiaohongshu or X/Twitter media into a Telegram-ready text and mediaUrls payload.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'A Xiaohongshu share URL, xhslink URL, x.com/twitter.com URL, or the full share text.',
        },
        cookie: {
          type: 'string',
          description: 'Optional Cookie header to improve access success rate.',
        },
        serviceBaseUrl: {
          type: 'string',
          description: 'Optional override of the running rednote service base URL.',
        },
      },
      required: ['input'],
      additionalProperties: false,
    },
  };
}

async function resolveRednoteTool(args = {}) {
  const baseUrl = String(args.serviceBaseUrl || DEFAULT_SERVICE_BASE_URL).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/openclaw/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: args.input,
      cookie: args.cookie,
      serviceBaseUrl: baseUrl,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const message = data?.error || `Resolve request failed (${response.status})`;
    return {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: [
          data.openclaw.summary,
          '',
          'Telegram reply (paste verbatim):',
          data.openclaw.telegramReply,
          '',
          'mediaUrls:',
          ...(data.openclaw.mediaUrls || []),
        ].join('\n'),
      },
    ],
    structuredContent: data.openclaw,
    isError: false,
  };
}

async function handleRequest(message) {
  if (message.method === 'initialize') {
    sendResult(message.id, {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    });
    return;
  }

  if (message.method === 'notifications/initialized') {
    return;
  }

  if (message.method === 'tools/list') {
    sendResult(message.id, {
      tools: [buildToolDefinition()],
    });
    return;
  }

  if (message.method === 'tools/call') {
    const toolName = message.params?.name;
    if (toolName !== TOOL_NAME) {
      sendError(message.id, -32601, `Unknown tool: ${toolName}`);
      return;
    }

    const result = await resolveRednoteTool(message.params?.arguments || {});
    sendResult(message.id, result);
    return;
  }

  if (typeof message.id !== 'undefined') {
    sendError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

let buffer = Buffer.alloc(0);

function tryParseMessages() {
  while (buffer.length > 0) {
    const startsWithContentLength = /^Content-Length:/i.test(
      buffer.toString('utf8', 0, Math.min(buffer.length, 64)),
    );

    let raw;
    if (startsWithContentLength) {
      let separatorIndex = buffer.indexOf('\r\n\r\n');
      let separatorLength = 4;
      if (separatorIndex === -1) {
        separatorIndex = buffer.indexOf('\n\n');
        separatorLength = 2;
      }
      if (separatorIndex === -1) {
        return;
      }

      const header = buffer.slice(0, separatorIndex).toString('utf8');
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        buffer = buffer.slice(separatorIndex + separatorLength);
        continue;
      }

      const contentLength = Number.parseInt(lengthMatch[1], 10);
      const messageStart = separatorIndex + separatorLength;
      const messageEnd = messageStart + contentLength;
      if (buffer.length < messageEnd) {
        return;
      }

      raw = buffer.slice(messageStart, messageEnd).toString('utf8');
      buffer = buffer.slice(messageEnd);
    } else {
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) {
        return;
      }

      raw = buffer.slice(0, lineEnd).toString('utf8').replace(/\r$/, '');
      buffer = buffer.slice(lineEnd + 1);
      if (!raw.trim()) {
        continue;
      }
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    handleRequest(parsed).catch((error) => {
      if (typeof parsed?.id !== 'undefined') {
        sendError(parsed.id, -32000, error instanceof Error ? error.message : 'Unknown MCP error');
      }
    });
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  tryParseMessages();
});

process.stdin.on('error', (error) => {
  console.error('[mcp] stdin error:', error instanceof Error ? error.message : error);
});

process.stdin.on('end', () => {
  process.exit(0);
});
