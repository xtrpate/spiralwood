import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const editor=read('admin/frontend/src/pages/blueprints/BlueprintDesign.jsx');
const dialog=read('admin/frontend/src/pages/blueprints/components/ManualConstructionReviewU2.jsx');
const u1=read('admin/frontend/src/utils/universalManualConstructionU1.mjs');
const u2=read('admin/frontend/src/utils/universalManualReviewU2.mjs');
test('U2 is visible in actual Admin 3D editor, and is reset on any design change',()=>{
 assert.equal(editor.split('import { ManualConstructionReviewU2 }').length-1,1);
 assert.equal(editor.split('<ManualConstructionReviewU2').length-1,1);
 assert.ok(editor.includes('key={currentDesignComponentSignature}'));
 assert.ok(editor.includes('components={components}'));
});
test('U2 remains draft-only, never mutates saved Blueprint or grants Customer permissions',()=>{
 assert.match(u2,/customerResizable:false/);
 assert.match(u1,/status:'draft'/);
 assert.match(u1,/customerResizable:false/);
 assert.match(dialog,/No Save\/Publish\/Customer permission/);
 assert.ok(!/api\.(post|put|patch|delete)/.test(dialog));
 assert.ok(!dialog.includes('setComponents('));
 assert.ok(!dialog.includes('publishByBlueprint'));
});
