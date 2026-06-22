#!/usr/bin/env node
/**
 * Pushes current Replit source code to GitHub via the GitHub REST API.
 * No git commands needed — works around Replit's git network sandbox.
 * Only uploads files that actually changed (compares git blob SHAs).
 *
 * Usage:  node scripts/push-to-github-api.mjs
 * Requires: GITHUB_TOKEN set in Replit Secrets
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';

const TOKEN = process.env.GITHUB_TOKEN;
const OWNER = 'MarcusHughes321';
const REPO  = 'GradeIQ-build';
const BRANCH = 'main';
const ROOT = process.cwd();

// ─── Paths to sync ────────────────────────────────────────────────────────────
const SYNC_PATHS = [
  'app', 'components', 'constants', 'hooks', 'lib',
  'server', 'shared', 'plugins', 'patches', 'scripts',
  'assets/images', 'assets/tier-icons', 'assets/grade-iq-logo.png',
  '.github',
  'app.json', 'eas.json', 'babel.config.js', 'metro.config.js',
  'package.json', 'package-lock.json', 'tsconfig.json', 'drizzle.config.ts',
  'eslint.config.js', 'replit.md', '.easignore', '.gitattributes', '.gitignore',
];

// ─── Never include ────────────────────────────────────────────────────────────
const EXCLUDE = new Set([
  'node_modules', '.git', '.expo', 'android', 'ios',
  'dist', 'web-build', 'server_dist', '.DS_Store', 'expo-env.d.ts',
  'set-image-cache',  // runtime image cache — never push to GitHub
]);

const MAX_FILE_BYTES = 5_000_000;

// ─── GitHub API helper ────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${msg.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Compute the SHA git would assign to a blob ───────────────────────────────
function gitBlobSha(buf) {
  const header = Buffer.from(`blob ${buf.length}\0`);
  const h = createHash('sha1');
  h.update(header);
  h.update(buf);
  return h.digest('hex');
}

// ─── Collect local files recursively ─────────────────────────────────────────
function collectFiles(srcPath, repoPath) {
  const files = [];
  let stat;
  try { stat = statSync(srcPath); } catch { return files; }
  if (EXCLUDE.has(basename(srcPath))) return files;

  if (stat.isDirectory()) {
    for (const entry of readdirSync(srcPath)) {
      files.push(...collectFiles(join(srcPath, entry), `${repoPath}/${entry}`));
    }
  } else {
    if (stat.size > MAX_FILE_BYTES) {
      console.log(`  ⚠  Skipping (>${MAX_FILE_BYTES / 1e6}MB): ${repoPath}`);
    } else {
      files.push({ local: srcPath, repo: repoPath });
    }
  }
  return files;
}

// ─── Upload one blob, with simple retry on rate-limit ────────────────────────
async function createBlob(content) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { sha } = await api('POST', '/git/blobs', {
        content: content.toString('base64'),
        encoding: 'base64',
      });
      return sha;
    } catch (e) {
      if (e.message.includes('403') && attempt < 3) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
      } else throw e;
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!TOKEN) {
    console.error('ERROR: GITHUB_TOKEN is not set in Replit Secrets.');
    process.exit(1);
  }

  const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo;
  console.log(`\n📦  Grade.IQ v${appJson.version} (Android versionCode ${appJson.android?.versionCode})`);
  console.log(`    → github.com/${OWNER}/${REPO} (${BRANCH})\n`);

  // 1 — get current main tip
  const ref        = await api('GET', `/git/ref/heads/${BRANCH}`);
  const headSha    = ref.object.sha;
  const headCommit = await api('GET', `/git/commits/${headSha}`);
  console.log(`  Base: ${headSha.slice(0, 7)} — "${headCommit.message.split('\n')[0]}"`);

  // 2 — get the full recursive tree from GitHub (one API call, gives us all current SHAs)
  console.log('  Fetching current file list from GitHub...');
  const remoteTree = await api('GET', `/git/trees/${headCommit.tree.sha}?recursive=1`);
  const remoteShas = {};
  for (const item of remoteTree.tree) {
    if (item.type === 'blob') remoteShas[item.path] = item.sha;
  }

  // 3 — collect local files and find what actually changed
  const allFiles = [];
  for (const p of SYNC_PATHS) {
    allFiles.push(...collectFiles(join(ROOT, p), p));
  }

  const changed = [];
  for (const f of allFiles) {
    const buf = readFileSync(f.local);
    if (gitBlobSha(buf) !== remoteShas[f.repo]) {
      changed.push({ ...f, buf });
    }
  }

  console.log(`  Local files: ${allFiles.length} | Changed: ${changed.length}\n`);

  if (changed.length === 0) {
    console.log('✅  Nothing changed — GitHub is already up to date.\n');
    return;
  }

  // Show what's changing
  for (const f of changed) {
    const status = remoteShas[f.repo] ? 'modified' : 'new     ';
    console.log(`  ${status}  ${f.repo}`);
  }
  console.log();

  // 4 — upload only the changed blobs, sequentially (avoids rate limits)
  const treeItems = [];
  for (let i = 0; i < changed.length; i++) {
    const f = changed[i];
    process.stdout.write(`\r  Uploading ${i + 1}/${changed.length}: ${f.repo.slice(0, 60).padEnd(60)}`);
    const sha = await createBlob(f.buf);
    treeItems.push({ path: f.repo, mode: '100644', type: 'blob', sha });
    // Small pause to stay well within secondary rate limits
    if (i < changed.length - 1) await new Promise(r => setTimeout(r, 200));
  }
  console.log('\n');

  // 5 — create new tree on top of the existing one
  const { sha: treeSha } = await api('POST', '/git/trees', {
    base_tree: headCommit.tree.sha,
    tree: treeItems,
  });

  // 6 — create commit
  const { sha: commitSha } = await api('POST', '/git/commits', {
    message: `Grade.IQ v${appJson.version} — Replit sync`,
    tree: treeSha,
    parents: [headSha],
  });

  // 7 — advance the branch ref
  await api('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commitSha, force: false });

  console.log(`✅  Pushed! Commit: ${commitSha.slice(0, 7)}`);
  console.log(`    https://github.com/${OWNER}/${REPO}/commit/${commitSha}`);
  console.log(`\n🔔  Android build Action will start automatically.\n`);
}

main().catch(err => {
  console.error(`\n❌  ${err.message}\n`);
  process.exit(1);
});
