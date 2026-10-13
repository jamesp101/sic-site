/**
 * Creates a superadmin, or resets the password of an existing user and makes them superadmin.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" [ADMIN_PASSWORD=…] tsx prisma/create-admin.ts
 *
 * Without ADMIN_PASSWORD the password is prompted on a terminal (not echoed). It is never printed.
 * Uses DATABASE_URL, so point it at the target database (e.g. the direct Neon URL).
 */
import { db } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/password';

const MIN_PASSWORD_LENGTH = 12;

function promptHidden(question: string): Promise<string> {
    const { stdin, stdout } = process;
    return new Promise((resolve, reject) => {
        stdout.write(question);
        let value = '';
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        const onData = (chunk: string) => {
            for (const char of chunk) {
                if (char === '\r' || char === '\n' || char === '\u0004') {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.off('data', onData);
                    stdout.write('\n');
                    return resolve(value);
                }
                if (char === '\u0003') {
                    stdin.setRawMode(false);
                    return reject(new Error('Cancelled'));
                }
                if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
                else value += char;
            }
        };
        stdin.on('data', onData);
    });
}

async function readPassword(): Promise<string> {
    if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
    if (!process.stdin.isTTY) throw new Error('Set ADMIN_PASSWORD or run on a terminal to be prompted.');
    const first = await promptHidden('Password: ');
    const second = await promptHidden('Repeat password: ');
    if (first !== second) throw new Error('Passwords do not match.');
    return first;
}

async function main() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const name = process.env.ADMIN_NAME?.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        throw new Error('Set ADMIN_EMAIL to a valid email address.');

    const existing = await db.user.findUnique({ where: { email } });
    if (!existing && !name) throw new Error('Set ADMIN_NAME to create a new user.');

    const password = await readPassword();
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`The password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const hash = await hashPassword(password);

    const user = await db.$transaction(async (tx) => {
        const data = {
            role: 'superadmin',
            departmentId: null,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            password: hash,
        };
        const saved = existing
            ? await tx.user.update({ where: { id: existing.id }, data: { ...data, ...(name ? { name } : {}) } })
            : await tx.user.create({ data: { ...data, name: name as string, email } });
        const account = await tx.account.findFirst({ where: { userId: saved.id, providerId: 'credential' } });
        if (account) await tx.account.update({ where: { id: account.id }, data: { password: hash } });
        else {
            await tx.account.create({
                data: { userId: saved.id, accountId: String(saved.id), providerId: 'credential', password: hash },
            });
        }
        // A reset must sign out sessions opened with the old password.
        await tx.session.deleteMany({ where: { userId: saved.id } });
        return saved;
    });

    console.log(`${existing ? 'Updated' : 'Created'} superadmin ${user.email} (id ${user.id}).`);
}

main()
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
