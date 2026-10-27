// Validation against the official VMI i.SAF XSD 1.2. The schema file is not distributed with the program: when it is
// missing only the XSD validation is skipped (with a visible skip message), every other check of the calling test still runs.
// ISAF_XSD=<path> points to another copy of the schema (or to a missing file, to check the skip path).
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { validateXML } = require('xmllint-wasm');

const xsdFile = process.env.ISAF_XSD || path.join(__dirname, '../../../docs/vmi/isaf_1.2.xsd');
const xsd = fs.existsSync(xsdFile) ? fs.readFileSync(xsdFile, 'utf8') : null;
const skipReason = xsd ? null : `i.SAF XSD 1.2 not found (${xsdFile}); XSD validation is skipped, all other checks still run`;

// Registers one visibly skipped test in the calling file when the schema is missing.
function reportMissingXsd() {
  if (!xsd) test('i.SAF XSD 1.2 validation', t => t.skip(skipReason));
}

// Same shape as xmllint-wasm's result; without the schema the document counts as valid and `skipped` is true.
async function validateIsaf(xml) {
  if (!xsd) return { valid: true, errors: [], skipped: true };
  return validateXML({ xml: [{ fileName: 'isaf.xml', contents: xml }], schema: [{ fileName: 'isaf.xsd', contents: xsd }] });
}

module.exports = { hasXsd: Boolean(xsd), skipReason, reportMissingXsd, validateIsaf };
