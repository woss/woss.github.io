// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Classifier label for a seed query */
export type QueryClass = 'tool' | 'rag' | 'hybrid';

/** A seed query with its classification label */
export interface SeedQuery {
  text: string;
  class: QueryClass;
  suggested?: number;
}

// ---------------------------------------------------------------------------
// Suggested questions — shown as prompts on the front page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Seed queries — representative examples for centroid classifier training
// ---------------------------------------------------------------------------

export const SEED_QUERIES: SeedQuery[] = [
  // Tool queries
  { text: "Show me Daniel's pull requests", class: 'tool', suggested: 2 },
  { text: 'Search GitHub for my repositories', class: 'tool' },
  { text: 'Find my open issues on GitHub', class: 'tool' },
  { text: 'What commits has Daniel made', class: 'tool' },
  { text: "Tell me about Daniel's experience with blockchain", class: 'tool', suggested: 5 },
  { text: 'How many stars does woss-io have', class: 'tool' },
  { text: 'Show me the open issues on this project', class: 'tool' },
  { text: 'Who contributed to woss-io recently', class: 'tool' },
  { text: "Search GitHub for Daniel's open source contributions", class: 'tool', suggested: 6 },

  // RAG queries
  { text: "Describe Daniel's work experience", class: 'rag' },
  { text: 'What projects did Daniel found', class: 'rag' },
  { text: "Tell me about Daniel's background", class: 'rag' },
  { text: 'What skills and technologies does Daniel use', class: 'rag' },
  { text: 'Where has Daniel worked before', class: 'rag' },
  { text: "Tell me about Daniel's experience with copyrights and IP?", class: 'rag', suggested: 1 },
  { text: "Describe Daniel's career journey", class: 'rag' },
  { text: 'What projects has Daniel founded?', class: 'rag', suggested: 3 },
  { text: 'What DevOps and cloud experience does Daniel have?', class: 'rag', suggested: 7 },

  // Personal development queries
  { text: 'How has Daniel grown as a software developer', class: 'rag' },
  { text: 'What did Daniel learn building Anagolay Network', class: 'rag' },
  { text: "Tell me about Daniel's entrepreneurial journey", class: 'rag' },
  { text: 'What leadership lessons did Daniel learn at Kelp Digital', class: 'rag' },
  { text: "How did Daniel's platform engineering skills grow at Ipsos", class: 'rag' },
  { text: 'What did Daniel learn from being a digital nomad', class: 'rag' },
  { text: 'How did Daniel develop his data visualization skills', class: 'rag' },
  { text: 'What did Daniel learn from his first startup at Biddl', class: 'rag' },

  // Ambiguous — could be either
  { text: "Daniel's experience and his recent PRs", class: 'hybrid' },
  { text: 'What open source projects has Daniel contributed to', class: 'hybrid' },
  { text: 'Tell me about Daniel and his GitHub activity', class: 'hybrid' },
  { text: 'What grants has Daniel received', class: 'hybrid', suggested: 4 },
];

export const SUGGESTED_QUESTIONS: string[] = SEED_QUERIES.filter((q) => q.suggested).map((q) => q.text);
