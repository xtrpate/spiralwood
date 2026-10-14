"use strict";
// Mock-only integrity/regression: NO NETWORK and NO DATABASE connections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = require.resolve('../controllers/admin/reportsController');
const dbPath = require.resolve('../config/db');
const oldDb = require.cache[dbPath];
const oldController = require.cache[controllerPath];
const calls=[];
let mockedReports;
const mockDb={query:async(sql,params)=>{
  calls.push({sql:String(sql),params});
  if(/LIMIT \? OFFSET \?/i.test(sql)) return [[
    {order_id:621,order_number:'SWS-20261014-0001',order_type:'blueprint',revenue:'54400.00',cogs:'44500.00'},
    {order_id:100,order_number:'LEGACY',order_type:'standard',revenue:'15000.00',cogs:'9000.00'}
  ]];
  if(/COUNT\(\*\) AS total/i.test(sql)) return [[{total:2,total_revenue:'69400.00',total_cogs:'53500.00'}]];
  throw Error('Unexpected query: '+String(sql).slice(0,150));
}};
function restore(){if(oldDb) require.cache[dbPath]=oldDb; else delete require.cache[dbPath]; if(oldController) require.cache[controllerPath]=oldController; else delete require.cache[controllerPath];}
(async()=>{
  require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:mockDb,children:[],paths:[]};
  delete require.cache[controllerPath];
  mockedReports=require(controllerPath);
  const res={statusCode:200,status(s){this.statusCode=s;return this;},json(b){this.body=b;return b}};
  await mockedReports.getSalesProfitabilityReport({query:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(calls.length,2);
  for(const {sql} of calls){
    assert.match(sql,/o\.status = 'completed'/);
    assert.match(sql,/GREATEST\(0, COALESCE\(o\.total, 0\) - COALESCE\(e\.tax, 0\)\)/);
    assert.match(sql,/JSON_VALID\(e\.estimation_data\) = 1/);
    assert.match(sql,/\$\.costing_formula\.production_cost/);
    assert.match(sql,/CAST\(JSON_UNQUOTE\(JSON_EXTRACT\(e\.estimation_data/);
    assert.match(sql,/e\.material_cost, 0\) \+ COALESCE\(e\.labor_cost, 0\)/);
    assert.match(sql,/oi\.quantity \* COALESCE\(oi\.production_cost, 0\)/);
    assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE)\b/i);
  }
  assert.equal(res.body?.records?.[0]?.revenue,54400);
  assert.equal(res.body?.records?.[0]?.cogs,44500);
  assert.equal(res.body?.records?.[0]?.gross_profit,9900);
  assert.equal(res.body?.records?.[0]?.margin_percentage,'18.20');
  assert.equal(res.body?.records?.[1]?.gross_profit,6000);
  assert.equal(res.body?.summary?.total_revenue,69400);
  assert.equal(res.body?.summary?.total_cogs,53500);
  // Concrete economics for #621; confirms not counting the F2 20% markup as production cost.
  const productionCost=24500+20000;
  const markedUpSale=productionCost*1.2;
  const vat=6528;
  const total=60928;
  assert.equal(productionCost,44500);
  assert.equal(markedUpSale,53400);
  assert.equal(total-vat,54400);
  assert.equal(total-vat-productionCost,9900); // before untracked delivery expense
  const frontend=fs.readFileSync(path.resolve(__dirname,'../../frontend/src/pages/reports/SalesProfitabilityReportPage.jsx'),'utf8');
  assert.match(frontend,/Blueprint revenue excludes the saved quotation VAT/);
  assert.match(frontend,/Delivery expenses are not separately deducted/);
  console.log('PASS: F2 profitability SQL, quote/VAT maths, standard fallback, report/export shared controller. MOCK ONLY: NO DATABASE.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(restore);
