export interface TourDefinition {
  featureId: string;
  targetSelector: string;
  title: string;
  content: string;
}

export const TOUR_DEFINITIONS: TourDefinition[] = [
  {
    featureId: 'slash-commands',
    targetSelector: '#slash-commands',
    title: 'Navigation via /',
    content:
      "There's no nav bar on this page. All navigation uses slash commands. Try /home, /show_posts, or press the / button to browse all commands.",
  },
];
