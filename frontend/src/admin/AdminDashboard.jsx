import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../services/api';
import { useTranslation } from 'react-i18next';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeGames: 0,
    totalWagered: '0.00',
    totalPayouts: '0.00',
    platformProfit: '0.00'
  });
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastBonus, setBroadcastBonus] = useState('0');
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState('');
  const [broadcastResult, setBroadcastResult] = useState('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetchApi('/admin/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        setStats({
          totalUsers: data.totalUsers || 0,
          activeGames: data.activeGames || 0,
          totalWagered: parseFloat(data.totalWagered || 0).toFixed(2),
          totalPayouts: parseFloat(data.totalPayouts || 0).toFixed(2),
          platformProfit: parseFloat(data.platformProfit || 0).toFixed(2)
        });
      } catch (err) {
        console.error('Failed to load stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const handleBroadcast = async () => {
    const bonusAmount = Number(broadcastBonus);
    if (!broadcastMsg.trim() && (!Number.isFinite(bonusAmount) || bonusAmount <= 0)) {
      setBroadcastError('Enter a message or a positive bonus amount.');
      return;
    }
    if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
      setBroadcastError('Bonus amount must be a non-negative number.');
      return;
    }
    if (!window.confirm('Are you sure you want to send this to all users?')) return;

    setBroadcasting(true);
    setBroadcastError('');
    setBroadcastResult('');
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetchApi('/admin/broadcast', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ message: broadcastMsg, bonusAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Broadcast failed.');
      setBroadcastResult(`Sent to ${data.successCount} users. Failed: ${data.failCount}.`);
      setBroadcastMsg('');
      setBroadcastBonus('0');
    } catch (err) {
      setBroadcastError(err.message || 'Broadcast failed.');
    } finally {
      setBroadcasting(false);
    }
  };

  if (loading) return <div className="text-white p-6">{t('loadingDashboard')}</div>;

  const metrics = [
    { id: 'users', title: t('totalUsers'), value: stats.totalUsers, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: '👥', route: '/admin/users' },
    { id: 'games', title: t('activeGames'), value: stats.activeGames, color: 'text-green-400', bg: 'bg-green-500/10', icon: '🎮', route: '/admin/games' },
    { id: 'wagered', title: t('totalWagered'), value: `ETB ${stats.totalWagered}`, color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: '💰', route: '/admin/payments' },
    { id: 'profit', title: t('platformProfit'), value: `ETB ${stats.platformProfit}`, color: 'text-purple-400', bg: 'bg-purple-500/10', icon: '📈', route: '/admin/payments' },
  ];

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-3xl font-bold text-white mb-8">{t('dashboardOverview')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m) => (
          <button
            key={m.id}
            onClick={() => navigate(m.route)}
            className="bg-slate-800 hover:bg-slate-700 transition-all rounded-2xl p-6 border border-slate-700 shadow-lg text-left group flex flex-col justify-between h-32"
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-slate-400 font-semibold">{m.title}</span>
              <div className={`p-2 rounded-lg ${m.bg}`}>
                <span className={m.color}>{m.icon}</span>
              </div>
            </div>
            <div className="flex justify-between items-end w-full">
              <span className="text-2xl font-black text-white">{m.value}</span>
              <span className="text-slate-500 group-hover:text-white transition-colors">→</span>
            </div>
          </button>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold text-white">📢 Broadcast Announcement</h2>
        <textarea
          aria-label="Broadcast message"
          placeholder="Type your announcement here..."
          className="mb-3 w-full rounded-lg bg-slate-900 p-3 text-white"
          rows={4}
          value={broadcastMsg}
          onChange={(event) => setBroadcastMsg(event.target.value)}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            aria-label="Optional bonus amount in ETB"
            type="number"
            min="0"
            step="0.01"
            placeholder="Optional bonus amount (ETB)"
            className="w-full rounded-lg bg-slate-900 p-3 text-white sm:w-1/2"
            value={broadcastBonus}
            onChange={(event) => setBroadcastBonus(event.target.value)}
          />
          <button
            type="button"
            onClick={handleBroadcast}
            disabled={broadcasting}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-bold text-white disabled:opacity-50 sm:w-1/2"
          >
            {broadcasting ? 'Sending...' : 'Send to All Users'}
          </button>
        </div>
        {broadcastError && <p role="alert" className="mt-3 text-sm text-red-400">{broadcastError}</p>}
        {broadcastResult && <p role="status" className="mt-3 text-sm text-green-400">{broadcastResult}</p>}
      </section>

      {selectedMetric && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 shadow-2xl relative">
            <button 
              onClick={() => setSelectedMetric(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-4">{t('metricDetails')}</h2>
            
            <div className="space-y-4 text-slate-300">
              {selectedMetric === 'users' && (
                <>
                  <p><strong>{t('totalUsers')}:</strong> {stats.totalUsers}</p>
                  <p className="text-sm text-slate-400">{t('registeredAccountsDescription')}</p>
                </>
              )}
              {selectedMetric === 'games' && (
                <>
                  <p><strong>{t('activeGames')}:</strong> {stats.activeGames}</p>
                  <p className="text-sm text-slate-400">{t('activeGamesDescription')}</p>
                </>
              )}
              {selectedMetric === 'wagered' && (
                <>
                  <p><strong>{t('totalWagered')}:</strong> ETB {stats.totalWagered}</p>
                  <div className="bg-slate-900 p-3 rounded-lg text-sm font-mono mt-2">
                    {t('wageredMath')}
                  </div>
                </>
              )}
              {selectedMetric === 'profit' && (
                <>
                  <p><strong>{t('platformProfit')}:</strong> ETB {stats.platformProfit}</p>
                  <div className="bg-slate-900 p-3 rounded-lg text-sm font-mono mt-2">
                    {t('profitMath', { wagered: stats.totalWagered, payouts: stats.totalPayouts, profit: stats.platformProfit })}
                  </div>
                  <p className="text-sm text-slate-400 mt-2">{t('rakeDescription')}</p>
                </>
              )}
            </div>
            
            <button 
              onClick={() => setSelectedMetric(null)}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}