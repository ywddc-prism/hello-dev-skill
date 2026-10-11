#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { markdownCommandContexts, extractDocumentedCommands } = require('./check-doc-commands.js');

const prose = [
  'The phrase scripts/state.js is mentioned in this sentence, but it is not an invocation.',
  'scripts/memory.js exists for project memory; scripts/memory.js but its format may change.',
  'The docs explain `scripts/state.js` and `scripts/memory.js` but do not run either file here.',
].join('\n');
assert.deepEqual(extractDocumentedCommands(prose, 'state.js'), []);
assert.deepEqual(extractDocumentedCommands(prose, 'memory.js'), []);
assert.deepEqual(extractDocumentedCommands('`node scripts/stateXjs resume`', 'state.js'), []);

const examples = [
  '```bash',
  'node scripts/state.js resume',
  'node "$HOME/.workbuddy/skills/hello-dev/scripts/state.js" --task task-1 show',
  'node scripts/memory.js recall --layer L2 --limit 5',
  '```',
  'Run `node scripts/portable.js pack --apply` after reviewing the contents.',
  '```text',
  'node scripts/state.js this-is-not-a-command',
  '```',
].join('\n');
assert.deepEqual(extractDocumentedCommands(examples, 'state.js'), ['resume', 'show']);
assert.deepEqual(extractDocumentedCommands(examples, 'memory.js'), ['recall']);
assert.deepEqual(extractDocumentedCommands(examples, 'portable.js'), ['pack']);

const tildeFence = ['~~~sh', 'node scripts/state.js validate', '~~~'].join('\n');
assert.deepEqual(extractDocumentedCommands(tildeFence, 'state.js'), ['validate']);

const quotedScriptOnly = 'Run `"$HOME/.claude/skills/hello-dev/scripts/portable.js" inspect archive.tar.gz`.';
assert.deepEqual(extractDocumentedCommands(quotedScriptOnly, 'portable.js'), ['inspect']);

console.log('Doc command scanner regression tests passed (prose ignored; shell examples recognized).');
