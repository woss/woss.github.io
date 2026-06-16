import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const interRegular = readFileSync(join(process.cwd(), 'static/fonts/Inter-Regular.ttf'));
