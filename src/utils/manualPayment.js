const MANUAL_PAYMENT_TYPES = new Set(['bank', 'manual_eft', 'eft', 'bank_transfer']);

const normalizeText = (value) => String(value || '').trim();

export const isManualPaymentType = (type) =>
  MANUAL_PAYMENT_TYPES.has(normalizeText(type).toLowerCase());

export const normalizeManualPaymentConfig = (config = {}) => ({
  bankName: normalizeText(config.bankName || config.bank || config.bank_name),
  accountName: normalizeText(
    config.accountName || config.accountHolder || config.account_holder || config.beneficiaryName
  ),
  accountNumber: normalizeText(config.accountNumber || config.account_number),
  accountType: normalizeText(config.accountType || config.account_type),
  branchCode: normalizeText(config.branchCode || config.branch_code),
  referencePrefix: normalizeText(config.referencePrefix || config.reference_prefix || 'MZS'),
  instructions: normalizeText(config.instructions || config.note || config.notes)
});

export const normalizeManualPaymentMethod = (method = {}) => ({
  id: normalizeText(method.id),
  label: normalizeText(method.label || 'Direct EFT'),
  type: normalizeText(method.type || 'bank').toLowerCase(),
  description: normalizeText(method.description),
  isActive: method.isActive !== false,
  config: normalizeManualPaymentConfig(method.config || {})
});
