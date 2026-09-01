const reasons = require('../../src/utils/escrowErrors.json');
module.exports = function escrowError(error) {
  const data = `${error.message} ${JSON.stringify(error)}`;
  for (const selector of data.match(/0x[0-9a-fA-F]{8}(?![0-9a-fA-F])/g) || []) {
    if (reasons[selector.toLowerCase()]) return reasons[selector.toLowerCase()];
  }
  return error.message;
};
