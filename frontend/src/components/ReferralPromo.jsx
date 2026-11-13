import { useNavigate } from 'react-router-dom'

export default function ReferralPromo() {
  const navigate = useNavigate()

  return (
    <section className="!mb-4 flex !items-center !justify-between !rounded-xl !border !border-purple-500/30 !bg-gradient-to-r !from-purple-700 !to-indigo-600 !p-3 text-white !shadow-lg">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-white/20 p-2 text-xl">
          🚀
        </div>
        <div>
          <h3 className="text-xs font-bold leading-tight text-white sm:text-sm">
            Invite &amp; Earn 5%!
          </h3>
          <p className="mt-0.5 text-[10px] text-purple-100 sm:text-xs">
            Withdraw at 1,000 ETB.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/agent')}
        className="whitespace-nowrap rounded-lg bg-emerald-400 px-4 py-1.5 text-xs font-bold text-emerald-950 shadow-[0_2px_0_#065f46] transition-all hover:bg-emerald-500 active:translate-y-0.5 active:shadow-none"
      >
        Invite Now
      </button>
    </section>
  )
}
