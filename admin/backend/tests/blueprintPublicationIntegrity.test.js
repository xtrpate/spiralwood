const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const product = read('controllers/admin/productController.js');
const crud = read('controllers/admin/blueprintController.crud.js');
const customer = read('controllers/customer/customer.blueprints.js');
const persistence = read('../frontend/src/pages/blueprints/hooks/useBlueprintPersistence.js');
const header = read('../frontend/src/pages/blueprints/components/BlueprintEditorHeader.jsx');
const design = read('../frontend/src/pages/blueprints/BlueprintDesign.jsx');
const modal = read('../frontend/src/pages/blueprints/components/BlueprintPublishModal.jsx');
const productsPage = read('../frontend/src/pages/products/ProductsPage.jsx');

assert(
  crud.includes("AS has_published_product"),
  'Blueprint GET must expose authoritative has_published_product state.',
);

assert(
  persistence.includes('publicationInFlightRef'),
  'Publish and unpublish must share an in-flight publication guard.',
);
assert(
  !persistence.includes('await api.put(`/blueprints/${id}`, {\n        is_template: 0'),
  'Unpublish must not use a second Blueprint request.',
);
assert(
  persistence.includes('has_published_product: 0') && persistence.includes('has_published_product: 1'),
  'Frontend Blueprint state must update the persisted publication flag.',
);
assert(
  !persistence.includes('estimatedPrice !== null ? estimatedPrice : designTotal'),
  'Normal Blueprint Save must not write calculated design totals into customer base_price.',
);
assert(
  persistence.includes('component.type !== "reference_proxy"'),
  'Client publish guard must require a real production component.',
);

assert(
  header.includes('hasPublishedProduct') &&
    header.includes('{hasPublishedProduct ? (') &&
    header.includes('Publish to Gallery') &&
    header.includes('Unpublish'),
  'Blueprint header must render mutually exclusive publication actions.',
);
assert(
  design.includes('publishing={publishing}'),
  'Blueprint header must receive publication busy state.',
);
assert(modal.includes('maxLength={200}'), 'Publish title must be capped at 200 characters.');

assert(
  product.includes('BLUEPRINT_EMPTY_DESIGN') &&
    product.includes('component.type !== "reference_proxy"'),
  'Backend publish must reject empty/reference-only Blueprints.',
);
assert(
  product.includes("FOR UPDATE") &&
    product.includes('SET is_template = 0,') &&
    product.includes("AND type = 'blueprint'") &&
    product.includes('has_published_product: 0'),
  'Backend unpublish must atomically normalize Product and Blueprint state.',
);
assert(
  product.includes('Blueprint publication is managed from Blueprint Management'),
  'Generic product publication endpoints must reject Blueprint products.',
);
assert(
  product.includes('Blueprint products are managed from Blueprint Management and cannot be permanently deleted here.'),
  'Blueprint products must not be permanently deleted from Product Management.',
);

assert(
  productsPage.includes('disabled={isBlueprint}') &&
    productsPage.includes('Manage publish status in Blueprint'),
  'Product Management must route Blueprint publication back to Blueprint Management.',
);
assert(
  productsPage.includes('.filter((product) => product.type !== "blueprint")') &&
    productsPage.includes(
      'products.some((product) => product.type !== "blueprint")',
    ),
  'Product Management Select All must exclude Blueprint products from generic bulk publication.',
);

const basePriceAssignments = customer.match(/base_price:\s*0,/g) || [];
assert(
  basePriceAssignments.length >= 3,
  'Customer Blueprint API must expose quote-only base_price=0 in list/detail mappings.',
);

console.log('PASS: Blueprint publication integrity checks passed.');
