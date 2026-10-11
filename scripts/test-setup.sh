#!/usr/bin/env bash
# Run real setup/registration CLIs in isolated HOME; never rewrite production source.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
node <<'NODE'
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process'),assert=require('assert');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'hello-dev-setup-')), source=process.cwd();
const env={...process.env,HOME:path.join(root,'home'),USERPROFILE:path.join(root,'home'),PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH};
for(const key of ['HELLODEV_HOST','HELLODEV_SETTINGS','HELLODEV_SKILL_DIR','WORKBUDDY_SESSION'])delete env[key];
fs.mkdirSync(env.HOME,{recursive:true});
const skill=path.join(root,'selected skill');fs.mkdirSync(path.join(skill,'hooks'),{recursive:true});
for(const name of ['git-gate.js','opsgate.js'])fs.copyFileSync(path.join(source,'hooks',name),path.join(skill,'hooks',name));
fs.copyFileSync(path.join(source,'SKILL.md'),path.join(skill,'SKILL.md'));
const config=path.join(root,'settings.json'), original={env:{USER_VALUE:'keep',nested:{value:1}},permissions:{allow:['Read'],nested:{keep:true}},hooks:{Stop:[{hooks:[{type:'command',command:'existing'}]}],PreToolUse:[{matcher:'Edit',hooks:[{type:'command',command:'existing edit'}]}]}};
const reset=()=>fs.writeFileSync(config,JSON.stringify(original));
const reg=(...args)=>spawnSync(process.execPath,[path.join(source,'scripts/register-hooks.js'),...args],{env,encoding:'utf8',timeout:10000});
const setup=(...args)=>spawnSync('bash',[path.join(source,'scripts/setup.sh'),...args],{env,encoding:'utf8',timeout:20000});
let pass=0,fail=0;
function test(name,fn){try{fn();console.log('PASS '+name);pass++;}catch(e){console.log('FAIL '+name+': '+e.message);fail++;}}
try{
 test('setup help/list/default check are read-only',()=>{for(const args of [['--help'],['--list'],['--check']])assert.equal(setup(...args).status,0);assert(!fs.existsSync(path.join(env.HOME,'.claude')));});
 test('empty/unknown only and argument rejected',()=>{for(const arg of ['--only=','--only=bogus','--nope'])assert.equal(setup(arg).status,2);});
 test('registration defaults to read-only UNKNOWN without host',()=>assert.equal(reg().status,0));
 test('unknown host/missing value/duplicates rejected',()=>{for(const args of [['--host=other'],['--host'],['--host=claude','--host=workbuddy']])assert.equal(reg(...args).status,2);});
 test('workbuddy does not guess claude settings',()=>{fs.mkdirSync(path.join(env.HOME,'.claude'),{recursive:true});fs.writeFileSync(path.join(env.HOME,'.claude/settings.json'),'{}');const c=JSON.parse(reg('--host=workbuddy','--describe').stdout);assert.equal(c.settings,path.join(env.HOME,'.workbuddy/settings.json'));assert.notEqual(c.settings,path.join(env.HOME,'.claude/settings.json'));assert.equal(reg('--host=workbuddy','--apply').status,3);});
 test('codebuddy settings distinct from claude',()=>{const c=JSON.parse(reg('--host=codebuddy','--describe').stdout);assert.equal(c.settings,path.join(env.HOME,'.codebuddy/settings.json'));});
 test('codex uses official hooks.json path',()=>{const c=JSON.parse(reg('--host=codex','--describe').stdout);assert.equal(c.settings,path.join(env.HOME,'.codex/hooks.json'));assert.equal(c.status,'SELECTED');assert.equal(reg('--host=codex','--check').status,3);});
 test('missing selected settings is UNKNOWN and never created',()=>{assert.equal(reg('--host=claude','--settings='+config,'--apply').status,3);assert(!fs.existsSync(config));});
 test('corrupt config rejected without write',()=>{fs.writeFileSync(config,'bad-json');assert.equal(reg('--host=claude','--settings='+config,'--apply').status,1);assert.equal(fs.readFileSync(config,'utf8'),'bad-json');});
 test('invalid hooks shape cannot overwrite data',()=>{fs.writeFileSync(config,'{"hooks":{"PreToolUse":"keep"}}');assert.equal(reg('--host=claude','--settings='+config,'--apply').status,1);assert(fs.readFileSync(config,'utf8').includes('keep'));});
 const args=['--host=workbuddy','--settings='+config,'--skill-dir='+skill];
 const codexConfig=path.join(env.HOME,'.codex/hooks.json'), codexArgs=['--host=codex','--settings='+codexConfig,'--skill-dir='+skill];
 test('codex apply preserves existing hook entries and reports ask limitation',()=>{fs.mkdirSync(path.dirname(codexConfig),{recursive:true});const codexOriginal={hooks:{PreToolUse:[{matcher:'Edit',hooks:[{type:'command',command:'existing edit'}]}],Stop:[{hooks:[{type:'command',command:'existing stop'}]}]}};fs.writeFileSync(codexConfig,JSON.stringify(codexOriginal));assert.equal(reg(...codexArgs,'--apply').status,0);const cfg=JSON.parse(fs.readFileSync(codexConfig,'utf8'));assert.deepEqual(cfg.hooks.PreToolUse[0],codexOriginal.hooks.PreToolUse[0]);assert.deepEqual(cfg.hooks.Stop,codexOriginal.hooks.Stop);const checked=reg(...codexArgs,'--check');assert.equal(checked.status,0);assert.match(checked.stdout,/permissionDecision ask/);});
 test('codex registration is idempotent and malformed config is rejected',()=>{const text=fs.readFileSync(codexConfig,'utf8');assert.equal(reg(...codexArgs,'--apply').status,0);assert.equal(fs.readFileSync(codexConfig,'utf8'),text);fs.writeFileSync(codexConfig,'bad-json');assert.equal(reg(...codexArgs,'--apply').status,1);assert.equal(fs.readFileSync(codexConfig,'utf8'),'bad-json');});
 test('default and dry-run preserve selected config',()=>{reset();for(const mode of [[],['--dry-run']])assert.equal(reg(...args,...mode).status,0);assert.deepEqual(JSON.parse(fs.readFileSync(config,'utf8')),original);});
 test('apply preserves nested env and all unrelated hooks/permissions',()=>{assert.equal(reg(...args,'--apply').status,0);const cfg=JSON.parse(fs.readFileSync(config,'utf8'));assert.deepEqual(cfg.env,original.env);assert.deepEqual(cfg.permissions,original.permissions);assert.deepEqual(cfg.hooks.Stop,original.hooks.Stop);assert.deepEqual(cfg.hooks.PreToolUse[0],original.hooks.PreToolUse[0]);assert.equal(cfg.hooks.PreToolUse.length,2);});
 test('correct direct selected commands check and apply idempotent',()=>{assert.equal(reg(...args,'--check').status,0);const text=fs.readFileSync(config,'utf8');assert.equal(reg(...args,'--apply').status,0);assert.equal(fs.readFileSync(config,'utf8'),text);});
 test('basename mentions and wrong paths cannot count as registration',()=>{reset();const cfg=JSON.parse(fs.readFileSync(config,'utf8'));cfg.hooks.PreToolUse=[{matcher:'Bash',hooks:[{type:'command',command:'echo HELLODEV_GIT_GATE_CALLER=host HELLODEV_GIT_GATE_TRACE=x '+path.join(skill,'hooks/git-gate.js')},{type:'command',command:'HELLODEV_OPSGATE_CALLER=host HELLODEV_OPSGATE_TRACE=x node /wrong/opsgate.js'}]}];fs.writeFileSync(config,JSON.stringify(cfg));assert.equal(reg(...args,'--check').status,3);});
 test('disabled hooks never changed by apply',()=>{fs.writeFileSync(config,'{"disableAllHooks":true}');assert.equal(reg(...args,'--apply').status,1);assert.equal(fs.readFileSync(config,'utf8'),'{"disableAllHooks":true}');});
 test('symlink settings refused',()=>{const link=path.join(root,'link.json');fs.symlinkSync(config,link);assert.equal(reg('--host=claude','--settings='+link,'--apply').status,1);});
 test('workbuddy setup apply refuses unknown interface before symlink creation',()=>{const missing=path.join(env.HOME,'.workbuddy/skills/new');assert.equal(setup('--host=workbuddy','--skill-dir='+missing,'--apply').status,3);assert(!fs.existsSync(missing));});
 test('setup uses exact confirmed settings and skill paths',()=>{reset();assert.equal(setup('--host=workbuddy','--settings='+config,'--skill-dir='+skill,'--only=hooks','--apply').status,0);assert.equal(reg(...args,'--check').status,0);});
 test('exclusive config lock fails without changing original',()=>{reset();fs.writeFileSync(config+'.hello-dev-lock','occupied');assert.equal(reg(...args,'--apply').status,1);assert.deepEqual(JSON.parse(fs.readFileSync(config,'utf8')),original);assert(fs.existsSync(config+'.hello-dev-lock'));});
}finally{fs.rmSync(root,{recursive:true,force:true});}
console.log(`${pass} passed / ${fail} failed`);process.exitCode=fail?1:0;
NODE
