import { describe, expect, it } from 'vitest';
import {
  buildTagMask,
  calculateRatingAverage,
  getReputationBadges,
  getTagsFromMask,
} from './reputation';

describe('reputation utilities', () => {
  it('converts selected tags to and from the on-chain bit mask', () => {
    const mask = buildTagMask([0, 2, 4]);
    expect(mask).toBe(21);
    expect(getTagsFromMask(mask).map((tag) => tag.id)).toEqual([0, 2, 4]);
  });

  it('calculates averages without inventing a score for new carriers', () => {
    expect(calculateRatingAverage(0, 0)).toBeNull();
    expect(calculateRatingAverage(4, 18)).toBe(4.5);
  });

  it('applies badge minimum sample sizes', () => {
    expect(getReputationBadges({ completedDeliveries: 0 })).toEqual(['New carrier']);
    expect(getReputationBadges({
      completedDeliveries: 10,
      ratingCount: 5,
      averageRating: 4.6,
      onTimeRate: 90,
    })).toEqual([
      'Verified carrier',
      'Experienced carrier',
      'Highly rated',
      'Reliable timing',
    ]);
  });
});
