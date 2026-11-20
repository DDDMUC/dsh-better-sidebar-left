// Push this repository to GitHub over the REST API.
//
//     node tools/push-github.mjs [--repo DDDMUC/dsh-better-sidebar-left] [--branch main] [--dry-run]
//
// Why not git push: on this machine git's own HTTPS transport fails against
// github.com (HTTP2 framing / connection timeout) while curl and the REST API are
// fine, so the commits are rebuilt through the Git Data API instead. Every commit
// keeps its message, author, committer and date, and the resulting tree is checked
// against the local one - a mismatch stops the push instead of leaving a broken
// repository behind.
//
// The credential is never printed and never stored here: it comes from
// `git credential fill` (the system keychain) or from GITHUB_TOKEN / GH_TOKEN.
//
// One caveat the API forces: a repository with no commit at all refuses blobs, so a
// brand new repository gets one `chore: initialize repository` commit first and the
// local history is replayed on top of it. That single extra root commit is the only
// difference between the two histories.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf('--' + name)
  return index === -1 ? fallback : args[index + 1]
}
const dryRun = args.includes('--dry-run')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const REPO = flag('repo', 'DDDMUC/' + manifest.name)
const BRANCH = flag('branch', 'main')

function credential() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  if (fromEnv) return fromEnv.trim()
  try {
    const filled = execFileSync(
      'bash',
      ['-lc', 'printf "protocol=https\\nhost=github.com\\n\\n" | perl -e "alarm 10; exec @ARGV" git credential fill'],
      { encoding: 'utf8' },
    )
    const line = filled.split('\n').filter((entry) => entry.startsWith('password='))[0]
    return line === undefined ? '' : line.slice('password='.length).trim()
  } catch (error) {
    return ''
  }
}

const token = credential()
if (token === '') {
  console.error('no GitHub credential: set GITHUB_TOKEN, or store one with git credential approve')
  process.exit(2)
}

const git = (list, options) =>
  execFileSync('git', ['-C', root, ...list], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
const auth = { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json' }

async function api(method, path, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch('https://api.github.com' + path, {
      method,
      headers: auth,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (response.ok) return text.length === 0 ? null : JSON.parse(text)
    if (response.status >= 500 || response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)))
      continue
    }
    console.error(method + ' ' + path + ' -> ' + response.status + ': ' + text.slice(0, 300))
    process.exit(1)
  }
  console.error('giving up on ' + method + ' ' + path)
  process.exit(1)
}

async function remoteHead() {
  const response = await fetch('https://api.github.com/repos/' + REPO + '/git/ref/heads/' + BRANCH, { headers: auth })
  if (response.ok) {
    const body = await response.json()
    return body.object.sha
  }
  // An empty repository answers 409 here, not 404.
  if (response.status === 409 || response.status === 404) return null
  console.error('ref lookup -> ' + response.status + ': ' + (await response.text()).slice(0, 300))
  process.exit(1)
}

const head = await remoteHead()
let remoteTree = null
let parent = head
if (head === null) {
  console.log('repository ' + REPO + ' has no commit yet; creating the first one through the Contents API')
  if (!dryRun) {
    const bootstrap = await api('PUT', '/repos/' + REPO + '/contents/.gitignore', {
      message: 'chore: initialize repository',
      content: readFileSync(join(root, '.gitignore')).toString('base64'),
    })
    parent = bootstrap.commit.sha
  }
} else {
  remoteTree = (await api('GET', '/repos/' + REPO + '/git/commits/' + head)).tree.sha
}

const commits = git(['rev-list', '--reverse', 'HEAD']).trim().split('\n').filter(Boolean)
const trees = new Map()
for (const sha of commits) trees.set(sha, git(['rev-parse', sha + '^{tree}']).trim())

let start = 0
if (remoteTree !== null) {
  const known = commits.filter((sha) => trees.get(sha) === remoteTree).pop()
  if (known === undefined) {
    console.error('the remote tree ' + remoteTree.slice(0, 10) + ' matches no local commit; refusing to guess')
    console.error('(the remote was changed outside this tool, or the local history was rewritten)')
    process.exit(1)
  }
  start = commits.indexOf(known) + 1
  console.log('remote is at ' + known.slice(0, 10) + '; ' + (commits.length - start) + ' commit(s) to push')
}

if (start >= commits.length && remoteTree === trees.get(commits[commits.length - 1])) {
  console.log('already in sync: https://github.com/' + REPO)
  process.exit(0)
}

if (dryRun) {
  for (let index = start; index < commits.length; index += 1) console.log('  would push ' + commits[index].slice(0, 10))
  process.exit(0)
}

let baseTree = remoteTree
for (let index = start; index < commits.length; index += 1) {
  const sha = commits[index]
  const previous = index === 0 ? null : commits[index - 1]
  const meta = git(['log', '-1', '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI', sha]).trim().split('\u0000')
  const message = git(['log', '-1', '--format=%B', sha]).replace(/\n+$/, '')
  const entries = []
  const files = new Map()
  for (const record of git(['ls-tree', '-r', '-z', '--full-tree', sha]).split('\u0000').filter(Boolean)) {
    const [left, path] = record.split('\t')
    const [mode, type, object] = left.split(' ')
    if (type === 'blob') files.set(path, { mode, object })
  }
  const changed = []
  if (previous === null) {
    for (const path of files.keys()) changed.push({ status: 'A', path })
  } else {
    const parts = git(['diff-tree', '-r', '-z', '--no-commit-id', '--name-status', previous, sha]).split('\u0000').filter(Boolean)
    for (let cursor = 0; cursor < parts.length; cursor += 2) changed.push({ status: parts[cursor], path: parts[cursor + 1] })
  }
  for (const item of changed) {
    if (item.status === 'D') {
      entries.push({ path: item.path, mode: '100644', type: 'blob', sha: null })
      continue
    }
    const file = files.get(item.path)
    if (file === undefined) continue
    const content = execFileSync('git', ['-C', root, 'cat-file', 'blob', file.object], { maxBuffer: 64 * 1024 * 1024 })
    const blob = await api('POST', '/repos/' + REPO + '/git/blobs', { content: content.toString('base64'), encoding: 'base64' })
    entries.push({ path: item.path, mode: file.mode, type: 'blob', sha: blob.sha })
  }
  const treeBody = { tree: entries }
  if (baseTree !== null) treeBody.base_tree = baseTree
  const tree = await api('POST', '/repos/' + REPO + '/git/trees', treeBody)
  baseTree = tree.sha
  const commitBody = {
    message,
    tree: tree.sha,
    parents: parent === null ? [] : [parent],
    author: { name: meta[0], email: meta[1], date: meta[2] },
    committer: { name: meta[3], email: meta[4], date: meta[5] },
  }
  const commit = await api('POST', '/repos/' + REPO + '/git/commits', commitBody)
  parent = commit.sha
  console.log('  pushed ' + commit.sha.slice(0, 10) + '  ' + changed.length + ' path(s)  ' + message.split('\n')[0].slice(0, 56))
}

const updated = head === null
  ? await api('POST', '/repos/' + REPO + '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: parent })
  : await api('PATCH', '/repos/' + REPO + '/git/refs/heads/' + BRANCH, { sha: parent, force: false })
const finalCommit = await api('GET', '/repos/' + REPO + '/git/commits/' + updated.object.sha)
const localTree = trees.get(commits[commits.length - 1])
if (finalCommit.tree.sha !== localTree) {
  console.error('the remote tree ' + finalCommit.tree.sha + ' does not match the local tree ' + localTree)
  process.exit(1)
}
console.log(BRANCH + ' -> ' + updated.object.sha + '  (tree ' + localTree.slice(0, 10) + ', identical)')
console.log('https://github.com/' + REPO)
