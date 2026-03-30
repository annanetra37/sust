import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { LogoFull } from '../components/Logo';

const INDUSTRIES = ['Technology', 'Manufacturing', 'Finance', 'Healthcare', 'Energy', 'Retail', 'Transportation', 'Agriculture', 'Construction', 'Other'];
const SIZES = ['1-50', '51-200', '201-500', '501-1000', '1001-5000', '5000+'];
const STRUCTURES = ['Corporation', 'LLC', 'Partnership', 'Sole Proprietorship', 'Non-profit', 'Public Company'];

export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', password: '', phone: '',
    companyName: '', country: '', industry: '', companySize: '',
    ownershipType: '', yearEstablished: '', legalStructure: '',
    hqLocation: '', stockExchange: '', tickerSymbol: '',
  });

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (step === 1) return setStep(2);

    setError('');
    setLoading(true);
    try {
      await api.signup(form);
      navigate('/verify-email', { state: { email: form.email } });
    } catch (err) {
      setError(err.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-gray-100 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-6">
          <LogoFull className="mb-3" size="large" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">Create Account</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Step {step} of 2 — {step === 1 ? 'Personal Information' : 'Company Details'}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-6">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-brand-600' : 'bg-gray-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-brand-600' : 'bg-gray-200'}`} />
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          {step === 1 ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input className="input" required value={form.firstName} onChange={set('firstName')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input className="input" required value={form.lastName} onChange={set('lastName')} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" className="input" required value={form.email} onChange={set('email')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input type="password" className="input" required value={form.password} onChange={set('password')} />
                <p className="text-xs text-gray-400 mt-1">8+ chars, uppercase, number, special character</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" className="input" value={form.phone} onChange={set('phone')} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input className="input" required value={form.companyName} onChange={set('companyName')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
                  <input className="input" required value={form.country} onChange={set('country')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">HQ Location</label>
                  <input className="input" value={form.hqLocation} onChange={set('hqLocation')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Industry *</label>
                  <select className="input" required value={form.industry} onChange={set('industry')}>
                    <option value="">Select...</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Size *</label>
                  <select className="input" required value={form.companySize} onChange={set('companySize')}>
                    <option value="">Select...</option>
                    {SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legal Structure</label>
                  <select className="input" value={form.legalStructure} onChange={set('legalStructure')}>
                    <option value="">Select...</option>
                    {STRUCTURES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year Established</label>
                  <input type="number" className="input" min="1800" max="2030" value={form.yearEstablished} onChange={set('yearEstablished')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock Exchange</label>
                  <input className="input" value={form.stockExchange} onChange={set('stockExchange')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ticker Symbol</label>
                  <input className="input" value={form.tickerSymbol} onChange={set('tickerSymbol')} />
                </div>
              </div>
            </>
          )}

          <div className="flex gap-3">
            {step === 2 && (
              <button type="button" className="btn-secondary flex-1" onClick={() => setStep(1)}>Back</button>
            )}
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {step === 1 ? 'Next' : loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>

          <p className="text-center text-sm text-gray-500">
            Already have an account? <Link to="/login" className="text-brand-600 hover:underline">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
