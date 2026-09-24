import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Publishing writes a file into the checkout; the site only changes when that
// file reaches main on GitHub, where the Pages workflow builds it. This is the
// other half of the "to the site" button: commit the published files on their
// own and push HEAD to main. Fast-forward only - anything else is a merge for
// a person to look at, and the error says so.
//
// HEAD must hold nothing the site does not have yet: pushing HEAD:main from a
// branch with its own commits would put all of them live with the scene. The
// check runs before the scene is committed, so a refusal leaves the branch as
// it was and the published file written, as a failed push always did.
export async function deployPublishedHomeScene({ cwd, files, remote = 'origin', branch = 'main' }) {
  const git = async (args, timeout = 60000) => {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd, timeout, maxBuffer: 1 << 20 });
    return `${stdout}${stderr}`.trim();
  };
  const current = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  await git(['fetch', remote, branch], 180000);
  const ahead = Number(await git(['rev-list', '--count', `${remote}/${branch}..HEAD`]));
  if (ahead > 0) {
    throw new Error(`В ветке «${current}» ${ahead} коммит(ов), которых нет на сайте: «На сайт» выложил бы и их. `
      + 'Сцена записана в проект; на сайт её выложит агент, когда ветка будет слита в main и отправлена.');
  }
  await git(['add', '--', ...files]);
  const staged = await git(['diff', '--cached', '--name-only', '--', ...files]);
  let commit = null;
  if (staged) {
    await git(['commit', '--only', '-m', 'chore(home): publish authored scene', '--', ...files]);
    commit = await git(['rev-parse', '--short', 'HEAD']);
  }
  const push = await git(['push', remote, `HEAD:${branch}`], 180000);
  return { ok: true, branch: current, commit, head: await git(['rev-parse', '--short', 'HEAD']), push };
}
