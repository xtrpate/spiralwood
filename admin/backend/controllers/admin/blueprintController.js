// controllers/blueprintController.js
// Stable route-facing Blueprint controller.
// Handler implementations are grouped by responsibility while all existing
// export names remain available from this original module path.
const crudHandlers = require("./blueprintController.crud");
const estimationHandlers = require("./blueprintController.estimation");

module.exports = {
  ...crudHandlers,
  ...estimationHandlers,
};
