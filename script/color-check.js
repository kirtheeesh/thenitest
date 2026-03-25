#!/usr/bin/env node
// Lightweight colorized wrapper around `tsc --noEmit` to make errors/warnings easier to spot in console
// No external deps required — uses ANSI color codes
const { spawn } = require('child_process');

const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const CYAN = '\u001b[36m';
const RESET = '\u001b[0m';

function colorizeLine(line) {
  const lower = line.toLowerCase();
  if (/error/.test(lower) || /:\s*error\s/.test(lower) || /ts\d+:/i.test(line)) {
    return RED + line + RESET;
  }
  if (/warning/.test(lower)) {
    return YELLOW + line + RESET;
  }
  // highlight file paths like src/foo.ts:123:45
  if (/\w:\\|\/.+\.tsx?:\d+:\d+/.test(line)) {
    return CYAN + line + RESET;
  }
  return line;
}

function runTsc() {
  return new Promise((resolve) => {
    console.log('\nRunning TypeScript check (tsc --noEmit) ...\n');
    const proc = spawn('npx', ['tsc', '--noEmit'], { shell: true });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      text.split(/\r?\n/).forEach((l) => {
        if (l.trim()) console.log(colorizeLine(l));
      });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      text.split(/\r?\n/).forEach((l) => {
        if (l.trim()) console.error(colorizeLine(l));
      });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('\n\u001b[32mTypeScript: no errors\u001b[0m\n');
      } else {
        console.log(`\n${RED}TypeScript exited with code ${code}${RESET}\n`);
      }
      resolve(code);
    });
  });
}

(async () => {
  const code = await runTsc();
  // exit with the same code so CI can pick it up
  process.exit(code);
})();
