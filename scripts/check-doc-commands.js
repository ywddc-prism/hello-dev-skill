#!/usr/bin/env node
'use strict';

/**
 * Verify that state.js subcommands appearing in documented command examples match
 * the actual CLI command tables. Only inspect Markdown inline-code spans and fenced
 * code blocks; ordinary prose that merely mentions a script filename is not a command.
 *
 * Usage: node scripts/check-doc-commands.js
 */

const fs = require('fs');
const path = require('path');
const R = path.resolve(__dirname, '..');

const fromCommandTable = (src) => {
  const m = src.match(/const COMMANDS = \{[\s\S]*?\};/);
  if (!m) throw new Error('COMMANDS table not found');
  return [...m[0].matchAll(/(?:'([\w-]+)'|([\w-]+)):\s*cmd\w+/g)].map(x => x[1] || x[2]);
};
const fromCmdDispatch = (src) =>
  [...src.matchAll(/cmd === '([\w-]+)'/g)].map(x => x[1]);

const CLIS = [
  { file: 'state.js', extract: fromCommandTable },
  { file: 'memory.js', extract: fromCommandTable },
  { file: 'portable.js', extract: fromCmdDispatch },
];

function markdownCommandContexts(markdown) {
  const contexts = [];
  let fence = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = line.match(/^\s*(`{3,}|~{3,})([^`]*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length) fence = null;
      else if (fence.shell) contexts.push(line);
      continue;
    }
    if (marker) {
      const language = marker[2].trim().split(/\s+/, 1)[0].toLowerCase();
      fence = {
        char: marker[1][0],
        length: marker[1].length,
        shell: !language || ['bash', 'sh', 'shell', 'zsh', 'console'].includes(language),
      };
      continue;
    }
    for (const match of line.matchAll(/`+([^`]+)`+/g)) contexts.push(match[1]);
  }
  return contexts;
}

function extractDocumentedCommands(markdown, cliFile) {
  const escaped = cliFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scriptPath = `scripts/${escaped}`;
  const invocation = new RegExp(
    `(?:\\bnode\\s+(?:"[^"]*${scriptPath}"|'[^']*${scriptPath}'|${scriptPath})|(?<![\\w./-])(?:"[^"]*${scriptPath}"|'[^']*${scriptPath}'|${scriptPath}))\\s+(?:--task\\s+\\S+\\s+)?([a-z][\\w:-]*)`,
    'g'
  );
  return markdownCommandContexts(markdown).flatMap(context =>
    [...context.matchAll(invocation)].map(match => match[1])
  );
}

function walkMarkdown(dir, output = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'archive'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(file, output);
    else if (entry.name.endsWith('.md')) output.push(file);
  }
  return output;
}

function run() {
  const files = walkMarkdown(R);
  const used = new Map();
  const summary = [];

  for (const cli of CLIS) {
    const real = cli.extract(fs.readFileSync(path.join(R, 'scripts', cli.file), 'utf8'));
    let referenceCount = 0;
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const commands = extractDocumentedCommands(text, cli.file);
      for (const command of commands) {
        const key = `${cli.file}:${command}`;
        if (!used.has(key)) used.set(key, { cmd: command, cli: cli.file, real, files: [] });
        const ref = used.get(key);
        const relative = path.relative(R, file);
        if (!ref.files.includes(relative)) ref.files.push(relative);
        referenceCount++;
      }
    }
    summary.push(`${cli.file}: ${real.join(',')} (${referenceCount} doc references)`);
  }

  const unknown = [...used.values()].filter(ref => !ref.real.includes(ref.cmd));
  console.log(`CLI actual commands -- ${summary.join(' | ')}`);
  console.log(`Commands used in docs: ${[...used.values()].map(ref => `${ref.cli}:${ref.cmd}`).sort().join(', ')}`);
  if (unknown.length) {
    console.log(`\n ${unknown.length} command(s) in documentation do not exist:`);
    unknown.forEach(ref => console.log(` ${ref.cli} ${ref.cmd} <- ${ref.files.slice(0, 3).join(', ')}`));
    process.exitCode = 1;
    return;
  }

  for (const cli of CLIS) {
    const real = cli.extract(fs.readFileSync(path.join(R, 'scripts', cli.file), 'utf8'));
    const mentioned = [...used.values()].filter(ref => ref.cli === cli.file).map(ref => ref.cmd);
    const undocumented = real.filter(command => !mentioned.includes(command) && !['status', 'validate'].includes(command));
    if (undocumented.length) console.log(`\n[WARN] ${cli.file} has capability but docs don't mention: ${undocumented.join(', ')}`);
  }
  console.log(`\n All ${used.size} documented commands exist`);
}

if (require.main === module) run();
module.exports = { markdownCommandContexts, extractDocumentedCommands };
