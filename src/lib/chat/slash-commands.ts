export interface SlashCommandDef {
  name: string;
  triggers: string[];
  description: string;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'contact',    triggers: ['/contact'],             description: 'Show contact form' },
  { name: 'summarize',  triggers: ['/summarize'],           description: 'Summarize conversation' },
  { name: 'export_md',  triggers: ['/export_md'],           description: 'Export chat as Markdown' },
  { name: 'export_json', triggers: ['/export_json'],         description: 'Export chat as JSON' },
  { name: 'show_posts',     triggers: ['/show posts'],          description: 'Show posts page' },
  { name: 'show_experience', triggers: ['/show experience'],    description: 'Show experience page' },
  { name: 'about',          triggers: ['/about'],               description: 'About me' },
  { name: 'show_chats',     triggers: ['/show chats'],          description: 'Open chat sidebar' },
];

export function matchSlashCommand(input: string): SlashCommandDef | undefined {
  return SLASH_COMMANDS.find(cmd => cmd.triggers.includes(input));
}
