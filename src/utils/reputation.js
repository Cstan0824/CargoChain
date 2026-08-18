export const REPUTATION_TAGS = [
  { id: 0, label: 'Good communication', tone: 'positive' },
  { id: 1, label: 'Clear milestone updates', tone: 'positive' },
  { id: 2, label: 'Careful cargo handling', tone: 'positive' },
  { id: 3, label: 'Responsive', tone: 'positive' },
  { id: 4, label: 'Professional service', tone: 'positive' },
  { id: 5, label: 'Communication could improve', tone: 'improvement' },
  { id: 6, label: 'Milestone updates could improve', tone: 'improvement' },
  { id: 7, label: 'Cargo handling concern', tone: 'improvement' },
];

export const MAX_REPUTATION_TAGS = 3;

export function buildTagMask(selectedTagIds = []) {
  return selectedTagIds.reduce((mask, tagId) => mask | (1 << Number(tagId)), 0);
}

export function getTagsFromMask(tagMask) {
  const mask = Number(tagMask || 0);
  return REPUTATION_TAGS.filter((tag) => (mask & (1 << tag.id)) !== 0);
}

export function calculateRatingAverage(ratingCount, totalScore) {
  const count = Number(ratingCount || 0);
  if (count === 0) return null;
  return Number(totalScore || 0) / count;
}

export function formatRatingAverage(average) {
  return average == null ? 'New' : average.toFixed(1);
}

export function getReputationBadges({
  completedDeliveries = 0,
  ratingCount = 0,
  averageRating = null,
  onTimeRate = null,
}) {
  const badges = [];
  if (completedDeliveries === 0) badges.push('New carrier');
  if (completedDeliveries >= 1) badges.push('Verified carrier');
  if (completedDeliveries >= 10) badges.push('Experienced carrier');
  if (ratingCount >= 5 && averageRating >= 4.5) badges.push('Highly rated');
  if (completedDeliveries >= 5 && onTimeRate >= 90) badges.push('Reliable timing');
  return badges;
}
