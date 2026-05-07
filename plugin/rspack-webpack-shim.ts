import { execFileSync } from 'child_process';
import * as path from 'path';

execFileSync(process.execPath, [path.resolve(__dirname, 'scripts/patch-rspack-compat.js')], {
  stdio: 'inherit'
});
