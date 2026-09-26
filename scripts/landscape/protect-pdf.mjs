// Encrypt the PDF for a static site. Private original and password stay in Git's
// local metadata directory, never in public/ or in the repository's source tree.
// Run: node scripts/landscape/protect-pdf.mjs [path-to-new-edition.pdf]
// To rotate access, edit the private access.txt, then run this command again.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {webcrypto, randomBytes, createHash} from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {cwd:root,encoding:'utf8'}).trim();
const privateDir = path.join(gitDir, 'landscape-private');
const plainPublic = path.join(root, 'public/landscape/Denis-Daragan-Landscape.pdf');
const privateOriginal = path.join(privateDir, 'Denis-Daragan-Landscape.pdf');
const passwordFile = path.join(privateDir, 'access.txt');
const output = path.join(root, 'public/landscape/portfolio.enc');
const exists = file => fs.access(file).then(() => true, () => false);
const source = process.argv[2] ? path.resolve(process.argv[2]) : await exists(plainPublic) ? plainPublic : privateOriginal;
const bytes = await fs.readFile(source);
if (bytes.subarray(0,5).toString() !== '%PDF-') throw new Error('Source must be a PDF.');
await fs.mkdir(privateDir, {recursive:true,mode:0o700});
const fingerprint = createHash('sha256').update(bytes).digest('hex');
await fs.writeFile(path.join(privateDir, `${fingerprint}.pdf`), bytes, {flag:'wx',mode:0o600}).catch(error => {if (error.code !== 'EEXIST') throw error;});
await fs.writeFile(privateOriginal, bytes, {mode:0o600});
if (!await exists(passwordFile)) await fs.writeFile(passwordFile, randomBytes(12).toString('base64url').match(/.{1,4}/g).join('-')+'\n', {flag:'wx',mode:0o600});
const password = (await fs.readFile(passwordFile, 'utf8')).trim();
if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
const salt = randomBytes(16), iv = randomBytes(12), iterations = 600000;
const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await webcrypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']);
const header = Buffer.alloc(40);
header.write('DDPDF001', 0, 'ascii');
header.writeUInt32BE(iterations, 8);
salt.copy(header,12);
iv.copy(header,28);
const encrypted = await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:header}, key, bytes);
const verified = await webcrypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:header}, key, encrypted);
if (!Buffer.from(verified).equals(bytes)) throw new Error('Encryption verification failed.');
await fs.writeFile(output+'.tmp', Buffer.concat([header,Buffer.from(encrypted)]));
await fs.rename(output+'.tmp',output);
// An unencrypted public copy would bypass the password form.
if (await exists(plainPublic)) await fs.unlink(plainPublic);
console.log('Encrypted PDF verified. Original and password retained in local Git metadata.');
console.log(`PDF bytes: ${bytes.length}; SHA-256: ${fingerprint}`);
