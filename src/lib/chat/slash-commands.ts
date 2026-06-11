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
];

export function matchSlashCommand(input: string): SlashCommandDef | undefined {
  return SLASH_COMMANDS.find(cmd => cmd.triggers.includes(input));
}
