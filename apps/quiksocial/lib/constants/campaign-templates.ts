// Ready-made campaign templates — maintained by super admin.
// These are hardcoded system templates; no DB round-trip needed.

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  /** Emoji icon shown on the card */
  icon: string;
  /** Accent gradient class for the card banner */
  gradient: string;
  objective: string;
  /** daily | alternate | weekly | monthly */
  frequency: string;
  /** Suggested total post count */
  suggestedPostCount: number;
  /** Pre-filled concept direction (shown in textarea placeholder) */
  conceptDirection: string;
  /** Tags shown below the description */
  tags: string[];
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'new-product-launch',
    name: 'New Product Launch',
    description: 'Build anticipation and drive awareness for an upcoming product release.',
    icon: '🚀',
    gradient: 'from-violet-500/30 to-purple-600/20',
    objective: 'Promotional',
    frequency: 'daily',
    suggestedPostCount: 14,
    conceptDirection:
      'Tease the product with mystery posts in week 1, reveal features in week 2, launch with a strong CTA.',
    tags: ['Promotional', 'Daily', '14 posts'],
  },
  {
    id: 'seasonal-sale',
    name: 'Seasonal Sale',
    description: 'Maximize revenue with urgency-driven content around a limited-time offer.',
    icon: '🎁',
    gradient: 'from-rose-500/30 to-orange-500/20',
    objective: 'Promotional',
    frequency: 'daily',
    suggestedPostCount: 10,
    conceptDirection:
      'Open with discount announcement, follow with product highlights, close with countdown urgency posts.',
    tags: ['Promotional', 'Daily', '10 posts'],
  },
  {
    id: 'festival-campaign',
    name: 'Festival Campaign',
    description: 'Leverage cultural moments and holidays to connect with your audience.',
    icon: '🎉',
    gradient: 'from-amber-500/30 to-yellow-400/20',
    objective: 'Festival/Event',
    frequency: 'alternate',
    suggestedPostCount: 8,
    conceptDirection:
      'Greet the festival, share themed product pairings, and wrap with a celebration post.',
    tags: ['Festival/Event', 'Alternate days', '8 posts'],
  },
  {
    id: 'brand-awareness',
    name: 'Brand Awareness',
    description: 'Consistent storytelling to grow recognition and build a loyal audience.',
    icon: '⭐',
    gradient: 'from-sky-500/30 to-blue-600/20',
    objective: 'Brand Awareness',
    frequency: 'weekly',
    suggestedPostCount: 12,
    conceptDirection:
      'Alternate between brand story, behind-the-scenes, team spotlights, and community content.',
    tags: ['Brand Awareness', 'Weekly', '12 posts'],
  },
  {
    id: 'product-education',
    name: 'Product Education',
    description: 'Build authority by teaching your audience how to get the most from your products.',
    icon: '📚',
    gradient: 'from-emerald-500/30 to-teal-600/20',
    objective: 'Engagement',
    frequency: 'weekly',
    suggestedPostCount: 8,
    conceptDirection:
      'Tips series: how-to posts, feature spotlights, before/after results, and FAQ posts.',
    tags: ['Engagement', 'Weekly', '8 posts'],
  },
  {
    id: 'customer-testimonial',
    name: 'Customer Testimonial',
    description: 'Convert prospects with real customer stories and social proof.',
    icon: '💬',
    gradient: 'from-pink-500/30 to-fuchsia-600/20',
    objective: 'Brand Awareness',
    frequency: 'alternate',
    suggestedPostCount: 6,
    conceptDirection:
      'Feature one customer story per post — quote, result, and product used. End with a CTA.',
    tags: ['Brand Awareness', 'Alternate days', '6 posts'],
  },
];

export function getTemplateById(id: string): CampaignTemplate | undefined {
  return CAMPAIGN_TEMPLATES.find((t) => t.id === id);
}
