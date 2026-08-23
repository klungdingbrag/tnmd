/**
 * TNMD v1.4.1 - Customer Index V3 compatibility fix
 *
 * Fixes the naming mismatch between Customer Index V3 and
 * Customer Analytics V3.
 *
 * Customer Index V3 exposes:
 *   buildCustomerIndexV3()
 *
 * Customer Analytics V3 was previously looking for:
 *   buildCustomerIndexV3_()
 *
 * This adapter intentionally keeps both names available without
 * changing the existing Customer Index V3 implementation.
 */

function buildCustomerIndexV3_() {
  if (typeof buildCustomerIndexV3 !== 'function') {
    throw new Error(
      'Fungsi buildCustomerIndexV3 tidak ditemukan. Pastikan file Customer Index V3 sudah dipasang.'
    );
  }

  return buildCustomerIndexV3();
}

function testCustomerIndexV3CompatibilityFix() {
  var result = buildCustomerIndexV3_();

  var output = {
    success: !!(result && result.success === true),
    api_version: '1.4.1',
    layer: 'customer-index-v3-compatibility',
    test: 'testCustomerIndexV3CompatibilityFix',
    status: result && result.success === true ? 'PASS' : 'FAIL'
  };

  Logger.log(JSON.stringify(output, null, 2));

  if (output.status !== 'PASS') {
    throw new Error('Customer Index V3 compatibility test gagal.');
  }

  return output;
}
