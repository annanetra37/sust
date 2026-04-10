import { Loader2, Coins, AlertTriangle, X } from 'lucide-react';

/**
 * Modal that previews the credit cost of an action before the user confirms.
 *
 * Props:
 *   open          — whether the modal is shown
 *   loading       — true while the estimate is being fetched
 *   estimate      — { credits, estimatedCostUSD, balance, sufficient, remainingAfter, breakdown }
 *   action        — short label ("Extract 3 Documents", "Generate ESRS Report", ...)
 *   description   — one-line explanation of what will happen
 *   confirmLabel  — text on the confirm button (default "Confirm & Proceed")
 *   confirming    — true while the action is running (disables the buttons)
 *   error         — optional error string
 *   onConfirm     — called when the user clicks confirm
 *   onCancel      — called when the user clicks cancel or dismisses
 */
export default function ConfirmCreditsModal({
  open,
  loading = false,
  estimate,
  action,
  description,
  confirmLabel = 'Confirm & Proceed',
  confirming = false,
  error,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const credits = estimate?.credits ?? 0;
  const usd = estimate?.estimatedCostUSD ?? 0;
  const balance = estimate?.balance ?? 0;
  const sufficient = estimate?.sufficient ?? false;
  const remaining = estimate?.remainingAfter ?? Math.max(0, balance - credits);
  const breakdown = estimate?.breakdown || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md relative animate-in fade-in zoom-in-95">
        <button
          onClick={onCancel}
          disabled={confirming}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 disabled:opacity-50"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-brand-100 dark:bg-brand-900 flex items-center justify-center shrink-0">
            <Coins className="w-6 h-6 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight">
              {action || 'Confirm Action'}
            </h3>
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{description}</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-10 flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            <span className="text-sm">Calculating estimated cost...</span>
          </div>
        ) : estimate ? (
          <>
            <div className="bg-gradient-to-br from-brand-50 to-emerald-50 dark:from-brand-950 dark:to-emerald-950 rounded-xl p-4 mb-4 border border-brand-200/60 dark:border-brand-800/60">
              <p className="text-xs uppercase tracking-wide text-brand-700 dark:text-brand-400 font-semibold">
                Estimated credits for this action
              </p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-brand-700 dark:text-brand-300">
                  {credits.toLocaleString()}
                </span>
                <span className="text-sm text-brand-600 dark:text-brand-400">credits</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                ≈ ${usd.toFixed(4)} USD &middot; calculated at 400 credits per $1 of estimated cost
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                <p className="text-[10px] uppercase text-gray-500 dark:text-gray-400">Current Balance</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {balance.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${sufficient ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-red-50 dark:bg-red-950'}`}>
                <p className={`text-[10px] uppercase ${sufficient ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {sufficient ? 'After This Action' : 'Shortfall'}
                </p>
                <p className={`text-lg font-bold ${sufficient ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                  {sufficient ? remaining.toLocaleString() : `-${(credits - balance).toLocaleString()}`}
                </p>
              </div>
            </div>

            {/* Breakdown */}
            {Object.keys(breakdown).length > 0 && (
              <details className="mb-4">
                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                  Show calculation breakdown
                </summary>
                <div className="mt-2 text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-0.5 font-mono">
                  {Object.entries(breakdown).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-gray-500">{k}</span>
                      <span className="truncate text-right">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {!sufficient && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg mb-4">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400">
                  Not enough credits to run this action. Top up your balance before continuing.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 rounded-lg text-sm mb-4">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={onCancel}
                disabled={confirming}
                className="btn-secondary flex-1 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!sufficient || confirming}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-red-600">
            {error || 'Could not calculate estimate.'}
            <div className="mt-4">
              <button onClick={onCancel} className="btn-secondary">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
