import { Link } from 'react-router-dom';

export default function ShopFooter() {
  return (
    <footer className="bg-gray-800 text-gray-300 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-white font-bold mb-4">Get to Know Us</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="hover:text-white">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/careers" className="hover:text-white">
                  Careers
                </Link>
              </li>
              <li>
                <Link to="/press" className="hover:text-white">
                  Press Releases
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-bold mb-4">Make Money with Us</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/sell" className="hover:text-white">
                  Sell on MzansiShop
                </Link>
              </li>
              <li>
                <Link to="/sell" className="hover:text-white">
                  Become a Vendor
                </Link>
              </li>
              <li>
                <Link to="/promoters/apply" className="hover:text-white">
                  Become a Promoter
                </Link>
              </li>
              <li>
                <Link to="/promoters/dashboard" className="hover:text-white">
                  Promoter Dashboard
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-bold mb-4">Business & Partners</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/business" className="hover:text-white">
                  Business Card
                </Link>
              </li>
              <li>
                <Link to="/promoters/apply" className="hover:text-white">
                  Creator Partnership
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-white font-bold mb-4">Let Us Help You</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/account" className="hover:text-white">
                  Your Account
                </Link>
              </li>
              <li>
                <Link to="/orders" className="hover:text-white">
                  Your Orders
                </Link>
              </li>
              <li>
                <Link to="/help" className="hover:text-white">
                  Help Center
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-8 text-center text-sm">
          <p>(c) 2024 MzansiShop. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
