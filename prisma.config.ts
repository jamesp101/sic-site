import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';
import { providerFromUrl } from './prisma/provider.mjs';

const provider = providerFromUrl(process.env.DATABASE_URL);

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        // Migrations are provider-specific SQL, so each provider keeps its own history.
        path: `prisma/migrations/${provider}`,
        seed: 'tsx prisma/seed.ts',
    },
    datasource: { url: env('DATABASE_URL') },
});
