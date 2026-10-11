import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// A2 checks only metadata of known standard templates. It grants NO resize permission.
const rel = 'admin/frontend/src/pages/blueprints/data/standardTemplateBuilders.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const localFile = path.join(root, rel);
const src = fs.readFileSync(localFile, 'utf8').replace(/\r\n/g, '\n');
const gitRoot = process.env.WISDOM_A2_GIT_ROOT || process.cwd();
const baseline = execFileSync('git', ['show', '1ae0e8b49395d39f24bc48fc2e337eb98c5d1134:' + rel], { cwd: gitRoot, encoding: 'utf8' }).replace(/\r\n/g, '\n');
const expectedSha = 'F3BE3D5045E61D64D6A9A81C21B7C3CB7D5C0B6502E96778B4243D38E2FE38BA';
const expectedRoles = {
  "DT-TOP": "top_panel",
  "DT-FL": "leg",
  "DT-FR": "leg",
  "DT-BL": "leg",
  "DT-BR": "leg",
  "DT-AF": "apron_rail",
  "DT-AR": "apron_rail",
  "DT-AL": "apron_rail",
  "DT-AR2": "apron_rail",
  "BED-HB": "headboard",
  "BED-FB": "footboard",
  "BED-SL": "side_rail",
  "BED-SR": "side_rail",
  "BED-ST1": "slat",
  "BED-ST2": "slat",
  "BED-ST3": "slat",
  "BED-ST4": "slat",
  "WR-SL": "left_side_panel",
  "WR-SR": "right_side_panel",
  "WR-TOP": "top_panel",
  "WR-BOT": "bottom_panel",
  "WR-BKL": "back_panel",
  "WR-BKR": "back_panel",
  "WR-BKS": "support_panel",
  "WR-SH1": "shelf",
  "WR-SH2": "shelf",
  "WR-SH3": "shelf",
  "WR-DL": "door",
  "WR-DR": "door",
  "CT-TOP": "top_panel",
  "CT-FL": "leg",
  "CT-FR": "leg",
  "CT-BL": "leg",
  "CT-BR": "leg",
  "CT-SH": "shelf",
  "CT-AF": "apron_rail",
  "CT-AR": "apron_rail",
  "CT-ASL": "apron_rail",
  "CT-ASR": "apron_rail"
};
const familyPrefix = {'DT-':'dining_table','BED-':'bed_frame','WR-':'wardrobe','CT-':'coffee_table'};

function blocksFrom(source) {
  return [...source.matchAll(/createAssemblyPart\(\{([\s\S]*?)\n\s*\}\)/g)].map((match) => {
    const body = match[1];
    const capture = (key) => body.match(new RegExp('\\b'+key+'\\s*:\\s*"([^"]+)"'))?.[1] ?? '';
    return {code:capture('partCode'),type:capture('type'),label:capture('label'),role:capture('partRole'),body};
  });
}
const parts=blocksFrom(src);
const orig=blocksFrom(baseline);

test('A2 baseline Git source matches verified checkpoint blob', () => {
 const digest=crypto.createHash('sha256').update(baseline).digest('hex').toUpperCase();
 assert.equal(digest, expectedSha);
});

test('A2 precisely 39 standard assembly components and stable code order', () => {
 assert.equal(parts.length,39);
 assert.equal(orig.length,39);
 assert.deepEqual(parts.map(p=>p.code),orig.map(p=>p.code));
 assert.equal(new Set(parts.map(p=>p.code)).size,39);
});

test('A2 every standard part has an explicit reviewed role, no aliases or fallbacks guessed', () => {
 for(const p of parts) {
   assert.ok(Object.hasOwn(expectedRoles,p.code),'Unexpected partCode: '+p.code);
   assert.equal(p.role, expectedRoles[p.code],p.code);
 }
});

test('A2 exactly 36 added roles and the three existing wardrobe roles remain identical',()=>{
 const oldMissing = orig.filter(p=>!p.role).map(p=>p.code);
 assert.equal(oldMissing.length,36);
 assert.deepEqual(orig.filter(p=>p.role).map(p=>p.code),['WR-BKL','WR-BKR','WR-BKS']);
 for(const p of orig.filter(p=>p.role))assert.equal(parts.find(q=>q.code===p.code)?.role,p.role);
});

for(const [prefix,family] of Object.entries(familyPrefix)) {
 test('A2 '+family+' type/labels/partCodes and existing contents preserved',()=>{
  const current=parts.filter(p=>p.code.startsWith(prefix));
  const before=orig.filter(p=>p.code.startsWith(prefix));
  assert.equal(current.length,before.length);
  assert.deepEqual(current.map(p=>[p.code,p.type,p.label]),before.map(p=>[p.code,p.type,p.label]));
 });
}

test('A2 no geometry, position, thickness, finish, material, qty, or builder logic changed',()=>{
 let predicted=baseline;
 for(const p of orig.filter(p=>!p.role)) {
   const needle=`      type: "${p.type}",\n      label: "${p.label}",\n      partCode: "${p.code}",`;
   assert.equal(predicted.split(needle).length-1,1,p.code);
   predicted=predicted.replace(needle,`      type: "${p.type}",\n      partRole: "${expectedRoles[p.code]}",\n      label: "${p.label}",\n      partCode: "${p.code}",`);
 }
 assert.equal(src,predicted,'Unexpected non-metadata change to standardTemplateBuilders.js');
});

test('A2 does not modify files that grant Customer resize/publish permissions',()=>{
 assert.ok(!src.includes('enableCustomerResize'));
 assert.ok(!src.includes('certifiedForCustomerResize'));
});
