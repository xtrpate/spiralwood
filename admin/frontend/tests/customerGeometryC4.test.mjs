import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getCustomerFurnitureBounds,
  getCustomerFurnitureDimensions,
  getCustomerItemDimensions,
} from "../src/pages/customer/customerGeometryBounds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const customer = "admin/frontend/src/pages/customer/";
const orders = "admin/frontend/src/pages/orders/";
const cabinet = [
  { id: "side-l", x: 0, y: 0, z: 0, width: 18, height: 876, depth: 620, qty: 1 },
  { id: "side-r", x: 882, y: 0, z: 0, width: 18, height: 876, depth: 620, qty: 1 },
  { id: "top", x: 18, y: 0, z: 0, width: 864, height: 18, depth: 620, qty: 1 },
];

test("C4 original Mini Cabinet overall W900 H876 D620 unchanged", () => {
  const bounds = getCustomerFurnitureDimensions(cabinet);
  assert.deepEqual(bounds, {width_mm:900,height_mm:876,depth_mm:620});
});

test("C4 rotation Y 90 degrees changes envelope, not part thickness", () => {
  const part = {id:"leg",x:0,y:0,z:0,width:100,height:20,depth:18,rotationY:90,qty:4};
  assert.deepEqual(getCustomerFurnitureDimensions([part]), {width_mm:18,height_mm:20,depth_mm:100});
  assert.equal(part.width,100);
  assert.equal(part.depth,18);
  assert.equal(part.qty,4);
});

test("C4 45 degree Z rotation expands axis-aligned bounding width", () => {
  const part = {x:0,y:0,z:0,width:100,height:20,depth:18,rotationZ:45};
  const b = getCustomerFurnitureBounds([part]);
  assert.equal(b.width,85);
  assert.equal(b.height,85);
  assert.equal(b.depth,18);
});

test("C4 combines multiple components with offsets and rotation", () => {
  const one = {x:0,y:0,z:0,width:100,height:20,depth:18,rotationY:90};
  const two = {x:250,y:0,z:0,width:10,height:20,depth:20};
  const b=getCustomerFurnitureBounds([one,two]);
  assert.equal(b.width,219);
  assert.equal(b.height,20);
});

test("C4 hidden/deleted parts excluded from displayed dimensions", () => {
  const visible={x:0,y:0,z:0,width:30,height:40,depth:50};
  const hidden={x:9999,y:0,z:0,width:100,height:100,depth:100,visible:false};
  const deleted={x:9999,y:0,z:0,width:100,height:100,depth:100,is_deleted:1};
  assert.deepEqual(getCustomerFurnitureDimensions([visible,hidden,deleted]), {width_mm:30,height_mm:40,depth_mm:50});
});

test("C4 invalid visible components fail closed instead of partial bounds", () => {
  assert.equal(getCustomerFurnitureBounds([{x:0,y:0,z:0,width:10,height:10,depth:10},{width:0,height:20,depth:20}]),null);
  assert.deepEqual(getCustomerFurnitureDimensions([{width:0,height:20,depth:20}],{width_mm:31,height_mm:41,depth_mm:51}),{width_mm:31,height_mm:41,depth_mm:51});
});

test("C4 fallback protects legacy items with no saved geometry", () => {
  assert.deepEqual(getCustomerItemDimensions({requested_width:1400,requested_height:900,requested_depth:700}),{width:1400,height:900,depth:700});
});

test("C4 saved rotated geometry overrides stale cached cart dimensions", () => {
  const snapshot={components:[{width:100,height:20,depth:18,rotationY:90,x:0,y:0,z:0}]};
  const item={width:900,height:800,depth:600,editor_snapshot:snapshot};
  assert.deepEqual(getCustomerItemDimensions(item),{width:18,height:20,depth:100});
  assert.deepEqual(getCustomerItemDimensions({...item,editor_snapshot:JSON.stringify(snapshot)}),{width:18,height:20,depth:100});
});

test("C4 helper never mutates frozen component identities or quantities", () => {
  const original=Object.freeze({id:"A",x:0,y:0,z:0,width:100,height:30,depth:18,qty:4,partRole:"door"});
  assert.equal(getCustomerFurnitureDimensions([original]).width_mm,100);
  assert.equal(original.qty,4);
});

test("C4 all required Customer and Admin surfaces use shared geometry", () => {
  const targets=[
    [customer+"customer3dviewer.jsx","getCustomerFurnitureDimensions(items)"],
    [customer+"customizepage.jsx","getCustomerFurnitureDimensions(components)"],
    [customer+"customcartpage.jsx","getCustomerItemDimensions(item)"],
    [customer+"customcheckoutpage.jsx","getCustomerItemDimensions(item)"],
    [orders+"OrderDetailPage.jsx","getCustomerItemDimensions(item)"],
    [orders+"AdminSubmittedDesignPreview.jsx","getCustomerFurnitureDimensions(parts"],
  ];
  for (const [file,expected] of targets) {
    assert.ok(read(file).includes(expected),`${file} must use canonical helper`);
  }
});

test("C4 construction gating and geometry mutation handlers remain in viewer", () => {
  const viewer=read(customer+"customer3dviewer.jsx");
  assert.match(viewer,/const getComponentExtents =/);
  assert.match(viewer,/const commitOverallDimension =/);
  assert.match(viewer,/const applySmartBookshelf =/);
  assert.match(viewer,/const applySmartCabinet =/);
});

test("C4 backend delivery remains rotation-aware and unchanged", () => {
  const source=read("admin/backend/utils/oversizedDelivery.js");
  assert.match(source,/getRotatedComponentBounds3D/);
  assert.match(source,/computeBoundsFromComponents/);
});
