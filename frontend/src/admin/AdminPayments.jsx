import { useEffect, useState } from 'react';
import { fetchApi } from '../services/api';

export default function AdminPayments() {
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetchApi('/admin/payments', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.transactions) {
          setTransactions(data.transactions.map((transaction) => ({
            ...transaction,
            status: transaction.status || 'completed'
          })));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  const getTypeStyles = (type) => {
    switch (type) {
      case 'DEPOSIT': return { badge: 'bg-green-900/50 text-green-300', text: 'text-green-400', sign: '+' };
      case 'WINNING_PAYOUT': return { badge: 'bg-yellow-900/50 text-yellow-300', text: 'text-yellow-400', sign: '+' };
      case 'ENTRY_FEE': return { badge: 'bg-red-900/50 text-red-300', text: 'text-red-400', sign: '-' };
      case 'WITHDRAWAL': return { badge: 'bg-red-900/50 text-red-300', text: 'text-red-400', sign: '-' };
      default: return { badge: 'bg-slate-700 text-slate-300', text: 'text-slate-300', sign: '' };
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const search = searchTerm.toLowerCase();
    const userName = (tx.first_name || tx.username || 'Unknown').toLowerCase();
    return userName.includes(search) || tx.type.toLowerCase().includes(search) || (tx.reference_id && tx.reference_id.toLowerCase().includes(search));
  });

  if (loading) return <div className="text-white p-6">Loading payments...</div>;

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-white">Financial Ledger</h1>
        <input
          type="text"
          placeholder="Search user, type, or ref..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-slate-800 text-white px-4 py-2 rounded-xl border border-slate-700 focus:outline-none focus:border-indigo-500 w-full md:w-80"
        />
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-400">
            <tr>
              <th className="px-6 py-4">User</th>
              <th className="px-6 py-4">Type</th>
              <th className="px-6 py-4">Amount</th>
              <th className="px-6 py-4">Reference</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {filteredTransactions.map((tx) => {
              const styles = getTypeStyles(tx.type);
              return (
                <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-white">{tx.first_name || 'No Name'}</div>
                    <div className="text-xs text-slate-500">@{tx.username || tx.telegram_id}</div>
                  </td>
                  <td className="px-6 py-4"><span className={`px-3 py-1 rounded-full text-xs font-bold ${styles.badge}`}>{tx.type}</span></td>
                  <td className={`px-6 py-4 font-mono font-bold text-lg ${styles.text}`}>{styles.sign}{Math.abs(tx.amount).toFixed(2)}</td>
                  <td className="px-6 py-4 font-mono text-sm text-slate-400">{tx.reference_id ? `...${tx.reference_id.slice(-8)}` : '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">{new Date(tx.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {tx.status === 'pending' ? (
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem('adminToken');
                            await fetchApi(`/admin/payments/${tx.payment_id}/approve`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            window.location.reload();
                          }}
                          className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem('adminToken');
                            await fetchApi(`/admin/payments/${tx.payment_id}/reject`, {
                              method: 'POST',
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            window.location.reload();
                          }}
                          className="bg-red-600 text-white px-3 py-1 rounded text-xs font-bold"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-bold ${tx.status === 'completed' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                        {tx.status.toUpperCase()}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARD VIEW */}
      <div className="md:hidden space-y-4">
        {filteredTransactions.map((tx) => {
          const styles = getTypeStyles(tx.type);
          return (
            <div key={tx.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <div className="font-semibold text-white">{tx.first_name || 'No Name'}</div>
                  <div className="text-xs text-slate-500">@{tx.username || tx.telegram_id}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${styles.badge}`}>{tx.type}</span>
              </div>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="text-slate-500 text-xs uppercase">Reference</p>
                  <p className="font-mono text-xs text-slate-400">{tx.reference_id ? `...${tx.reference_id.slice(-6)}` : '-'}</p>
                </div>
                <div className="text-right">
                  <p className={`font-mono font-bold text-xl ${styles.text}`}>{styles.sign}{Math.abs(tx.amount).toFixed(2)} ETB</p>
                  <p className="text-slate-500 text-xs mt-1">{new Date(tx.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}