export const VENDOR_TERMS_VERSION = '2026-03-13';

export default function VendorTermsText({ showTitle = true, compact = false }) {
  const textClass = compact ? 'text-xs text-gray-700' : 'text-sm text-gray-700';
  const headingClass = compact ? 'text-sm font-semibold' : 'text-lg font-semibold';

  return (
    <div className={`space-y-3 ${textClass}`}>
      {showTitle && (
        <div className="space-y-1">
          <h2 className={headingClass}>Mzansi Shop Vendor Terms & Conditions</h2>
          <p className="text-xs text-gray-500">Last updated: March 13, 2026</p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-semibold">1. Agreement Overview</h3>
        <p>
          By applying to sell on Mzansi Shop, you ("Vendor", "Seller") agree to these Terms and
          Conditions. These terms govern your use of the platform and your relationship with customers.
        </p>
        <p>
          Mzansi Shop operates as an online marketplace connecting independent vendors with customers.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">2. Platform Role (Middleman)</h3>
        <p>
          Mzansi Shop is a marketplace platform and acts solely as an intermediary. Mzansi Shop does not
          own, manufacture, store, or directly sell vendor products unless explicitly stated.
        </p>
        <p>
          The sales contract is between the Vendor and the Customer. Mzansi Shop is not a party to that
          contract.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">3. Vendor Responsibilities</h3>
        <p>Vendors are fully responsible for:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Accurate product listings, pricing, and descriptions.</li>
          <li>Product quality, authenticity, and legality.</li>
          <li>Inventory management and order fulfillment.</li>
          <li>Packaging, dispatch, and delivery of orders.</li>
          <li>Customer communication and support for their orders.</li>
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">4. Shipping & Courier Fees</h3>
        <p>
          Shipping is the Vendor’s responsibility. Where Mzansi Shop collects a courier fee at checkout,
          that fee is set aside for courier costs and may be deducted from vendor payouts.
        </p>
        <p>
          Vendors must ensure orders are shipped on time and comply with courier requirements. Any courier
          costs beyond the collected shipping fee remain the Vendor’s responsibility.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">5. Returns, Refunds & Disputes</h3>
        <p>
          Vendors are responsible for all returns, exchanges, and refunds, and must comply with applicable
          South African consumer laws.
        </p>
        <p>
          Mzansi Shop facilitates payment processing only and does not issue refunds from its own funds
          unless required by law.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">6. Fees & Subscription</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li>Mzansi Shop charges a 5% commission on each successful sale.</li>
          <li>Vendors pay a monthly subscription fee of R100.</li>
        </ul>
        <p>
          Fees may be updated with reasonable notice. Failure to pay subscription fees may result in
          suspension of vendor access.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">7. Payments & Payouts</h3>
        <p>
          Customer payments are processed by approved payment providers. Mzansi Shop collects payments on
          behalf of Vendors and releases payouts according to platform policies.
        </p>
        <p>
          Mzansi Shop may delay payouts to investigate fraud, disputes, or suspicious activity.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">8. Chargebacks & Fraud</h3>
        <p>
          Vendors are responsible for chargebacks, reversals, or disputes related to their orders. Mzansi Shop
          may recover chargeback amounts and related fees from vendor payouts or balances.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">9. Prohibited Products</h3>
        <p>Vendors may not list or sell:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Illegal, counterfeit, stolen, or unsafe products.</li>
          <li>Products that violate South African law or third-party rights.</li>
        </ul>
        <p>Mzansi Shop may remove listings and suspend accounts without notice.</p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">10. Intellectual Property</h3>
        <p>
          Vendors confirm they have rights to all content submitted. Vendors grant Mzansi Shop a license to
          display product images, descriptions, and branding for marketplace operations and marketing.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">11. Suspension or Termination</h3>
        <p>
          Mzansi Shop may suspend or terminate vendor accounts for policy violations, fraud, excessive
          complaints, non-fulfillment, or unpaid fees.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">12. Limitation of Liability</h3>
        <p>
          Mzansi Shop is not liable for product defects, delivery delays, customer misuse, or vendor disputes.
          Vendors agree to indemnify and hold Mzansi Shop harmless against claims arising from their products
          or services.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">13. Governing Law</h3>
        <p>
          These terms are governed by the laws of South Africa.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">14. Acceptance</h3>
        <p>
          By submitting a vendor application or continuing to sell on Mzansi Shop, the Vendor confirms that
          they have read, understood, and agreed to these Terms & Conditions.
        </p>
      </div>
    </div>
  );
}
