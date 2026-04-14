import { Lock, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import TierBadge from './TierBadge';
import useFeature from '../hooks/useFeature';

/**
 * Renders a locked-feature upsell panel.  Two variants:
 *
 *   <FeatureLock feature="ai_doc_extract" />
 *     → full-card panel with a big lock icon, the feature label, and an
 *       "Upgrade to Professional" CTA.  Use this to replace the body of a
 *       page or tab when the user isn't entitled.
 *
 *   <FeatureLock feature="ai_doc_extract" variant="inline" />
 *     → small inline badge (lock icon + tier pill) — use this next to a
 *       menu item or button.
 *
 * Wraps useFeature() so callers only need to pass the feature key.
 */
export default function FeatureLock({
  feature,
  variant = 'card',
  title,
  description,
  className = '',
}) {
  const { allowed, requiredTier, requiredTierName, featureLabel, tierLabel } = useFeature(feature);
  if (allowed) return null;

  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <Lock className="w-3 h-3 text-gray-400" />
        <TierBadge tier={requiredTier} size="sm" />
      </span>
    );
  }

  return (
    <div className={`card text-center py-10 px-6 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-100 to-amber-100 dark:from-brand-950 dark:to-amber-950 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-8 h-8 text-brand-600 dark:text-brand-400" />
      </div>
      <TierBadge tier={requiredTier} size="md" className="mb-3" />
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
        {title || `${featureLabel} is a ${requiredTierName} feature`}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-md mx-auto">
        {description ||
          `You're currently on the ${tierLabel} plan. Upgrade to ${requiredTierName} to unlock ${featureLabel.toLowerCase()} and the rest of the ${requiredTierName} feature set.`}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <Link to="/settings?tab=plan" className="btn-primary inline-flex items-center gap-2">
          Upgrade plan <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
